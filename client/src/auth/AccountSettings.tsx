import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/i18n";
import { AuthError } from "./authApi";
import { problemKey, useAccount } from "./AuthGate";

/** Adding a passkey (e.g. for a second device) and signing out, until Settings exist. */
export function AccountSettings() {
  const { t } = useI18n();
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<TranslationKey | null>(null);

  async function run(step: () => Promise<void>, done: TranslationKey | null, refused: TranslationKey) {
    setBusy(true);
    setMessage(null);
    try {
      await step();
      setMessage(done);
    } catch (error) {
      setMessage(problemKey(error instanceof AuthError ? error.problem : "refused", refused));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account">
      <button type="button" className="button-text" disabled={busy} onClick={() => run(account.addPasskey, "account.passkeyAdded", "auth.problem.setup")}>
        {t("account.addPasskey")}
      </button>
      <button type="button" className="button-text" disabled={busy} onClick={() => run(account.signOut, null, "account.problem.signOut")}>
        {t("account.signOut")}
      </button>
      {message && (
        <p className="account-message" role="status">
          {t(message)}
        </p>
      )}
    </div>
  );
}
