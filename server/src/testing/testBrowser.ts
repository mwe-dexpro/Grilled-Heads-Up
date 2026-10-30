import type { TestPasskey } from "./testPasskey.js";

/** Calls the server like one browser would: JSON requests that carry the cookies earlier responses set. */
export class TestBrowser {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly baseUrl: string) {}

  get(path: string) {
    return this.request("GET", path);
  }

  post(path: string, body?: unknown) {
    return this.request("POST", path, body);
  }

  async request(method: string, path: string, body?: unknown) {
    const response = await fetch(this.baseUrl + path, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(";");
      const [name, value] = pair.split("=");
      const cleared = value === "" || attributes.some((a) => /expires=Thu, 01 Jan 1970/i.test(a));
      if (cleared) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  async registrationOptions() {
    return (await (await this.post("/api/auth/register/options")).json()) as { challenge: string; user: { id: string } };
  }

  async signInOptions() {
    return (await (await this.post("/api/auth/sign-in/options")).json()) as { challenge: string };
  }

  /** Runs a whole passkey registration and returns the server's last answer. */
  async registerPasskey(passkey: TestPasskey) {
    const options = await this.post("/api/auth/register/options");
    if (!options.ok) return options;
    return this.post("/api/auth/register/verify", passkey.register((await options.json()) as { challenge: string; user: { id: string } }));
  }

  /** Runs a whole passkey sign-in and returns the server's last answer. */
  async signIn(passkey: TestPasskey) {
    return this.post("/api/auth/sign-in/verify", passkey.signIn(await this.signInOptions()));
  }

  async session() {
    return (await (await this.get("/api/auth/session")).json()) as { owner: boolean; signedIn: boolean };
  }
}
