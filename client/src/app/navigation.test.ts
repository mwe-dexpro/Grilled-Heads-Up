import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Entry {
  hash: string;
  state: unknown;
}

/**
 * The part of a browser `navigation.ts` talks to: a history of entries, each with a hash and a state, and `hashchange`
 * events that arrive when the browser has moved (at once, or when the test lets them, as a real one does a moment later).
 */
class FakeBrowser extends EventTarget {
  entries: Entry[];
  index: number;
  backs = 0;
  private held: (() => void)[] | null = null;

  constructor(first: Entry) {
    super();
    this.entries = [first];
    this.index = 0;
  }

  get hash() {
    return this.entries[this.index]?.hash ?? "";
  }

  /** The state of the entry the browser is on. */
  get state() {
    return this.entries[this.index]?.state;
  }

  readonly history = {
    get state(): unknown {
      return fake().state;
    },
    replaceState: (state: unknown) => {
      const entry = this.entries[this.index];
      if (entry) entry.state = state;
    },
    back: () => {
      this.backs += 1;
      this.moveTo(this.index - 1);
    },
  };

  readonly location = {
    get hash() {
      return fake().hash;
    },
    set hash(href: string) {
      fake().push(href);
    },
    replace: (href: string) => {
      const entry = this.entries[this.index];
      if (!entry) return;
      const changed = entry.hash !== href;
      this.entries[this.index] = { hash: href, state: null };
      if (changed) this.announce();
    },
  };

  push(href: string) {
    if (this.hash === href) return;
    this.entries = [...this.entries.slice(0, this.index + 1), { hash: href, state: null }];
    this.index += 1;
    this.announce();
  }

  /** The browser's Back and Forward buttons, to any entry. */
  moveTo(index: number) {
    this.index = index;
    this.announce();
  }

  /** From now on `hashchange` events wait until `deliver`. */
  hold() {
    this.held = [];
  }

  deliver() {
    const waiting = this.held ?? [];
    this.held = null;
    for (const send of waiting) send();
  }

  private announce() {
    const send = () => this.dispatchEvent(new Event("hashchange"));
    if (this.held) this.held.push(send);
    else send();
  }
}

let current: FakeBrowser;
const fake = () => current;

/** Loads `navigation.ts` fresh on a browser that was opened on `first`, as the app is when the page loads. */
async function open(first: Entry = { hash: "", state: null }) {
  vi.resetModules();
  current = new FakeBrowser(first);
  vi.stubGlobal("window", current);
  const navigation = await import("./navigation");
  return { browser: current, ...navigation };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("opening the app", () => {
  it("marks the entry it was opened on as the first step of the app", async () => {
    const { browser } = await open();

    expect(browser.state).toEqual({ depth: 0 });
  });

  it("keeps the mark of an entry it finds marked (a reload)", async () => {
    const { browser } = await open({ hash: "#/task/t1", state: { depth: 2 } });

    expect(browser.state).toEqual({ depth: 2 });
  });
});

describe("navigate", () => {
  it("goes to the screen's address in a new entry, one step deeper", async () => {
    const { browser, navigate } = await open();

    navigate({ name: "task", id: "t1" });

    expect(browser.hash).toBe("#/task/t1");
    expect(browser.entries).toHaveLength(2);
    expect(browser.state).toEqual({ depth: 1 });
  });

  it("goes one step deeper again for every screen on", async () => {
    const { browser, navigate } = await open();

    navigate({ name: "projects" });
    navigate({ name: "list", id: "l1" });
    navigate({ name: "task", id: "t1" });

    expect(browser.state).toEqual({ depth: 3 });
  });

  it("replaces the entry, as deep as the one it replaces, when asked to", async () => {
    const { browser, navigate } = await open();
    navigate({ name: "event", id: "e1" });

    navigate({ name: "editEvent", id: "e1" }, { replace: true });

    expect(browser.hash).toBe("#/event/e1/edit");
    expect(browser.entries).toHaveLength(2);
    expect(browser.state).toEqual({ depth: 1 });
  });

  it("changes nothing when it replaces an entry with the address it has, and a later step is not taken for a replacement", async () => {
    const { browser, navigate } = await open();
    navigate({ name: "projects" });

    navigate({ name: "projects" }, { replace: true });
    navigate({ name: "list", id: "l1" });

    expect(browser.entries.map((entry) => entry.hash)).toEqual(["", "#/projects", "#/list/l1"]);
    expect(browser.state).toEqual({ depth: 2 });
  });
});

describe("goBack", () => {
  it("goes back one entry when the app has a step behind", async () => {
    const { browser, navigate, goBack } = await open();
    navigate({ name: "task", id: "t1" });

    goBack();

    expect(browser.backs).toBe(1);
    expect(browser.hash).toBe("");
    expect(browser.state).toEqual({ depth: 0 });
  });

  it("goes to Today, replacing the entry, where the app was opened on this screen", async () => {
    const { browser, goBack } = await open({ hash: "#/task/t1", state: null });

    goBack();

    expect(browser.backs).toBe(0);
    expect(browser.hash).toBe("#/");
    expect(browser.entries).toHaveLength(1);
  });

  it("goes back only once for two taps before the browser has moved", async () => {
    const { browser, navigate, goBack } = await open();
    navigate({ name: "task", id: "t1" });
    browser.hold();

    goBack();
    goBack();
    browser.deliver();

    expect(browser.backs).toBe(1);
    expect(browser.index).toBeGreaterThanOrEqual(0);
  });

  it("knows how deep each entry is when the browser's Back and Forward move over them", async () => {
    const { browser, navigate, goBack } = await open();
    navigate({ name: "projects" });
    navigate({ name: "task", id: "t1" });

    browser.moveTo(0);
    browser.moveTo(2);
    goBack();
    goBack();

    expect(browser.backs).toBe(2);
    expect(browser.hash).toBe("");
  });

  it("starts from the depth of an entry that was marked when the page loaded", async () => {
    const { browser, goBack } = await open({ hash: "#/task/t1", state: { depth: 1 } });
    browser.entries.unshift({ hash: "#/", state: { depth: 0 } });
    browser.index = 1;

    goBack();

    expect(browser.backs).toBe(1);
    expect(browser.hash).toBe("#/");
  });
});
