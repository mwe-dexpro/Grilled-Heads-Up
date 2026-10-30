import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { SessionStatus } from "./session";

/**
 * Why a sign-in step didn't work: the person cancelled the passkey prompt, this device already has a
 * passkey, the server said no, or it couldn't be reached.
 */
export type AuthProblem = "cancelled" | "exists" | "refused" | "unreachable";

export class AuthError extends Error {
  constructor(readonly problem: AuthProblem) {
    super(problem);
  }
}

async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthError("unreachable");
  }
  if (!response.ok) throw new AuthError("refused");
  return response;
}

/** Runs the browser's passkey prompt; a cancelled or timed-out prompt is not an error worth showing. */
async function prompt<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "InvalidStateError") throw new AuthError("exists");
    if (name === "NotAllowedError" || name === "AbortError") throw new AuthError("cancelled");
    throw new AuthError("refused");
  }
}

export async function fetchSession(): Promise<SessionStatus> {
  const response = await call("GET", "session");
  return (await response.json()) as SessionStatus;
}

/**
 * Registers a passkey on this device. The first one creates the owner and signs in, and the server
 * returns the recovery code to show once; later ones (added while signed in) return no code.
 */
export async function registerPasskey(): Promise<{ recoveryCode: string | null }> {
  const options = await (await call("POST", "register/options")).json();
  const answer = await prompt(() => startRegistration({ optionsJSON: options }));
  return (await call("POST", "register/verify", answer)).json();
}

export async function signInWithPasskey(): Promise<void> {
  const options = await (await call("POST", "sign-in/options")).json();
  const answer = await prompt(() => startAuthentication({ optionsJSON: options }));
  await call("POST", "sign-in/verify", answer);
}

/** Signs in with the recovery code, which is then spent; returns the new code to show once. */
export async function signInWithRecoveryCode(code: string): Promise<{ recoveryCode: string }> {
  return (await call("POST", "recover", { code })).json();
}

export async function signOut(): Promise<void> {
  await call("POST", "sign-out");
}
