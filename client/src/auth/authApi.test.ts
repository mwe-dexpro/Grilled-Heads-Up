import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, fetchSession, newRecoveryCode, registerPasskey, signInWithPasskey, signInWithRecoveryCode, signOut } from "./authApi";

// The passkey prompt is the browser's own; the tests stand in for the person and the authenticator.
const prompt = vi.hoisted(() => ({ register: vi.fn(), signIn: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({ startRegistration: prompt.register, startAuthentication: prompt.signIn }));

interface Answer {
  status?: number;
  body?: unknown;
  /** The request never reaches the server (offline). */
  offline?: boolean;
}

/** A server that answers each path with what the test says, and remembers what it was sent. */
function server(answers: Record<string, Answer>) {
  const received: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      const path = url.replace("/api/auth/", "");
      received.push({ method: init.method ?? "", path, body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined });
      const answer = answers[path] ?? { status: 404 };
      if (answer.offline === true) return Promise.reject(new TypeError("Failed to fetch"));
      const status = answer.status ?? 200;
      return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(answer.body ?? {}), { status }));
    }),
  );
  return received;
}

const creationOptions = { challenge: "c1", rp: { name: "Grilled Heads-Up" }, user: { id: "u", name: "n", displayName: "n" }, pubKeyCredParams: [{ type: "public-key", alg: -7 }] };
const requestOptions = { challenge: "c2" };

/** What failing with `error` leaves in the AuthError the sign-in screens show. */
async function problemOf(call: () => Promise<unknown>) {
  try {
    await call();
  } catch (error) {
    return error instanceof AuthError ? error.problem : "not an AuthError";
  }
  return "no error";
}

const namedError = (name: string) => Object.assign(new Error(name), { name });

beforeEach(() => {
  prompt.register.mockReset();
  prompt.signIn.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("session", () => {
  it("is what the server says", async () => {
    server({ session: { body: { owner: true, signedIn: false } } });

    expect(await fetchSession()).toEqual({ owner: true, signedIn: false });
  });

  it("asks with GET", async () => {
    const received = server({ session: { body: { owner: false, signedIn: false } } });

    await fetchSession();

    expect(received).toEqual([{ method: "GET", path: "session", body: undefined }]);
  });

  it("is unreachable when there is no connection, and refused when the server says no", async () => {
    server({ session: { offline: true } });
    expect(await problemOf(fetchSession)).toBe("unreachable");

    server({ session: { status: 500 } });
    expect(await problemOf(fetchSession)).toBe("refused");
  });
});

describe("registering a passkey", () => {
  it("shows the options to the person, sends the answer to the server and returns the recovery code of the first launch", async () => {
    const received = server({ "register/options": { body: creationOptions }, "register/verify": { body: { recoveryCode: "AAAA-BBBB" } } });
    prompt.register.mockResolvedValue({ id: "credential-1" });

    expect(await registerPasskey()).toEqual({ recoveryCode: "AAAA-BBBB" });

    expect(prompt.register).toHaveBeenCalledWith({ optionsJSON: creationOptions });
    expect(received.map((r) => [r.method, r.path])).toEqual([["POST", "register/options"], ["POST", "register/verify"]]);
    expect(received[1]?.body).toEqual({ id: "credential-1" });
  });

  it("returns no recovery code for a passkey added to an Owner who has one", async () => {
    server({ "register/options": { body: creationOptions }, "register/verify": { body: { recoveryCode: null } } });
    prompt.register.mockResolvedValue({ id: "credential-2" });

    expect(await registerPasskey()).toEqual({ recoveryCode: null });
  });

  it("says a cancelled or timed-out prompt was cancelled, and a device that has the passkey already so", async () => {
    server({ "register/options": { body: creationOptions } });
    for (const [name, problem] of [["NotAllowedError", "cancelled"], ["AbortError", "cancelled"], ["InvalidStateError", "exists"], ["SecurityError", "refused"]]) {
      prompt.register.mockRejectedValue(namedError(name ?? ""));
      expect(await problemOf(registerPasskey), name).toBe(problem);
    }
    prompt.register.mockRejectedValue("not even an Error");
    expect(await problemOf(registerPasskey)).toBe("refused");
  });

  it("does not send anything to verify when the prompt failed", async () => {
    const received = server({ "register/options": { body: creationOptions } });
    prompt.register.mockRejectedValue(namedError("NotAllowedError"));

    await problemOf(registerPasskey);

    expect(received.map((r) => r.path)).toEqual(["register/options"]);
  });

  it("is refused when the server refuses the options or the answer, or sends something else than it should", async () => {
    server({ "register/options": { status: 403 } });
    expect(await problemOf(registerPasskey)).toBe("refused");

    for (const options of [null, "text", {}, { ...creationOptions, challenge: 5 }, { ...creationOptions, rp: "x" }, { ...creationOptions, user: null }, { ...creationOptions, pubKeyCredParams: {} }]) {
      server({ "register/options": { body: options } });
      expect(await problemOf(registerPasskey), JSON.stringify(options)).toBe("refused");
    }
    expect(prompt.register).not.toHaveBeenCalled();

    prompt.register.mockResolvedValue({ id: "credential-3" });
    for (const verified of [{ status: 400 }, { body: { recoveryCode: 7 } }, { body: {} }, { body: null }]) {
      server({ "register/options": { body: creationOptions }, "register/verify": verified });
      expect(await problemOf(registerPasskey), JSON.stringify(verified)).toBe("refused");
    }
  });

  it("is unreachable when the connection fails", async () => {
    server({ "register/options": { offline: true } });

    expect(await problemOf(registerPasskey)).toBe("unreachable");
  });
});

describe("signing in with a passkey", () => {
  it("shows the options, sends the answer, and is done", async () => {
    const received = server({ "sign-in/options": { body: requestOptions }, "sign-in/verify": { body: {} } });
    prompt.signIn.mockResolvedValue({ id: "credential-4" });

    await signInWithPasskey();

    expect(prompt.signIn).toHaveBeenCalledWith({ optionsJSON: requestOptions });
    expect(received.map((r) => [r.method, r.path])).toEqual([["POST", "sign-in/options"], ["POST", "sign-in/verify"]]);
    expect(received[1]?.body).toEqual({ id: "credential-4" });
  });

  it("says a cancelled prompt was cancelled", async () => {
    server({ "sign-in/options": { body: requestOptions } });
    prompt.signIn.mockRejectedValue(namedError("NotAllowedError"));

    expect(await problemOf(signInWithPasskey)).toBe("cancelled");
  });

  it("is refused when the server does not sign the person in, or sends options that are not options", async () => {
    server({ "sign-in/options": { body: requestOptions }, "sign-in/verify": { status: 401 } });
    prompt.signIn.mockResolvedValue({ id: "credential-5" });
    expect(await problemOf(signInWithPasskey)).toBe("refused");

    for (const options of [null, [], { challenge: 1 }, {}]) {
      server({ "sign-in/options": { body: options } });
      expect(await problemOf(signInWithPasskey), JSON.stringify(options)).toBe("refused");
    }
  });
});

describe("recovery codes", () => {
  it("signs in with the code typed and returns the new one", async () => {
    const received = server({ recover: { body: { recoveryCode: "CCCC-DDDD" } } });

    expect(await signInWithRecoveryCode("AAAA-BBBB")).toEqual({ recoveryCode: "CCCC-DDDD" });

    expect(received).toEqual([{ method: "POST", path: "recover", body: { code: "AAAA-BBBB" } }]);
  });

  it("is refused for a wrong code and for an answer without a new code", async () => {
    server({ recover: { status: 401 } });
    expect(await problemOf(() => signInWithRecoveryCode("nope"))).toBe("refused");

    for (const body of [{}, { recoveryCode: null }, { recoveryCode: 1 }, null]) {
      server({ recover: { body } });
      expect(await problemOf(() => signInWithRecoveryCode("AAAA")), JSON.stringify(body)).toBe("refused");
    }
  });

  it("asks for a new code while signed in", async () => {
    const received = server({ "recovery-code": { body: { recoveryCode: "EEEE-FFFF" } } });

    expect(await newRecoveryCode()).toEqual({ recoveryCode: "EEEE-FFFF" });

    expect(received).toEqual([{ method: "POST", path: "recovery-code", body: undefined }]);
  });

  it("is refused for a new code when not signed in, and for an answer without one", async () => {
    server({ "recovery-code": { status: 401 } });
    expect(await problemOf(newRecoveryCode)).toBe("refused");

    server({ "recovery-code": { body: { recoveryCode: false } } });
    expect(await problemOf(newRecoveryCode)).toBe("refused");
  });
});

describe("signing out", () => {
  it("tells the server", async () => {
    const received = server({ "sign-out": { status: 204 } });

    await signOut();

    expect(received).toEqual([{ method: "POST", path: "sign-out", body: undefined }]);
  });

  it("is refused when the server says no", async () => {
    server({ "sign-out": { status: 500 } });

    expect(await problemOf(signOut)).toBe("refused");
  });
});
