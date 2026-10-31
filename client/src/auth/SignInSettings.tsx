import { useI18n } from "../i18n/I18nProvider";
import { registerPasskey } from "./authApi";
import { useSignedIn } from "./AuthGate";
import { useStep } from "./useStep";

/** Adding a passkey (e.g. for a second device), a new recovery code and signing out, until Settings exist. */
export function SignInSettings() {
  const { t } = useI18n();
  const signedIn = useSignedIn();
  const { busy, message, run } = useStep();

  return (
    <div className="sign-in-settings">
      <button
        type="button"
        className="button-text"
        disabled={busy}
        onClick={() => run(async () => void (await registerPasskey()), { refused: "auth.problem.createPasskey", done: "settings.passkeyAdded" })}
      >
        {t("settings.addPasskey")}
      </button>
      <button
        type="button"
        className="button-text"
        disabled={busy}
        onClick={() => run(signedIn.showNewRecoveryCode, { refused: "settings.problem.recoveryCode" })}
      >
        {t("settings.newRecoveryCode")}
      </button>
      <button type="button" className="button-text" disabled={busy} onClick={() => run(signedIn.signOut, { refused: "settings.problem.signOut" })}>
        {t("settings.signOut")}
      </button>
      {message && (
        <p className="sign-in-settings-message" role="status">
          {t(message)}
        </p>
      )}
    </div>
  );
}
