import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

/** Wednesday 7 October 2026, 13:05: today is Oct 7, so Oct 5 is Overdue and Oct 9 is ahead. */
const wednesday = new Date(2026, 9, 7, 13, 5);

test.beforeEach(async ({ page }) => {
  // The clock runs, so Tasks added one after the other have distinct creation times (their order).
  await page.clock.install({ time: wednesday });
});

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: /Main|Hauptnavigation/ }).getByRole("button", { name });
const row = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });
const card = (page: Page, name: string) => page.getByRole("link").filter({ has: page.locator(".project-name", { hasText: name }) });

/** Adds a Task through the "+" button; on a Project view it goes into that List. */
async function addTask(page: Page, title: string, { date = "" } = {}) {
  await page.getByRole("button", { name: "New Task" }).click();
  await page.getByLabel("Title").fill(title);
  if (date) await page.getByLabel("Date").fill(date);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(row(page, title)).toBeVisible();
}

/** Makes a List (or a Project) on the Projects tab, where it then shows. */
async function addList(page: Page, name: string, { project = false } = {}) {
  await tab(page, "Projects").click();
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByLabel("Name").fill(name);
  if (project) await page.getByRole("checkbox", { name: "Project" }).check();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

/**
 * Makes the app's syncs answer from the test: a push is accepted, a pull brings what `bring` was given (once), as
 * if from another device whose clock is later than anything here. The test then runs the page clock to the next sync.
 */
async function otherDevice(page: Page) {
  let pending: unknown[] = [];
  // The server's time is the page's: a device moves its clock past it, and the other device's changes must be later.
  const serverTime = wednesday.getTime();
  const later = new Date(2026, 9, 7, 14, 0).getTime();
  await page.route(/\/api\/sync\/push/, (route) => route.fulfill({ json: { serverTime } }));
  await page.route(/\/api\/sync\/pull/, (route) => {
    const changes = pending;
    pending = [];
    return route.fulfill({ json: { changes, cursor: 1, more: false, serverTime } });
  });
  const hlc = `${String(later).padStart(15, "0")}-00000-other-device`;
  return {
    /** The List `id` has `field` set to `value` on the other device. */
    bring(id: string, field: string, value: unknown) {
      pending = [{ type: "list", id, field, value, hlc }];
    },
  };
}

/** The id of the List the Project view is showing. */
const listIdOf = (page: Page) => decodeURIComponent(new URL(page.url()).hash.replace("#/list/", ""));

/** Opens a List or Project from the Projects tab. */
async function openList(page: Page, name: string) {
  await tab(page, "Projects").click();
  await page.getByRole("link").filter({ hasText: name }).first().click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

test("a List and a Project on the Projects tab: the Project is a card, the List a row, both survive a reload", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Projects").click();
  await expect(page.getByText("No lists yet.", { exact: false })).toBeVisible();

  await addList(page, "Shopping");
  await addList(page, "Basement", { project: true });

  await expect(page.locator(".project-card")).toHaveCount(1);
  await expect(card(page, "Basement")).toContainText("No deadline");
  await expect(card(page, "Basement")).toContainText("No tasks yet");
  await expect(page.getByRole("region", { name: "Lists" }).getByRole("listitem")).toHaveText([/Shopping/]);
  await expect(page.getByText("No lists yet.", { exact: false })).toBeHidden();

  await page.reload();

  await expect(page.locator(".project-card")).toHaveText([/Basement/]);
  await expect(page.getByRole("region", { name: "Lists" }).getByRole("listitem")).toHaveText([/Shopping/]);
});

test("Tasks put in a Project from Task detail: the Project view shows them and their Progress, Completing moves it, the card follows", async ({ page }) => {
  await page.goto("/");
  await addList(page, "Basement", { project: true });
  await tab(page, "Today").click();
  await addTask(page, "Sort boxes");
  await addTask(page, "Call junk removal");
  for (const title of ["Sort boxes", "Call junk removal"]) {
    await page.getByRole("link", { name: title, exact: true }).click();
    const list = page.getByRole("combobox", { name: "List", exact: true });
    await expect(list.locator("option:checked")).toHaveText("No list");
    await list.selectOption({ label: "Basement" });
    // The select shows what is saved, not what was picked.
    await expect(list.locator("option:checked")).toHaveText("Basement");
    await page.getByRole("button", { name: "Back" }).click();
  }

  await openList(page, "Basement");

  await expect(page.getByRole("heading", { name: "Progress: 0 of 2 done" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Basement" }).getByRole("listitem")).toHaveText([/Sort boxes/, /Call junk removal/]);
  await page.getByRole("checkbox", { name: "Complete Sort boxes" }).click();
  await expect(page.getByRole("heading", { name: "Progress: 1 of 2 done" })).toBeVisible();
  // Completed, it stays crossed out in its place.
  await expect(page.getByRole("region", { name: "Basement" }).getByRole("listitem")).toHaveText([/Sort boxes/, /Call junk removal/]);
  await expect(page.getByRole("checkbox", { name: "Complete Sort boxes" })).toBeChecked();

  await tab(page, "Projects").click();
  await expect(card(page, "Basement")).toContainText("1 of 2 · Call junk removal");
  await card(page, "Basement").click();
  await expect(page.getByRole("heading", { name: "Basement", level: 1 })).toBeVisible();
});

test("a Task Completed on an earlier day is hidden in the Project view until Show completed is on", async ({ page }) => {
  await page.goto("/");
  await addList(page, "Basement", { project: true });
  await openList(page, "Basement");
  await addTask(page, "Old job");
  await addTask(page, "New job");
  await page.getByRole("checkbox", { name: "Complete Old job" }).click();
  await expect(page.getByRole("checkbox", { name: "Complete Old job" })).toBeChecked();
  // Completed today, it stays in place.
  await expect(row(page, "Old job")).toBeVisible();

  await page.clock.setFixedTime(new Date(2026, 9, 8, 9, 0));
  await page.reload();

  await expect(row(page, "New job")).toBeVisible();
  await expect(row(page, "Old job")).toHaveCount(0);
  const toggle = page.getByRole("button", { name: "Show completed" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // Progress counts it all the same.
  await expect(page.getByRole("heading", { name: "Progress: 1 of 2 done" })).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, "Old job")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Complete Old job" })).toBeChecked();
  await toggle.click();
  await expect(row(page, "Old job")).toHaveCount(0);
});

test("Tags: a typed name reuses the Tag in any case, a Tag can be removed, and the Project view filters by one Tag", async ({ page }) => {
  await page.goto("/");
  await addList(page, "Basement", { project: true });
  await openList(page, "Basement");
  await addTask(page, "Sort boxes");
  await addTask(page, "Call junk removal");
  await addTask(page, "Plain job");
  await expect(page.getByRole("group", { name: "Filter by tag" })).toHaveCount(0);

  const tags = page.getByRole("region", { name: "Tags" });
  const addTag = async (name: string) => {
    const input = page.getByRole("combobox", { name: "Add tag" });
    await input.fill(name);
    await input.press("Enter");
    await expect(input).toHaveValue("");
  };

  await page.getByRole("link", { name: "Sort boxes", exact: true }).click();
  await addTag("Errand");
  await addTag("Heavy");
  await expect(tags.getByRole("listitem")).toHaveText(["Errand", "Heavy"]);
  await tags.getByRole("button", { name: "Remove tag Heavy" }).click();
  await expect(tags.getByRole("listitem")).toHaveText(["Errand"]);
  // Nothing to add for an empty name.
  await expect(tags.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("link", { name: "Call junk removal", exact: true }).click();
  await addTag("errand");
  await expect(tags.getByRole("listitem")).toHaveText(["Errand"]);
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("link", { name: "Plain job", exact: true }).click();
  await addTag("Heavy");
  await expect(tags.getByRole("listitem")).toHaveText(["Heavy"]);
  await page.getByRole("button", { name: "Back" }).click();

  const filter = page.getByRole("group", { name: "Filter by tag" });
  // "Errand" was typed twice in different case: one Tag, one chip.
  await expect(filter.getByRole("button")).toHaveText(["All", "Errand", "Heavy"]);
  await expect(filter.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  await filter.getByRole("button", { name: "Errand" }).click();
  await expect(filter.getByRole("button", { name: "Errand" })).toHaveAttribute("aria-pressed", "true");
  await expect(filter.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("region", { name: "Basement" }).getByRole("listitem")).toHaveText([/Sort boxes/, /Call junk removal/]);
  await filter.getByRole("button", { name: "Heavy" }).click();
  await expect(filter.getByRole("button", { name: "Errand" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("region", { name: "Basement" }).getByRole("listitem")).toHaveText([/Plain job/]);
  await filter.getByRole("button", { name: "All" }).click();
  await expect(page.getByRole("region", { name: "Basement" }).getByRole("listitem")).toHaveText([/Sort boxes/, /Call junk removal/, /Plain job/]);

  // The Tags are saved: they are there after a reload.
  await page.reload();
  await expect(filter.getByRole("button")).toHaveText(["All", "Errand", "Heavy"]);
});

test("a List is renamed, marked as a Project (it moves from the rows to the cards) and unmarked", async ({ page }) => {
  await page.goto("/");
  await addList(page, "Shoping");
  await openList(page, "Shoping");
  await expect(page.getByText("List", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Shopping");
  await page.getByRole("checkbox", { name: "Project" }).check();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name: "Shopping", level: 1 })).toBeVisible();
  await expect(page.getByText("Project", { exact: true })).toBeVisible();
  await tab(page, "Projects").click();
  await expect(page.locator(".project-card")).toHaveText([/Shopping/]);
  await expect(page.getByRole("region", { name: "Lists" })).toHaveCount(0);

  await card(page, "Shopping").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Shopping");
  await page.getByRole("checkbox", { name: "Project" }).uncheck();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("List", { exact: true })).toBeVisible();
  await tab(page, "Projects").click();
  await expect(page.locator(".project-card")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Lists" }).getByRole("listitem")).toHaveText([/Shopping/]);
});

test("deleting a List asks first and says its Tasks stay; they stay in their Bucket without a List", async ({ page }) => {
  await page.goto("/");
  await addList(page, "Basement");
  await openList(page, "Basement");
  await addTask(page, "Sort boxes", { date: "2026-10-07" });
  await tab(page, "Today").click();
  await expect(row(page, "Sort boxes")).toContainText("Basement");
  await tab(page, "Projects").click();
  await page.getByRole("link").filter({ hasText: "Basement" }).first().click();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Delete list" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Delete “Basement”? Its task stays, without a list.");
  // Cancel goes back to the form, and nothing is deleted.
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Basement");
  await page.getByRole("button", { name: "Delete list" }).click();
  await sheet.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page).toHaveURL(/#\/projects$/);
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByText("Basement")).toHaveCount(0);
  await expect(page.getByText("No lists yet.", { exact: false })).toBeVisible();
  await tab(page, "Today").click();
  await expect(row(page, "Sort boxes")).toBeVisible();
  await expect(row(page, "Sort boxes")).not.toContainText("Basement");
  await expect(page.getByRole("region", { name: "Today" }).getByRole("listitem")).toHaveText([/Sort boxes/]);
  // The Task has no List any more.
  await page.getByRole("link", { name: "Sort boxes", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "List", exact: true }).locator("option:checked")).toHaveText("No list");
});

test("a Task's second line names its List, and the name opens the Project view", async ({ page }) => {
  await page.goto("/");
  await addList(page, "Basement", { project: true });
  await openList(page, "Basement");
  await addTask(page, "Sort boxes", { date: "2026-10-07" });
  await addTask(page, "Sweep", { date: "2026-10-09" });
  // The Project view does not repeat the List on its own rows.
  await expect(row(page, "Sort boxes")).not.toContainText("Basement");

  await tab(page, "Today").click();

  await expect(row(page, "Sort boxes")).toContainText("Basement");
  await expect(row(page, "Sweep")).toContainText(/Basement · Fri, Oct 9/);
  await row(page, "Sweep").getByRole("link", { name: "Basement" }).click();
  await expect(page.getByRole("heading", { name: "Basement", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/list\//);
  // No tab is highlighted for a List opened from a Task.
  await expect(page.getByRole("navigation", { name: "Main" }).locator("[aria-current=page]")).toHaveCount(0);
});

test('the "+" button in a Project view adds the Task to that List, elsewhere it adds to none', async ({ page }) => {
  await page.goto("/");
  await addList(page, "Basement", { project: true });
  await tab(page, "Today").click();
  await addTask(page, "Loose end");
  await expect(row(page, "Loose end")).not.toContainText("Basement");
  await openList(page, "Basement");

  await page.getByRole("button", { name: "New Task" }).click();
  await expect(page.getByRole("dialog")).toContainText("Goes into the list “Basement”.");
  await page.getByLabel("Title").fill("Sort boxes");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Progress: 0 of 1 done" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Basement" }).getByRole("listitem")).toHaveText([/Sort boxes/]);
  await tab(page, "Today").click();
  await page.getByRole("button", { name: "New Task" }).click();
  await expect(page.getByRole("dialog")).not.toContainText("Goes into the list");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(row(page, "Sort boxes")).toContainText("Basement");
  await expect(row(page, "Loose end")).not.toContainText("Basement");
});

test("Tasks are Completed, Rescheduled and deleted from the Project view like on the home screen", async ({ page }) => {
  await page.goto("/");
  await addList(page, "Basement", { project: true });
  await openList(page, "Basement");
  await addTask(page, "Pay invoice", { date: "2026-10-05" });
  await addTask(page, "Sweep", { date: "2026-10-09" });

  // An Overdue row shows its age; a long press opens the same actions as everywhere.
  await expect(row(page, "Pay invoice")).toContainText("2 days overdue");
  await row(page, "Pay invoice").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Reschedule" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Tomorrow/ }).click();
  await expect(row(page, "Pay invoice")).not.toContainText("overdue");
  await expect(page.getByRole("heading", { name: "Progress: 0 of 2 done" })).toBeVisible();
  await row(page, "Sweep").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(row(page, "Sweep")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Progress: 0 of 1 done" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row(page, "Sweep")).toBeVisible();
});

test("a card shows what is Overdue and the next Task, in amber when it is Overdue", async ({ page }) => {
  await page.goto("/");
  await addList(page, "Basement", { project: true });
  await addList(page, "Garden", { project: true });
  await openList(page, "Basement");
  await addTask(page, "Sweep", { date: "2026-10-09" });
  await addTask(page, "Pay invoice", { date: "2026-10-05" });
  await openList(page, "Garden");
  await addTask(page, "Mow lawn", { date: "2026-10-09" });

  await tab(page, "Projects").click();

  await expect(card(page, "Basement")).toContainText("1 overdue");
  await expect(card(page, "Basement")).toContainText("0 of 2 · Pay invoice overdue");
  await expect(card(page, "Basement").locator(".progress-segments span")).toHaveClass(["overdue", ""]);
  await expect(card(page, "Garden")).toContainText("On track");
  await expect(card(page, "Garden")).toContainText("0 of 1 · Mow lawn");
  await expect(card(page, "Garden")).not.toContainText("overdue");
});

test("the Projects tab and the Project view speak German", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption({ label: "Deutsch" });
  await tab(page, "Projekte").click();
  await expect(page.getByText("Noch keine Listen.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Neue Liste" }).click();
  await page.getByLabel("Name").fill("Keller");
  await page.getByRole("checkbox", { name: "Projekt" }).check();
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(card(page, "Keller")).toContainText("ohne Termin");
  await expect(card(page, "Keller")).toContainText("Noch keine Aufgaben");
  await expect(card(page, "Keller")).toContainText("Öffnen");

  await card(page, "Keller").click();
  await expect(page.getByText("Projekt", { exact: true })).toBeVisible();
  await expect(page.getByText("Keine offenen Aufgaben.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Erledigte anzeigen" })).toBeVisible();
  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  await expect(page.getByRole("dialog")).toContainText("Kommt in die Liste „Keller“.");
  await page.getByLabel("Titel").fill("Kisten sortieren");
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(row(page, "Kisten sortieren")).toBeVisible();

  await page.getByRole("link", { name: "Kisten sortieren", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kategorien" })).toBeVisible();
  await page.getByRole("combobox", { name: "Kategorie hinzufügen" }).fill("Besorgung");
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kategorie Besorgung entfernen" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Liste", exact: true }).locator("option:checked")).toHaveText("Keller");
  await page.getByRole("button", { name: "Zurück" }).click();

  const filter = page.getByRole("group", { name: "Nach Kategorie filtern" });
  await expect(filter.getByRole("button")).toHaveText(["Alle", "Besorgung"]);
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await page.getByRole("button", { name: "Liste löschen" }).click();
  await expect(page.getByRole("dialog")).toContainText("„Keller“ löschen? Die Aufgabe bleibt erhalten, ohne Liste.");
});

test("a List that does not exist says so", async ({ page }) => {
  await page.goto("/#/list/nope");

  await expect(page.getByText("This list doesn't exist (any more).")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
});

test("the row of a plain List shows how many of its Tasks are done", async ({ page }) => {
  await page.goto("/");
  await addList(page, "Shopping");
  await openList(page, "Shopping");
  await addTask(page, "Milk");
  await addTask(page, "Bread");
  await tab(page, "Projects").click();
  const shopping = page.getByRole("region", { name: "Lists" }).getByRole("listitem").filter({ hasText: "Shopping" });
  await expect(shopping).toContainText("0 of 2");

  await openList(page, "Shopping");
  await page.getByRole("checkbox", { name: "Complete Milk" }).click();
  await expect(page.getByRole("heading", { name: "Progress: 1 of 2 done" })).toBeVisible();
  await tab(page, "Projects").click();

  await expect(shopping).toContainText("1 of 2");
});

test("the Tag input stops at the length a Tag's name can have", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Post parcel");
  await page.getByRole("link", { name: "Post parcel", exact: true }).click();

  await expect(page.getByRole("combobox", { name: "Add tag" })).toHaveAttribute("maxlength", "50");
});

test("saving the Edit sheet writes only what was changed: a rename that arrived by sync meanwhile is kept", async ({ page }) => {
  const other = await otherDevice(page);
  await page.goto("/");
  await addList(page, "Basement");
  await openList(page, "Basement");
  const id = listIdOf(page);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Basement");

  // The sync that runs every minute brings "Cellar" while the sheet is open on "Basement".
  other.bring(id, "name", "Cellar");
  await page.clock.runFor(65_000);
  await expect(page.locator("h1")).toHaveText("Cellar");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // A later change goes through the same stores, so by the time it is shown, a write the Save made has been made.
  await addTask(page, "Marker");
  await expect(page.locator("h1")).toHaveText("Cellar");
});

test("saving the Edit sheet keeps a Project mark that arrived by sync meanwhile, and still saves the rename", async ({ page }) => {
  const other = await otherDevice(page);
  await page.goto("/");
  await addList(page, "Basment");
  await openList(page, "Basment");
  const id = listIdOf(page);
  await page.getByRole("button", { name: "Edit" }).click();

  other.bring(id, "isProject", true);
  await page.clock.runFor(65_000);
  await expect(page.locator(".detail-header .eyebrow")).toHaveText("Project");
  await page.getByLabel("Name").fill("Basement");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator("h1")).toHaveText("Basement");
  await addTask(page, "Marker");
  await expect(page.locator(".detail-header .eyebrow")).toHaveText("Project");
});

test("saving the Edit sheet of a List that another tab deleted meanwhile ends calmly, not in an error", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await addList(page, "Basement");
  await openList(page, "Basement");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Cellar");

  // Another tab of the app (the same database) deletes the List; this tab does not know yet.
  const other = await context.newPage();
  await other.goto("/#/projects");
  await other.getByRole("link").filter({ hasText: "Basement" }).first().click();
  await other.getByRole("button", { name: "Edit" }).click();
  await other.getByRole("button", { name: "Delete list" }).click();
  await other.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(other.getByText("No lists yet.", { exact: false })).toBeVisible();
  await other.close();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("This list doesn't exist (any more).")).toBeVisible();
  expect(errors).toEqual([]);
});

test("deleting a List from its Project view goes to the Projects tab at once, and Back does not return to the deleted List", async ({ page }) => {
  await page.goto("/");
  await addList(page, "Basement");
  await openList(page, "Basement");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Delete list" }).click();
  // Records whether the "not found" line is ever on screen: it would flash while the deleted List is still the route.
  await page.evaluate(() => {
    const seen = { notFound: false };
    (window as unknown as { seen: typeof seen }).seen = seen;
    new MutationObserver(() => {
      if (document.body.innerText.includes("doesn't exist")) seen.notFound = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText("No lists yet.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { seen: { notFound: boolean } }).seen.notFound)).toBe(false);
  await page.goBack();
  await expect(page).toHaveURL(/#\/projects$/);
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
});
