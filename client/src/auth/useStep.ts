import { useState } from "react";
import type { TranslationKey } from "../i18n/i18n";
import { AuthError, type AuthProblem } from "./authApi";

/** The text for a problem; a cancelled passkey prompt needs none. */
function problemKey(problem: AuthProblem, refused: TranslationKey): TranslationKey | null {
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

/**
 * Runs a sign-in step, keeping track of whether it is under way and of the message to show after:
 * `done` when it worked, the problem when it didn't (`refused` when the server said no).
 */
export function useStep() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<TranslationKey | null>(null);

  async function run(step: () => Promise<void>, { refused, done = null }: { refused: TranslationKey; done?: TranslationKey | null }) {
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

  return { busy, message, run };
}
