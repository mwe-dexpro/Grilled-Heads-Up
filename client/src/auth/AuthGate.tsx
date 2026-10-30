import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/i18n";
import { AuthError, fetchSession, registerPasskey, signInWithPasskey, signInWithRecoveryCode, signOut, type AuthProblem } from "./authApi";
import { loadSignedIn, saveSignedIn, startScreen } from "./session";

type Stage =
  | { name: "checking" }
  | { name: "setup" }
  | { name: "signIn"; unreachable?: boolean }
  /** Signed in with the recovery code: offer a passkey for this device, then show the new code. */
  | { name: "newPasskey"; recoveryCode: string }
  | { name: "recoveryCode"; code: string }
  | { name: "app" };

interface Account {
  /** Adds a passkey for this device to the signed-in owner. */
  addPasskey(): Promise<void>;
  signOut(): Promise<void>;
}

const AccountContext = createContext<Account | null>(null);

export function useAccount(): Account {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount must be used inside <AuthGate>");
  return account;
}

function wasSignedIn(): boolean {
  try {
    return loadSignedIn(localStorage);
  } catch {
    return false;
  }
}

function rememberSignedIn(signedIn: boolean) {
  try {
    saveSignedIn(localStorage, signedIn);
  } catch {
    // Storage can be unavailable (private mode); then the app asks the server on every start.
  }
}

/** Shows the app only when signed in: first-launch setup, sign-in or the recovery code otherwise (ADR-0006). */
export function AuthGate({ children }: { children: ReactNode }) {
  // A device that was signed in opens straight into the app, also offline; the server confirms in the background.
  const [stage, setStage] = useState<Stage>(() => (wasSignedIn() ? { name: "app" } : { name: "checking" }));

  useEffect(() => {
    let cancelled = false;
    fetchSession().then(
      (status) => {
        if (cancelled) return;
        rememberSignedIn(status.signedIn);
        const screen = startScreen(status, false);
        // Only replaces what the check was standing in for, never a screen the person has moved on to.
        setStage((current) => (current.name === "checking" || current.name === "app" ? { name: screen } : current));
      },
      () => {
        if (cancelled) return;
        setStage((current) => (current.name === "checking" ? { name: "signIn", unreachable: true } : current));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const signedIn = useCallback((next: Stage) => {
    rememberSignedIn(true);
    setStage(next);
  }, []);

  const account: Account = {
    async addPasskey() {
      await registerPasskey();
    },
    async signOut() {
      await signOut();
      rememberSignedIn(false);
      setStage({ name: "signIn" });
    },
  };

  switch (stage.name) {
    case "checking":
      return null;
    case "setup":
      return (
        <SetupScreen
          onRegistered={(recoveryCode) => signedIn(recoveryCode ? { name: "recoveryCode", code: recoveryCode } : { name: "app" })}
        />
      );
    case "signIn":
      return (
        <SignInScreen
          unreachable={stage.unreachable ?? false}
          onSignedIn={() => signedIn({ name: "app" })}
          onRecovered={(recoveryCode) => signedIn({ name: "newPasskey", recoveryCode })}
        />
      );
    case "newPasskey":
      return <NewPasskeyScreen onDone={() => setStage({ name: "recoveryCode", code: stage.recoveryCode })} />;
    case "recoveryCode":
      return <RecoveryCodeScreen code={stage.code} onDone={() => setStage({ name: "app" })} />;
    case "app":
      return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
  }
}

/** The text for a problem; a cancelled passkey prompt needs none. */
export function problemKey(problem: AuthProblem, refused: TranslationKey): TranslationKey | null {
  switch (problem) {
    case "cancelled":
      return null;
    case "exists":
      return "auth.problem.exists";
    case "unreachable":
      return "auth.problem.unreachable";
    case "refused":
      return refused;
  }
}

/** Runs a sign-in step, keeping track of whether it is under way and what went wrong. */
function useStep() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<TranslationKey | null>(null);

  async function run(step: () => Promise<void>, refused: TranslationKey) {
    setBusy(true);
    setProblem(null);
    try {
      await step();
    } catch (error) {
      setProblem(problemKey(error instanceof AuthError ? error.problem : "refused", refused));
    } finally {
      setBusy(false);
    }
  }

  return { busy, problem, run };
}

function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="screen auth-screen">
      <header className="detail-header">
        <p className="eyebrow">{t("app.title")}</p>
        <h1 className="large-title">{title}</h1>
      </header>
      {children}
    </div>
  );
}

function Problem({ text }: { text: TranslationKey | null }) {
  const { t } = useI18n();
  return text ? (
    <p className="problem" role="alert">
      {t(text)}
    </p>
  ) : null;
}

function SetupScreen({ onRegistered }: { onRegistered(recoveryCode: string | null): void }) {
  const { t } = useI18n();
  const { busy, problem, run } = useStep();

  return (
    <AuthScreen title={t("auth.welcome")}>
      <p className="auth-text">{t("auth.setupText")}</p>
      <div className="actions">
        <button
          type="button"
          className="button-primary"
          disabled={busy}
          onClick={() => run(async () => onRegistered((await registerPasskey()).recoveryCode), "auth.problem.setup")}
        >
          {t("auth.createPasskey")}
        </button>
      </div>
      <Problem text={problem} />
    </AuthScreen>
  );
}

function SignInScreen({
  unreachable,
  onSignedIn,
  onRecovered,
}: {
  unreachable: boolean;
  onSignedIn(): void;
  onRecovered(recoveryCode: string): void;
}) {
  const { t } = useI18n();
  const passkey = useStep();
  const recovery = useStep();
  const [code, setCode] = useState("");

  function handleRecover(event: FormEvent) {
    event.preventDefault();
    if (code.trim() === "") return;
    recovery.run(async () => onRecovered((await signInWithRecoveryCode(code)).recoveryCode), "auth.problem.code");
  }

  return (
    <AuthScreen title={t("auth.signIn")}>
      {unreachable && <p className="auth-text">{t("auth.problem.unreachable")}</p>}
      <div className="actions">
        <button
          type="button"
          className="button-primary"
          disabled={passkey.busy}
          onClick={() =>
            passkey.run(async () => {
              await signInWithPasskey();
              onSignedIn();
            }, "auth.problem.signIn")
          }
        >
          {t("auth.signInWithPasskey")}
        </button>
      </div>
      <Problem text={passkey.problem} />

      <form className="auth-recovery" onSubmit={handleRecover}>
        <h2 className="section-title">{t("auth.lostPasskey")}</h2>
        <div className="card form-card">
          <label className="field">
            <span className="visually-hidden">{t("auth.recoveryCode")}</span>
            <input
              className="recovery-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("auth.recoveryCode")}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="button-ghost" disabled={recovery.busy}>
            {t("auth.signInWithCode")}
          </button>
        </div>
        <Problem text={recovery.problem} />
      </form>
    </AuthScreen>
  );
}

function NewPasskeyScreen({ onDone }: { onDone(): void }) {
  const { t } = useI18n();
  const { busy, problem, run } = useStep();

  return (
    <AuthScreen title={t("auth.newPasskeyTitle")}>
      <p className="auth-text">{t("auth.newPasskeyText")}</p>
      <div className="actions">
        <button
          type="button"
          className="button-primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await registerPasskey();
              onDone();
            }, "auth.problem.setup")
          }
        >
          {t("auth.createPasskey")}
        </button>
        <button type="button" className="button-text" onClick={onDone}>
          {t("auth.notNow")}
        </button>
      </div>
      <Problem text={problem} />
    </AuthScreen>
  );
}

function RecoveryCodeScreen({ code, onDone }: { code: string; onDone(): void }) {
  const { t } = useI18n();

  return (
    <AuthScreen title={t("auth.codeTitle")}>
      <p className="card recovery-code">{code}</p>
      <p className="auth-text">{t("auth.codeText")}</p>
      <div className="actions no-print">
        <button type="button" className="button-ghost" onClick={() => window.print()}>
          {t("auth.print")}
        </button>
        <button type="button" className="button-primary" onClick={onDone}>
          {t("auth.codeStored")}
        </button>
      </div>
    </AuthScreen>
  );
}
