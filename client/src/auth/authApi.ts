import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
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
    const init: RequestInit =
      body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    response = await fetch(`/api/auth/${path}`, init);
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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isCreationOptions = (value: unknown): value is PublicKeyCredentialCreationOptionsJSON =>
  isRecord(value) && typeof value["challenge"] === "string" && isRecord(value["rp"]) && isRecord(value["user"]) && Array.isArray(value["pubKeyCredParams"]);

const isRequestOptions = (value: unknown): value is PublicKeyCredentialRequestOptionsJSON => isRecord(value) && typeof value["challenge"] === "string";

const hasRecoveryCode = (value: unknown): value is { recoveryCode: string } => isRecord(value) && typeof value["recoveryCode"] === "string";

const hasOptionalRecoveryCode = (value: unknown): value is { recoveryCode: string | null } =>
  isRecord(value) && (typeof value["recoveryCode"] === "string" || value["recoveryCode"] === null);

/** What the server answered, if it is the shape its routes send; anything else is as good as a refusal. */
async function answer<T>(response: Response, isShape: (value: unknown) => value is T): Promise<T> {
  const body: unknown = await response.json();
  if (!isShape(body)) throw new AuthError("refused");
  return body;
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
  const options = await answer(await call("POST", "register/options"), isCreationOptions);
  const credential = await prompt(() => startRegistration({ optionsJSON: options }));
  return answer(await call("POST", "register/verify", credential), hasOptionalRecoveryCode);
}

export async function signInWithPasskey(): Promise<void> {
  const options = await answer(await call("POST", "sign-in/options"), isRequestOptions);
  const credential = await prompt(() => startAuthentication({ optionsJSON: options }));
  await call("POST", "sign-in/verify", credential);
}

/** Signs in with the recovery code, which is then spent; returns the new code to show once. */
export async function signInWithRecoveryCode(code: string): Promise<{ recoveryCode: string }> {
  return answer(await call("POST", "recover", { code }), hasRecoveryCode);
}

/** Replaces the signed-in Owner's recovery code; returns the new code to show once. */
export async function newRecoveryCode(): Promise<{ recoveryCode: string }> {
  return answer(await call("POST", "recovery-code"), hasRecoveryCode);
}

export async function signOut(): Promise<void> {
  await call("POST", "sign-out");
}
