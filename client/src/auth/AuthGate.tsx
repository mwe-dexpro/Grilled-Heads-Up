import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/i18n";
import { fetchSession, newRecoveryCode, registerPasskey, signInWithPasskey, signInWithRecoveryCode, signOut } from "./authApi";
import { loadSignedIn, saveSignedIn, startScreen } from "./session";
import { useStep } from "./useStep";

type Stage =
  | { name: "checking" }
  | { name: "setup" }
  | { name: "signIn"; unreachable?: boolean }
  /** Shown first, before anything that could be interrupted, since the server already replaced the old code. */
  | { name: "recoveryCode"; recoveryCode: string; then: "app" | "newPasskey" }
  /** Signed in with the recovery code: offer a passkey for this device. */
  | { name: "newPasskey" }
  | { name: "app" };

/** What the signed-in Owner can do about signing in, from inside the app. */
interface SignedIn {
  /** Replaces the recovery code and shows the new one once. */
  showNewRecoveryCode(): Promise<void>;
  signOut(): Promise<void>;
}

const SignedInContext = createContext<SignedIn | null>(null);

export function useSignedIn(): SignedIn {
  const signedIn = useContext(SignedInContext);
  if (!signedIn) throw new Error("useSignedIn must be used inside <AuthGate>");
  return signedIn;
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

  const enter = useCallback((next: Stage) => {
    rememberSignedIn(true);
    setStage(next);
  }, []);

  const signedIn: SignedIn = {
    async showNewRecoveryCode() {
      const { recoveryCode } = await newRecoveryCode();
      setStage({ name: "recoveryCode", recoveryCode, then: "app" });
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
          onRegistered={(recoveryCode) => enter(recoveryCode ? { name: "recoveryCode", recoveryCode, then: "app" } : { name: "app" })}
        />
      );
    case "signIn":
      return (
        <SignInScreen
          unreachable={stage.unreachable ?? false}
          onSignedIn={() => enter({ name: "app" })}
          onRecovered={(recoveryCode) => enter({ name: "recoveryCode", recoveryCode, then: "newPasskey" })}
        />
      );
    case "recoveryCode":
      return <RecoveryCodeScreen recoveryCode={stage.recoveryCode} onDone={() => setStage(stage.then === "app" ? { name: "app" } : { name: "newPasskey" })} />;
    case "newPasskey":
      return <NewPasskeyScreen onDone={() => setStage({ name: "app" })} />;
    case "app":
      return <SignedInContext.Provider value={signedIn}>{children}</SignedInContext.Provider>;
  }
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
  const { busy, message, run } = useStep();

  return (
    <AuthScreen title={t("auth.welcome")}>
      <p className="auth-text">{t("auth.setupText")}</p>
      <div className="actions">
        <button
          type="button"
          className="button-primary"
          disabled={busy}
          onClick={() => run(async () => onRegistered((await registerPasskey()).recoveryCode), { refused: "auth.problem.createPasskey" })}
        >
          {t("auth.createPasskey")}
        </button>
      </div>
      <Problem text={message} />
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
    recovery.run(async () => onRecovered((await signInWithRecoveryCode(code)).recoveryCode), { refused: "auth.problem.code" });
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
            }, { refused: "auth.problem.signIn" })
          }
        >
          {t("auth.signInWithPasskey")}
        </button>
      </div>
      <Problem text={passkey.message} />

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
        <Problem text={recovery.message} />
      </form>
    </AuthScreen>
  );
}

function NewPasskeyScreen({ onDone }: { onDone(): void }) {
  const { t } = useI18n();
  const { busy, message, run } = useStep();

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
            }, { refused: "auth.problem.createPasskey" })
          }
        >
          {t("auth.createPasskey")}
        </button>
        <button type="button" className="button-text" onClick={onDone}>
          {t("auth.notNow")}
        </button>
      </div>
      <Problem text={message} />
    </AuthScreen>
  );
}

function RecoveryCodeScreen({ recoveryCode, onDone }: { recoveryCode: string; onDone(): void }) {
  const { t } = useI18n();

  return (
    <AuthScreen title={t("auth.codeTitle")}>
      <p className="card recovery-code">{recoveryCode}</p>
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
