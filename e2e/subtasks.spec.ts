import { boxOf, expect, test, textOf, type TouchType } from "./fixtures";
import type { BrowserContext, Page } from "@playwright/test";

/** Wednesday 7 October 2026, 13:05: today is Oct 7. */
const wednesday = new Date(2026, 9, 7, 13, 5);

test.beforeEach(async ({ page }) => {
  // The clock runs, so Tasks and Subtasks added one after the other have distinct creation times (their order).
  await page.clock.install({ time: wednesday });
});

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: /Main|Hauptnavigation/ }).getByRole("button", { name });
const row = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });
/** The Subtasks section of Task detail. */
const section = (page: Page) => page.getByRole("region", { name: /Subtasks|Unteraufgaben/ });
const titlesOf = (page: Page) => section(page).locator(".subtask-title");

/** Adds a Task through the "+" button; without a date it goes to the Inbox. */
async function addTask(page: Page, title: string, { date = "" } = {}) {
  await page.getByRole("button", { name: "New Task" }).click();
  await page.getByLabel("Title").fill(title);
  if (date) await page.getByLabel("Date").fill(date);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(row(page, title)).toBeVisible();
}

const openTask = (page: Page, title: string) => page.getByRole("link", { name: title, exact: true }).click();

/** Clicks a Subtask's check in the page without moving the focus, as a change from elsewhere would. Runs in the browser. */
function clickCheck(title: string): void {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${title}"]`);
  if (input === null) throw new Error(`No check for ${title}.`);
  input.click();
}

/** Clicks a Subtask's check and waits until it shows the other state, i.e. the change is saved. */
async function toggle(page: Page, title: string) {
  const check = page.getByRole("checkbox", { name: title });
  const was = await check.isChecked();
  await check.click();
  await expect(check).toBeChecked({ checked: !was });
}

/** Types Subtasks into "Add subtask", one after the other, with the keyboard only. */
async function addSubtasks(page: Page, ...titles: string[]) {
  const input = page.getByRole("textbox", { name: "Add subtask" });
  for (const title of titles) {
    await input.pressSequentially(title);
    await input.press("Enter");
    await expect(page.getByRole("button", { name: `Rename ${title}` })).toBeVisible();
  }
}

/** Makes an Event on the "+" sheet's way; it opens afterwards. */
async function addEvent(page: Page, title: string, startDate: string) {
  await page.getByRole("button", { name: "New Task" }).click();
  await page.getByRole("button", { name: "New event" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByLabel("Start date").fill(startDate);
  await page.getByLabel("Start time").fill("12:30");
  await page.getByLabel("End time").fill("15:00");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

/** Makes a Project on the Projects tab. */
async function addProject(page: Page, name: string) {
  await tab(page, "Projects").click();
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByLabel("Name").fill(name);
  await toggle(page, "Project");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("add Subtasks one after another with the keyboard, tick, rename and delete one and undo it; it all survives a reload", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pack for the weekend", { date: "2026-10-07" });
  await openTask(page, "Pack for the weekend");
  await expect(section(page).getByRole("heading", { name: "Subtasks", level: 2 })).toBeVisible();
  // No Subtasks yet: no count and no bar, only the "Add subtask" row.
  await expect(section(page).getByRole("progressbar")).toHaveCount(0);

  const input = page.getByRole("textbox", { name: "Add subtask" });
  await input.focus();
  for (const title of ["Boots", "Rain jacket", "Chargers"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: `Rename ${title}` })).toBeVisible();
    // The focus stays in the input for the next one, which is empty again.
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
  }
  // A blank entry adds nothing.
  await page.keyboard.type("   ");
  await page.keyboard.press("Enter");
  await expect(titlesOf(page)).toHaveText(["Boots", "Rain jacket", "Chargers"]);

  await toggle(page, "Rain jacket");
  await expect(page.getByRole("checkbox", { name: "Rain jacket" })).toBeChecked();
  await expect(section(page).getByText("1 of 3", { exact: true })).toBeVisible();
  const bar = section(page).getByRole("progressbar", { name: "Subtasks done" });
  await expect(bar).toHaveAttribute("aria-valuenow", "1");
  await expect(bar).toHaveAttribute("aria-valuemax", "3");
  await expect(bar.locator("span")).toHaveAttribute("style", /width: 33\.3/);
  // A ticked one is struck through.
  await expect(page.getByRole("button", { name: "Rename Rain jacket" })).toHaveCSS("text-decoration-line", "line-through");
  await expect(page.getByRole("button", { name: "Rename Boots" })).toHaveCSS("text-decoration-line", "none");

  // Rename: Enter saves, Escape cancels, a blank title keeps the old one.
  await page.getByRole("button", { name: "Rename Chargers" }).click();
  const rename = page.getByRole("textbox", { name: "Rename Chargers" });
  await expect(rename).toBeFocused();
  await rename.fill("Power bank");
  await rename.press("Enter");
  await expect(titlesOf(page)).toHaveText(["Boots", "Rain jacket", "Power bank"]);
  await page.getByRole("button", { name: "Rename Boots" }).click();
  await page.getByRole("textbox", { name: "Rename Boots" }).fill("Sandals");
  await page.keyboard.press("Escape");
  await expect(titlesOf(page)).toHaveText(["Boots", "Rain jacket", "Power bank"]);
  await page.getByRole("button", { name: "Rename Boots" }).click();
  await page.getByRole("textbox", { name: "Rename Boots" }).fill("   ");
  await page.keyboard.press("Enter");
  await expect(titlesOf(page)).toHaveText(["Boots", "Rain jacket", "Power bank"]);
  // Leaving the input saves.
  await page.getByRole("button", { name: "Rename Boots" }).click();
  await page.getByRole("textbox", { name: "Rename Boots" }).fill("Hiking boots");
  await page.getByRole("heading", { name: "Subtasks" }).click();
  await expect(titlesOf(page)).toHaveText(["Hiking boots", "Rain jacket", "Power bank"]);

  // Delete one: the toast offers Undo, and Task detail stays open.
  await page.getByRole("button", { name: "Delete subtask Rain jacket" }).click();
  await expect(page.getByText("Subtask deleted")).toBeVisible();
  await expect(titlesOf(page)).toHaveText(["Hiking boots", "Power bank"]);
  await expect(section(page).getByText("0 of 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pack for the weekend", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(titlesOf(page)).toHaveText(["Hiking boots", "Rain jacket", "Power bank"]);
  await expect(page.getByRole("checkbox", { name: "Rain jacket" })).toBeChecked();

  await page.reload();
  await expect(titlesOf(page)).toHaveText(["Hiking boots", "Rain jacket", "Power bank"]);
  await expect(page.getByRole("checkbox", { name: "Rain jacket" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Hiking boots" })).not.toBeChecked();
  await expect(section(page).getByText("1 of 3", { exact: true })).toBeVisible();
  await expect(section(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");

  // Unticking works too, also for a Completed one.
  await toggle(page, "Rain jacket");
  await expect(section(page).getByText("0 of 3", { exact: true })).toBeVisible();
});

test("reorder Subtasks with the arrow keys on the handle and by dragging it; the order survives a reload", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pack for the weekend");
  await openTask(page, "Pack for the weekend");
  await addSubtasks(page, "Boots", "Jacket", "Chargers", "Swimwear");

  // Arrow keys: one place at a time, the focus stays on the handle.
  const handle = (title: string) => page.getByRole("button", { name: `Reorder ${title}` });
  await handle("Boots").focus();
  await page.keyboard.press("ArrowDown");
  await expect(titlesOf(page)).toHaveText(["Jacket", "Boots", "Chargers", "Swimwear"]);
  await expect(handle("Boots")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Swimwear", "Boots"]);
  await expect(handle("Boots")).toBeFocused();
  // The end of the list: nothing happens.
  await page.keyboard.press("ArrowDown");
  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Swimwear", "Boots"]);
  await page.keyboard.press("ArrowUp");
  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Boots", "Swimwear"]);
  await expect(handle("Boots")).toBeFocused();

  // Dragging with the mouse: the last row to the top.
  const grip = await boxOf(handle("Swimwear"));
  const first = await boxOf(titlesOf(page).first());
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, first.y - 10, { steps: 12 });
  await page.mouse.up();
  await expect(titlesOf(page)).toHaveText(["Swimwear", "Jacket", "Chargers", "Boots"]);

  // And one row down by a part of the list.
  const gripJacket = await boxOf(handle("Jacket"));
  const last = await boxOf(titlesOf(page).last());
  await page.mouse.move(gripJacket.x + gripJacket.width / 2, gripJacket.y + gripJacket.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripJacket.x + gripJacket.width / 2, last.y + last.height + 10, { steps: 12 });
  await page.mouse.up();
  await expect(titlesOf(page)).toHaveText(["Swimwear", "Chargers", "Boots", "Jacket"]);

  await page.reload();
  await expect(titlesOf(page)).toHaveText(["Swimwear", "Chargers", "Boots", "Jacket"]);
  // The new Subtask goes to the end, after the order the person made.
  await addSubtasks(page, "Hat");
  await expect(titlesOf(page)).toHaveText(["Swimwear", "Chargers", "Boots", "Jacket", "Hat"]);
});

test("a finger drags a Subtask's handle too: the page does not scroll, the row moves", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pack for the weekend");
  await openTask(page, "Pack for the weekend");
  await addSubtasks(page, "Boots", "Jacket", "Chargers");
  await expect(page.getByRole("button", { name: "Reorder Boots" })).toHaveCSS("touch-action", "none");

  // Real touch events (through the DevTools protocol): the browser handles them differently from a mouse.
  const grip = await boxOf(page.getByRole("button", { name: "Reorder Boots" }));
  const last = await boxOf(titlesOf(page).last());
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: TouchType, atY: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: atY, id: 1 }] });
  await send("touchStart", y);
  const target = last.y + last.height + 10;
  for (let step = 1; step <= 10; step++) await send("touchMove", y + ((target - y) * step) / 10);
  await send("touchEnd", target);
  await cdp.detach();

  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Boots"]);
  await page.reload();
  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Boots"]);
});

test("a drag that ends where it started, or is let go over its own row, changes nothing", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pack for the weekend");
  await openTask(page, "Pack for the weekend");
  await addSubtasks(page, "Boots", "Jacket");

  const grip = await boxOf(page.getByRole("button", { name: "Reorder Boots" }));
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 5, { steps: 3 });
  await page.mouse.up();

  await expect(titlesOf(page)).toHaveText(["Boots", "Jacket"]);
});

test("the Task's row shows 'done/total' on the home screen, in the Project view and in the Event view, with words for a screen reader", async ({ page }) => {
  await page.goto("/");
  await addProject(page, "Weekend");
  await tab(page, "Today").click();
  await addEvent(page, "Trip", "2026-10-12");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Today" }).click();
  await addTask(page, "Pack for the weekend", { date: "2026-10-07" });
  await addTask(page, "Book the train", { date: "2026-10-07" });
  await openTask(page, "Pack for the weekend");
  await page.getByRole("combobox", { name: "List", exact: true }).selectOption({ label: "Weekend" });
  await page.getByRole("combobox", { name: "Event" }).selectOption({ label: "Trip · Mon, Oct 12" });
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByRole("link", { name: /Trip/ })).toBeVisible();
  await addSubtasks(page, "Boots", "Jacket", "Chargers");
  await toggle(page, "Boots");
  await expect(section(page).getByText("1 of 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  // Home: after the Event and Offset, and for a screen reader in words. A Task without Subtasks has none.
  const homeRow = row(page, "Pack for the weekend");
  await expect(homeRow).toContainText(/Trip · 5 days before · 1\/3/);
  await expect(homeRow.getByText("1 of 3 subtasks done")).toBeAttached();
  await expect(homeRow.locator("[aria-hidden='true']", { hasText: "1/3" })).toHaveCount(1);
  await expect(row(page, "Book the train")).not.toContainText("/");
  await expect(row(page, "Book the train")).not.toContainText("subtasks done");

  // The Event view: its Linked task.
  await homeRow.getByRole("link", { name: "Trip" }).click();
  await expect(row(page, "Pack for the weekend")).toContainText(/5 days before · Wed, Oct 7 · 1\/3/);
  await expect(row(page, "Pack for the weekend").getByText("1 of 3 subtasks done")).toBeAttached();

  // The Project view: the Task is in the List "Weekend" (a Linked task shows its Event, with the count after it).
  await page.getByRole("button", { name: "Back" }).click();
  await tab(page, "Projects").click();
  await page.getByRole("link").filter({ hasText: "Weekend" }).first().click();
  await expect(page.getByRole("heading", { name: "Weekend", level: 1 })).toBeVisible();
  await expect(row(page, "Pack for the weekend")).toContainText(/Trip · 5 days before · 1\/3/);
  await expect(row(page, "Pack for the weekend").getByText("1 of 3 subtasks done")).toBeAttached();
});

test("a Task without an Event or List shows just the count on a second line of its own, also when every Subtask is done", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pack for the weekend", { date: "2026-10-07" });
  await openTask(page, "Pack for the weekend");
  await addSubtasks(page, "Boots", "Jacket");
  await toggle(page, "Boots");
  await toggle(page, "Jacket");
  await expect(section(page).getByText("2 of 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  const taskRow = row(page, "Pack for the weekend");
  await expect(taskRow.locator(".task-meta")).toHaveText(/^2\/2.*2 of 2 subtasks done$/);
  await expect(taskRow.locator(".task-meta")).not.toContainText("·");
});

test("ticking the last open Subtask offers to Complete the Task: Not now leaves it open, Complete Completes it", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pack for the weekend", { date: "2026-10-07" });
  await openTask(page, "Pack for the weekend");
  await addSubtasks(page, "Boots", "Jacket");
  const offer = page.getByRole("group", { name: "All subtasks are done. Complete the task?" });

  await toggle(page, "Boots");
  await expect(section(page).getByText("1 of 2", { exact: true })).toBeVisible();
  await expect(offer).toBeHidden();
  await toggle(page, "Jacket");

  // The offer comes with the focus on "Complete".
  await expect(offer).toBeVisible();
  await expect(offer.getByRole("button", { name: "Complete" })).toBeFocused();
  await offer.getByRole("button", { name: "Not now" }).click();
  await expect(offer).toBeHidden();
  await expect(page.getByRole("checkbox", { name: "Complete Pack for the weekend" })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Complete", exact: true })).toBeVisible();

  // Untick and tick again: the offer is made again, and a new Subtask closes it (not all are done any more).
  await toggle(page, "Jacket");
  await expect(offer).toBeHidden();
  await toggle(page, "Jacket");
  await expect(offer).toBeVisible();
  await addSubtasks(page, "Chargers");
  await expect(offer).toBeHidden();
  await toggle(page, "Chargers");
  await expect(offer).toBeVisible();

  await offer.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByRole("checkbox", { name: "Complete Pack for the weekend" })).toBeChecked();
  await expect(offer).toBeHidden();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Complete Pack for the weekend" })).toBeChecked();
});

test("the offer closes when the Task is Completed some other way, and a Completed Task is offered nothing", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pack for the weekend", { date: "2026-10-07" });
  await openTask(page, "Pack for the weekend");
  await addSubtasks(page, "Boots");
  const offer = page.getByRole("group", { name: "All subtasks are done. Complete the task?" });
  await toggle(page, "Boots");
  await expect(offer).toBeVisible();

  // The sticky "Complete" button of Task detail.
  await page.locator(".sticky-action").getByRole("button", { name: "Complete" }).click();
  await expect(page.getByRole("checkbox", { name: "Complete Pack for the weekend" })).toBeChecked();
  await expect(offer).toBeHidden();

  // A Completed Task: ticking its last open Subtask offers nothing, nor does adding and ticking one.
  await toggle(page, "Boots");
  await toggle(page, "Boots");
  await expect(page.getByRole("checkbox", { name: "Boots" })).toBeChecked();
  await expect(offer).toBeHidden();
  await addSubtasks(page, "Jacket");
  await toggle(page, "Jacket");
  await expect(page.getByRole("checkbox", { name: "Jacket" })).toBeChecked();
  await expect(offer).toBeHidden();
});

test("Progress is about whole Tasks: ticking Subtasks changes neither the Today ring, a Project's card nor an Event's Progress", async ({ page }) => {
  await page.goto("/");
  await addProject(page, "Weekend");
  await tab(page, "Today").click();
  await addEvent(page, "Trip", "2026-10-12");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Today" }).click();
  await addTask(page, "Pack for the weekend", { date: "2026-10-07" });
  await openTask(page, "Pack for the weekend");
  await page.getByRole("combobox", { name: "List", exact: true }).selectOption({ label: "Weekend" });
  await page.getByRole("combobox", { name: "Event" }).selectOption({ label: "Trip · Mon, Oct 12" });
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByRole("link", { name: /Trip/ })).toBeVisible();
  await addSubtasks(page, "Boots", "Jacket", "Chargers");
  await toggle(page, "Boots");
  await toggle(page, "Jacket");
  await expect(section(page).getByText("2 of 3", { exact: true })).toBeVisible();

  // The Event's own Progress (the Task is its Linked task) is still 0 of 1.
  await page.getByRole("link", { name: /Trip/ }).click();
  await expect(page.getByRole("heading", { name: "Progress: 0 of 1 done" })).toBeVisible();
  // So is the Today ring (the Linked task keeps its date, today).
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Today" }).click();
  await expect(page.locator(".progress-summary")).toHaveText("0 of 1 done");
  // The Project's card.
  await tab(page, "Projects").click();
  await expect(page.getByRole("link").filter({ hasText: "Weekend" })).toContainText("0 of 1");
});

test("Progress of Today ignores Subtasks: a Task due today with two of three ticked still reads 0 of 1 done", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pack for the weekend", { date: "2026-10-07" });
  await openTask(page, "Pack for the weekend");
  await addSubtasks(page, "Boots", "Jacket", "Chargers");
  await toggle(page, "Boots");
  await toggle(page, "Jacket");
  await expect(section(page).getByText("2 of 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  await expect(page.locator(".progress-summary")).toHaveText("0 of 1 done");
  // Completing the Task is what moves it.
  await page.getByRole("checkbox", { name: "Complete Pack for the weekend" }).click();
  await expect(page.locator(".progress-summary")).toHaveText("1 of 1 done");
});

test("Subtasks speak German: the section, the offer, the toast and the count", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption({ label: "Deutsch" });
  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  await page.getByLabel("Titel").fill("Für das Wochenende packen");
  await page.getByLabel("Datum").fill("2026-10-07");
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.setViewportSize({ width: 360, height: 780 });
  await page.getByRole("link", { name: "Für das Wochenende packen", exact: true }).click();

  await expect(section(page).getByRole("heading", { name: "Unteraufgaben", level: 2 })).toBeVisible();
  const input = page.getByRole("textbox", { name: "Unteraufgabe hinzufügen" });
  await expect(input).toHaveAttribute("placeholder", "Unteraufgabe hinzufügen");
  await input.fill("Wanderschuhe mit sehr langem Namen für den Test");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Wanderschuhe mit sehr langem Namen für den Test umbenennen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wanderschuhe mit sehr langem Namen für den Test verschieben" })).toBeVisible();
  await toggle(page, "Wanderschuhe mit sehr langem Namen für den Test");

  await expect(section(page).getByText("1 von 1", { exact: true })).toBeVisible();
  await expect(section(page).getByRole("progressbar", { name: "Erledigte Unteraufgaben" })).toHaveAttribute("aria-valuenow", "1");
  const offer = page.getByRole("group", { name: "Alle Unteraufgaben sind erledigt. Aufgabe erledigen?" });
  await expect(offer.getByRole("button")).toHaveText(["Erledigen", "Nicht jetzt"]);
  // Nothing sticks out of a 360px screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole("button", { name: "Unteraufgabe Wanderschuhe mit sehr langem Namen für den Test löschen" }).click();
  await expect(page.getByText("Unteraufgabe gelöscht")).toBeVisible();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await page.getByRole("button", { name: "Zurück" }).click();
  await expect(page.getByText("1 von 1 Unteraufgabe erledigt")).toBeAttached();
});

test("deleting a Task leaves its Subtasks, which are there again, as they were, when it is restored from the Trash", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pack for the weekend", { date: "2026-10-07" });
  await openTask(page, "Pack for the weekend");
  await addSubtasks(page, "Boots", "Jacket");
  await toggle(page, "Jacket");
  await expect(section(page).getByText("1 of 2", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Task deleted")).toBeVisible();
  await page.getByRole("link", { name: "Trash" }).click();
  // The Trash lists the Task, and no Subtask on its own.
  await expect(page.getByRole("listitem")).toHaveText([/Pack for the weekend/]);
  await page.getByRole("button", { name: "Restore Pack for the weekend" }).click();
  await page.getByRole("button", { name: "Back" }).click();

  await expect(row(page, "Pack for the weekend")).toContainText("1/2");
  await openTask(page, "Pack for the weekend");
  await expect(titlesOf(page)).toHaveText(["Boots", "Jacket"]);
  await expect(page.getByRole("checkbox", { name: "Jacket" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Boots" })).not.toBeChecked();
});

/** A Task "Pack for the weekend" with these Subtasks, open in Task detail. */
async function packWith(page: Page, ...titles: string[]) {
  await page.goto("/");
  await addTask(page, "Pack for the weekend");
  await openTask(page, "Pack for the weekend");
  await addSubtasks(page, ...titles);
}

const handleOf = (page: Page, title: string) => page.getByRole("button", { name: `Reorder ${title}` });

test("a key held down moves a Subtask one place for every press, none is lost and none goes back, also when the screen is slow to show the order", async ({ page }) => {
  // The screen shows what a save left a moment after the save is done: React renders it in a later task. Here that
  // task is held back by 40 ms (React's scheduler posts a message to itself), so a key that repeats while the screen
  // is behind is certain to meet it, not only now and then.
  // The posts held back are counted: if React stops scheduling that way the patch slows nothing, and this test must say so.
  await page.addInitScript(() => {
    /** Replaces a method of a prototype by what `make` builds from the method it had. */
    const around = <T extends object, K extends keyof T>(proto: T, name: K, make: (original: T[K]) => T[K]) => {
      proto[name] = make(proto[name]);
    };
    around(MessagePort.prototype, "postMessage", (post) =>
      function (this: MessagePort, ...args: [unknown]) {
        const slow = window as { slowScreen?: boolean; delayedPosts?: number };
        if (slow.slowScreen === true) {
          slow.delayedPosts = (slow.delayedPosts ?? 0) + 1;
          setTimeout(() => post.apply(this, args), 40);
        } else post.apply(this, args);
      },
    );
  });
  await packWith(page, "A", "B", "C", "D", "E", "F");
  await page.evaluate(() => ((window as { slowScreen?: boolean }).slowScreen = true));

  /** A key held down: the first press, then one more every 20 ms (a repeat rate of 50 per second). */
  async function hold(key: string, presses: number) {
    for (let press = 0; press < presses; press++) {
      if (press > 0) await page.waitForTimeout(20);
      await page.keyboard.down(key);
    }
    await page.keyboard.up(key);
  }

  for (let round = 0; round < 3; round++) {
    await handleOf(page, "A").focus();
    await hold("ArrowDown", 5);
    if (round === 0) expect(await page.evaluate(() => (window as { delayedPosts?: number }).delayedPosts ?? 0), "the screen was really slowed").toBeGreaterThan(0);
    await expect(titlesOf(page)).toHaveText(["B", "C", "D", "E", "F", "A"]);
    await expect(handleOf(page, "A")).toBeFocused();
    await hold("ArrowUp", 5);
    await expect(titlesOf(page)).toHaveText(["A", "B", "C", "D", "E", "F"]);
  }
  // Presses with no wait at all, and past the end: it stops there.
  for (let press = 0; press < 9; press++) await page.keyboard.down("ArrowDown");
  await page.keyboard.up("ArrowDown");
  await expect(titlesOf(page)).toHaveText(["B", "C", "D", "E", "F", "A"]);

  await page.reload();
  await expect(titlesOf(page)).toHaveText(["B", "C", "D", "E", "F", "A"]);
});

test("a drag ends where the row was dropped: when the saved order arrives no row jumps or slides to its place", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers", "Swimwear");
  const grip = await boxOf(handleOf(page, "Swimwear"));
  const first = await boxOf(titlesOf(page).first());
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, first.y - 10, { steps: 12 });

  // Watch every frame from now on: once the first row is "Swimwear" (the saved order is shown), take 20 more frames.
  const frames = page.evaluate(
    () =>
      new Promise<Record<string, number>[]>((resolve) => {
        const tops = () => {
          const found: Record<string, number> = {};
          for (const row of document.querySelectorAll("li.subtask")) {
            const title = row.querySelector(".subtask-title")?.textContent;
            if (title !== undefined && title !== "") found[title] = Math.round(row.getBoundingClientRect().top);
          }
          return found;
        };
        const settled: Record<string, number>[] = [];
        let arrived = false;
        const frame = () => {
          const now = tops();
          if (Object.keys(now)[0] === "Swimwear") arrived = true;
          if (arrived) settled.push(now);
          if (settled.length >= 20) resolve(settled);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  await page.mouse.up();
  const shown = await frames;

  // Nothing moves from the frame the order shows, other than the dropped row finishing its way into place (less than a row).
  const final = shown.at(-1);
  if (final === undefined) throw new Error("no frame was captured");
  const topOf = (frame: Record<string, number>, title: string) => {
    const top = frame[title];
    if (top === undefined) throw new Error(`no row "${title}" in the frame`);
    return top;
  };
  const rowHeight = topOf(final, "Jacket") - topOf(final, "Swimwear");
  for (const frame of shown) {
    for (const title of ["Boots", "Jacket", "Chargers"]) expect(topOf(frame, title), title).toBe(topOf(final, title));
    expect(Math.abs(topOf(frame, "Swimwear") - topOf(final, "Swimwear"))).toBeLessThan(rowHeight / 2);
  }
  await expect(titlesOf(page)).toHaveText(["Swimwear", "Boots", "Jacket", "Chargers"]);
});

test("a reload while a row is dragged, or while it waits to be saved, does not drop the move", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers", "Swimwear");
  const grip = await boxOf(handleOf(page, "Swimwear"));
  const first = await boxOf(titlesOf(page).first());
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, first.y + 5, { steps: 8 });

  // A tick that is saved and shown reloads the Subtasks, with the drag under way. (`click()` of the element keeps the
  // pointer and the focus where they are, as a change that arrives from another device would.)
  await page.evaluate(clickCheck, "Chargers");
  await expect(page.getByRole("checkbox", { name: "Chargers" })).toBeChecked();
  await page.mouse.move(grip.x + grip.width / 2, first.y - 10, { steps: 4 });
  await page.mouse.up();

  await expect(titlesOf(page)).toHaveText(["Swimwear", "Boots", "Jacket", "Chargers"]);
  await page.reload();
  await expect(titlesOf(page)).toHaveText(["Swimwear", "Boots", "Jacket", "Chargers"]);
  await expect(page.getByRole("checkbox", { name: "Chargers" })).toBeChecked();
});

test("the keyboard focus stays in the Subtasks after a rename, a delete and the offer's buttons", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers");

  // A rename ended with Enter, or with Escape, gives the focus back to the row's title.
  await page.getByRole("button", { name: "Rename Chargers" }).click();
  await page.getByRole("textbox", { name: "Rename Chargers" }).fill("Power bank");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Rename Power bank" })).toBeFocused();
  await page.getByRole("button", { name: "Rename Boots" }).click();
  await page.getByRole("textbox", { name: "Rename Boots" }).fill("Sandals");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Rename Boots" })).toBeFocused();

  // A delete moves it to the next row, to the previous one for the last row, to "Add subtask" for the only one.
  await page.getByRole("button", { name: "Delete subtask Jacket" }).click();
  await expect(page.getByRole("button", { name: "Rename Jacket" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rename Power bank" })).toBeFocused();
  await page.getByRole("button", { name: "Delete subtask Power bank" }).click();
  await expect(page.getByRole("button", { name: "Rename Power bank" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rename Boots" })).toBeFocused();
  await page.getByRole("button", { name: "Delete subtask Boots" }).click();
  await expect(page.getByRole("button", { name: "Rename Boots" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Add subtask" })).toBeFocused();

  // The offer: "Not now" gives it to the Subtask that was ticked, "Complete" to the Task's heading.
  await addSubtasks(page, "Hat");
  const offer = page.getByRole("group", { name: "All subtasks are done. Complete the task?" });
  await toggle(page, "Hat");
  await expect(offer.getByRole("button", { name: "Complete" })).toBeFocused();
  await offer.getByRole("button", { name: "Not now" }).click();
  await expect(offer).toBeHidden();
  await expect(page.getByRole("checkbox", { name: "Hat" })).toBeFocused();
  await toggle(page, "Hat");
  await toggle(page, "Hat");
  await offer.getByRole("button", { name: "Complete" }).click();
  await expect(offer).toBeHidden();
  await expect(page.getByRole("heading", { name: "Pack for the weekend", level: 1 })).toBeFocused();
});

test("two Subtasks ticked in quick succession offer to Complete the Task", async ({ page }) => {
  await packWith(page, "Boots", "Jacket");
  const offer = page.getByRole("group", { name: "All subtasks are done. Complete the task?" });

  // Both ticks come before the screen has shown the first.
  await page.evaluate(() => document.querySelectorAll<HTMLInputElement>(".subtask .check").forEach((check) => check.click()));

  await expect(section(page).getByText("2 of 2", { exact: true })).toBeVisible();
  await expect(offer).toBeVisible();
  await offer.getByRole("button", { name: "Not now" }).click();
  await expect(offer).toBeHidden();
});

test("a double tap on a Subtask's check is a tick and an untick: it ends as it was", async ({ page }) => {
  await packWith(page, "Boots", "Jacket");

  await page.getByRole("checkbox", { name: "Boots" }).dblclick();
  // A change saved after it: when the screen shows that, the double tap's two changes are in (they were made first).
  await toggle(page, "Jacket");

  await expect(section(page).getByText("1 of 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Boots" })).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Boots" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Jacket" })).toBeChecked();
});

test("leaving a rename input that was not typed in does not write the old title over a rename made elsewhere", async ({ page, context }) => {
  await packWith(page, "Boots", "Jacket");
  await page.getByRole("button", { name: "Rename Boots" }).click();
  await expect(page.getByRole("textbox", { name: "Rename Boots" })).toBeFocused();

  // Another tab renames "Boots" while the input is open here.
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("link", { name: "Pack for the weekend", exact: true }).click();
  await other.getByRole("button", { name: "Rename Boots" }).click();
  await other.getByRole("textbox", { name: "Rename Boots" }).fill("Sandals");
  await other.keyboard.press("Enter");
  await expect(other.getByRole("button", { name: "Rename Sandals" })).toBeVisible();
  await other.close();

  // A change here reloads the Subtasks, so the input is open with the title it began with while "Sandals" is stored.
  await page.evaluate(clickCheck, "Jacket");
  await expect(page.getByRole("checkbox", { name: "Jacket" })).toBeChecked();
  // The input is still open, and still holds "Boots": it began with that.
  await expect(page.locator(".subtask-title-input")).toHaveValue("Boots");
  await expect(page.locator(".subtask-title-input")).toBeFocused();
  // Leave the input without typing.
  await page.getByRole("heading", { name: "Subtasks" }).click();
  await expect(page.locator(".subtask-title-input")).toHaveCount(0);

  // A saved change after it: the screen has read what was stored by then (a write of the old title would be in it).
  await toggle(page, "Jacket");
  await expect(titlesOf(page)).toHaveText(["Sandals", "Jacket"]);
  await page.reload();
  await expect(titlesOf(page)).toHaveText(["Sandals", "Jacket"]);
});

test("an arrow-key move is described to a screen reader before and announced after: where the Subtask went", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers");
  const handle = handleOf(page, "Boots");
  await expect(handle).toHaveAccessibleDescription("Use the up and down arrow keys to move it, or activate it for buttons that move it");
  const announcement = section(page).locator("[aria-live='polite']");

  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(announcement).toHaveText("Boots moved to 2 of 3");
  await page.keyboard.press("ArrowDown");
  await expect(announcement).toHaveText("Boots moved to 3 of 3");
  // At the end nothing moves, and a press that cannot move it says so (it is no dead press).
  await page.keyboard.press("ArrowDown");
  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Boots"]);
  await expect(announcement).toHaveText("Boots is already last");
  await page.keyboard.press("ArrowUp");
  await expect(announcement).toHaveText("Boots moved to 2 of 3");
});

test("the Subtasks are a list of their own: the 'Add subtask' row is not counted as one", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers");

  const list = section(page).getByRole("list");
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(section(page).getByRole("listitem").filter({ has: page.getByRole("textbox", { name: "Add subtask" }) })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Add subtask" })).toBeVisible();
});

test("Subtasks speak German when moved: the hint and the announcement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption({ label: "Deutsch" });
  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  await page.getByLabel("Titel").fill("Packen");
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("link", { name: "Packen", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Unteraufgabe hinzufügen" });
  for (const title of ["Schuhe", "Jacke"]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("button", { name: `${title} umbenennen` })).toBeVisible();
  }

  const handle = page.getByRole("button", { name: "Schuhe verschieben" });
  await expect(handle).toHaveAccessibleDescription("Mit den Pfeiltasten nach oben oder unten verschieben, oder aktivieren, um Schaltflächen zum Verschieben anzuzeigen");
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(section(page).locator("[aria-live='polite']")).toHaveText("Schuhe auf Platz 2 von 2 verschoben");
});

test("a drag whose row is moved in the page by a change that arrives meanwhile ends, and leaves no row displaced", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers", "Swimwear");
  const grip = await boxOf(handleOf(page, "Boots"));
  const last = await boxOf(titlesOf(page).last());
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 20, { steps: 4 });

  // A change that moves "Jacket" above the dragged row (as one from another device would) makes React move the row's node,
  // and the browser then takes the pointer from the handle: no `pointerup` will come to it.
  await handleOf(page, "Jacket").focus();
  await page.keyboard.press("ArrowUp");
  await expect(titlesOf(page)).toHaveText(["Jacket", "Boots", "Chargers", "Swimwear"]);
  await page.mouse.move(grip.x + grip.width / 2, last.y + last.height + 10, { steps: 6 });
  await page.mouse.up();

  await expect(page.locator("li.subtask.reordering")).toHaveCount(0);
  await expect(page.locator("li.subtask[style*='transform']")).toHaveCount(0);
  await expect(titlesOf(page)).toHaveText(["Jacket", "Boots", "Chargers", "Swimwear"]);
});

test("a drop that the saved order does not show where it was dropped still ends the drag: no row stays displaced", async ({ page, context }) => {
  await packWith(page, "Boots", "Jacket", "Chargers", "Swimwear");
  // Another tab deletes "Swimwear"; this tab does not know yet.
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("link", { name: "Pack for the weekend", exact: true }).click();
  await other.getByRole("button", { name: "Delete subtask Swimwear" }).click();
  await expect(other.getByRole("button", { name: "Undo" })).toBeVisible();
  await other.close();

  // Boots is dropped below the last row, which is index 3 here but 2 in what is stored: the saved order puts it at 2.
  const grip = await boxOf(handleOf(page, "Boots"));
  const last = await boxOf(titlesOf(page).last());
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, last.y + last.height + 10, { steps: 10 });
  await page.mouse.up();

  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Boots"]);
  await expect(page.locator("li.subtask.reordering")).toHaveCount(0);
  await expect(page.locator("li.subtask[style*='transform']")).toHaveCount(0);
});

test("a dropped row is placed by the layout: past a row that is taller the saved order shows it where it already was", async ({ page }) => {
  const tall = "A title long enough to wrap onto a second and a third line of this narrow screen, so the row is much taller";
  await packWith(page, "Boots", tall, "Chargers", "Swimwear");
  const rowOf = (title: string) => page.locator("li.subtask").filter({ has: page.getByRole("button", { name: `Rename ${title}` }) });
  const before = await boxOf(rowOf("Boots"));
  const grip = await boxOf(handleOf(page, "Boots"));
  const last = await boxOf(titlesOf(page).last());
  expect((await boxOf(rowOf(tall))).height).toBeGreaterThan(before.height * 1.4);

  // The transform the dropped row has when the saved order arrives (the style that goes then, read from the mutation).
  const dropped = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const boots = [...document.querySelectorAll("li.subtask")].find((li) => li.querySelector(".subtask-title")?.textContent === "Boots");
        if (boots === undefined) throw new Error("No row for Boots.");
        let last = "";
        new MutationObserver((records) => {
          for (const record of records) if (record.target === boots) last = record.oldValue ?? "";
          const offset = /translateY\((-?[\d.]+)px\)/.exec(last);
          if ((boots.getAttribute("style") ?? "") === "" && offset !== null) resolve(Number(offset[1]));
        }).observe(boots, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
      }),
  );
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, last.y + last.height + 10, { steps: 12 });
  await page.mouse.up();
  const translate = await dropped;

  await expect(titlesOf(page).last()).toHaveText("Boots");
  const after = await boxOf(rowOf("Boots"));
  expect(Math.abs(translate - (after.y - before.y))).toBeLessThan(1.5);
});

test("a handle that is tapped shows Move up and Move down buttons: a screen reader on a phone can reorder with them", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers");
  const handle = handleOf(page, "Boots");
  const up = (title: string) => page.getByRole("button", { name: `Move ${title} up` });
  const down = (title: string) => page.getByRole("button", { name: `Move ${title} down` });
  const announcement = section(page).locator("[aria-live='polite']");
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  await expect(down("Boots")).toHaveCount(0);

  // A tap (a touch, as an activation by a screen reader is) shows them.
  await handle.tap();
  await expect(handle).toHaveAttribute("aria-expanded", "true");
  await expect(down("Boots")).toBeVisible();
  await down("Boots").tap();
  await expect(titlesOf(page)).toHaveText(["Jacket", "Boots", "Chargers"]);
  await expect(announcement).toHaveText("Boots moved to 2 of 3");
  // The button that moved the row keeps the focus, so the next activation moves it again.
  await expect(down("Boots")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Boots"]);
  await expect(announcement).toHaveText("Boots moved to 3 of 3");
  await expect(down("Boots")).toBeFocused();
  await up("Boots").click();
  await expect(titlesOf(page)).toHaveText(["Jacket", "Boots", "Chargers"]);
  await expect(up("Boots")).toBeFocused();

  // Escape closes them and the handle has the focus; a keyboard activation of the handle shows them again.
  await page.keyboard.press("Escape");
  await expect(down("Boots")).toHaveCount(0);
  await expect(handle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(down("Boots")).toBeVisible();
  await handle.click();
  await expect(down("Boots")).toHaveCount(0);

  await page.reload();
  await expect(titlesOf(page)).toHaveText(["Jacket", "Boots", "Chargers"]);
});

test("dragging a handle does not show the Move buttons, and the next tap does", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers");
  const grip = await boxOf(handleOf(page, "Boots"));
  const last = await boxOf(titlesOf(page).last());
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, last.y + last.height + 10, { steps: 8 });
  await page.mouse.up();
  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Boots"]);
  await expect(page.locator(".subtask-moves")).toHaveCount(0);

  await handleOf(page, "Boots").click();
  await expect(page.getByRole("button", { name: "Move Boots up" })).toBeVisible();
});

test("the Move buttons speak German", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption({ label: "Deutsch" });
  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  await page.getByLabel("Titel").fill("Packen");
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("link", { name: "Packen", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Unteraufgabe hinzufügen" });
  for (const title of ["Schuhe", "Jacke"]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("button", { name: `${title} umbenennen` })).toBeVisible();
  }

  await page.getByRole("button", { name: "Schuhe verschieben" }).click();
  await page.getByRole("button", { name: "Schuhe nach unten verschieben" }).click();
  await expect(titlesOf(page)).toHaveText(["Jacke", "Schuhe"]);
  await expect(page.getByRole("button", { name: "Schuhe nach unten verschieben" })).toBeFocused();
  await expect(section(page).locator("[aria-live='polite']")).toHaveText("Schuhe auf Platz 2 von 2 verschoben");
});

test("a tick that fails for a real reason is not remembered: the next tap on the check ticks it", async ({ page }) => {
  await page.addInitScript(() => {
    /** Replaces a method of a prototype by what `make` builds from the method it had. */
    const around = <T extends object, K extends keyof T>(proto: T, name: K, make: (original: T[K]) => T[K]) => {
      proto[name] = make(proto[name]);
    };
    around(IDBObjectStore.prototype, "put", (put) =>
      function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
        if ((window as { failWrites?: boolean }).failWrites === true) throw new DOMException("The disk is full", "QuotaExceededError");
        return put.apply(this, args);
      },
    );
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await packWith(page, "Boots", "Jacket");

  await page.evaluate(() => ((window as { failWrites?: boolean }).failWrites = true));
  await page.evaluate(clickCheck, "Boots");
  await expect.poll(() => errors.length).toBe(1);
  expect(errors[0]).toContain("disk is full");
  await expect(page.getByRole("checkbox", { name: "Boots" })).not.toBeChecked();

  // The saves work again: this tap is a tick, not the undoing of a tick that never happened.
  await page.evaluate(() => ((window as { failWrites?: boolean }).failWrites = false));
  await page.getByRole("checkbox", { name: "Boots" }).click();
  await expect(page.getByRole("checkbox", { name: "Boots" })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Boots" })).toBeChecked();
});

test("when the offer goes by itself while it has the focus, the focus goes to the Subtask that was ticked, not to the page", async ({ page }) => {
  await packWith(page, "Boots", "Jacket");
  const offer = page.getByRole("group", { name: "All subtasks are done. Complete the task?" });
  await toggle(page, "Boots");
  await toggle(page, "Jacket");
  await expect(offer.getByRole("button", { name: "Complete" })).toBeFocused();

  // "Boots" is unticked by a change that does not move the focus (as one from another device would).
  await page.evaluate(clickCheck, "Boots");

  await expect(offer).toBeHidden();
  await expect(page.getByRole("checkbox", { name: "Jacket" })).toBeFocused();
});

test("unticking the Subtask that made the offer withdraws the offer at once, before the untick is saved", async ({ page }) => {
  await packWith(page, "Boots", "Jacket");
  const offer = page.getByRole("group", { name: "All subtasks are done. Complete the task?" });
  await toggle(page, "Boots");
  await toggle(page, "Jacket");
  await expect(offer).toBeVisible();

  // Straight after the click, in the same task: the saving has not even begun, and the screen shows "Jacket" still ticked.
  const offerStays = await page.evaluate(() => {
    document.querySelector<HTMLInputElement>('input[aria-label="Jacket"]')?.click();
    return document.querySelector(".subtask-offer") !== null;
  });

  expect(offerStays).toBe(false);
  await expect(page.getByRole("checkbox", { name: "Jacket" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Jacket" })).toBeFocused();
});

test("a double tap on the last open Subtask, at any pace, leaves no offer and the focus on its check", async ({ page }) => {
  await packWith(page, "Boots", "Jacket");
  const offer = page.getByRole("group", { name: "All subtasks are done. Complete the task?" });
  /** Clicks without moving the focus, as a change from elsewhere would. */
  const click = (title: string) => page.evaluate(clickCheck, title);

  for (const gap of [0, 4, 8, 12, 20, 30, 40]) {
    await click("Boots");
    await expect(page.getByRole("checkbox", { name: "Boots" })).toBeChecked();
    await page.evaluate(
      ([ms]) =>
        new Promise<void>((resolve) => {
          const jacket = document.querySelector<HTMLInputElement>('input[aria-label="Jacket"]');
          if (jacket === null) throw new Error("No check for Jacket.");
          jacket.focus();
          jacket.click();
          setTimeout(() => {
            jacket.click();
            resolve();
          }, ms);
        }),
      [gap],
    );
    // A saved change after the double tap: when it is shown, the double tap's two changes are in.
    await click("Boots");
    await expect(page.getByRole("checkbox", { name: "Boots" })).not.toBeChecked();

    await expect(page.getByRole("checkbox", { name: "Jacket" }), `gap ${gap} ms`).not.toBeChecked();
    await expect(offer, `gap ${gap} ms`).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Jacket" }), `gap ${gap} ms`).toBeFocused();
  }
});

test.describe("a Task or Subtask that another tab deleted meanwhile", () => {
  /** Task detail of "Pack" with the Subtask "Boots" is open here, and another tab then deletes what `what` says. */
  async function deletedInAnotherTab(page: Page, context: BrowserContext, what: "task" | "subtask") {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await addTask(page, "Pack");
    await openTask(page, "Pack");
    await addSubtasks(page, "Boots");

    const other = await context.newPage();
    await other.goto("/");
    await other.getByRole("link", { name: "Pack", exact: true }).click();
    await expect(other.getByRole("button", { name: "Rename Boots" })).toBeVisible();
    if (what === "task") await other.getByRole("button", { name: "Delete", exact: true }).click();
    else await other.getByRole("button", { name: "Delete subtask Boots" }).click();
    await expect(other.getByRole("button", { name: "Undo" })).toBeVisible();
    await other.close();
    return errors;
  }

  test("adding a Subtask to a Task that is gone ends calmly, not in an error", async ({ page, context }) => {
    const errors = await deletedInAnotherTab(page, context, "task");

    await page.getByRole("textbox", { name: "Add subtask" }).fill("Jacket");
    await page.getByRole("textbox", { name: "Add subtask" }).press("Enter");

    await expect(page.getByText("This task doesn't exist (any more).")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("ticking a Subtask that is gone ends calmly, not in an error", async ({ page, context }) => {
    const errors = await deletedInAnotherTab(page, context, "subtask");

    await page.getByRole("checkbox", { name: "Boots" }).click();
    await expect(page.getByRole("button", { name: "Rename Boots" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("renaming a Subtask that is gone ends calmly, not in an error", async ({ page, context }) => {
    const errors = await deletedInAnotherTab(page, context, "subtask");

    await page.getByRole("button", { name: "Rename Boots" }).click();
    await page.getByRole("textbox", { name: "Rename Boots" }).fill("Sandals");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("button", { name: /^Rename/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("deleting a Subtask that is gone ends calmly, not in an error", async ({ page, context }) => {
    const errors = await deletedInAnotherTab(page, context, "subtask");

    await page.getByRole("button", { name: "Delete subtask Boots" }).click();

    await expect(page.getByRole("button", { name: "Rename Boots" })).toHaveCount(0);
    // Nothing was deleted here, so there is nothing to undo: Undo would bring back what the other tab deleted.
    await expect(page.getByText("Subtask deleted")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a tick that fails because the Subtask is gone leaves no offer behind, when the Subtasks that are left are all done", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await addTask(page, "Pack");
    await openTask(page, "Pack");
    await addSubtasks(page, "Boots", "Jacket");
    await toggle(page, "Boots");
    const other = await context.newPage();
    await other.goto("/");
    await other.getByRole("link", { name: "Pack", exact: true }).click();
    await other.getByRole("button", { name: "Delete subtask Jacket" }).click();
    await expect(other.getByRole("button", { name: "Undo" })).toBeVisible();
    await other.close();

    // "Jacket" was the last open one here, so the tick was to offer Completing the Task; it is gone, and nothing was ticked.
    await page.getByRole("checkbox", { name: "Jacket" }).click();

    await expect(page.getByRole("button", { name: "Rename Jacket" })).toHaveCount(0);
    await expect(section(page).getByText("1 of 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "All subtasks are done. Complete the task?" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

/**
 * Holds a readwrite transaction on one of the database's stores from a second connection, so that every save and read
 * of that store waits, until `release()` is called. Resolves once the transaction is open.
 */
async function holdStore(page: Page, store: string) {
  await page.evaluate(
    (store) =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("grilled-heads-up");
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(store, "readwrite");
          const objects = tx.objectStore(store);
          let held = true;
          (window as { releaseStore?: () => void }).releaseStore = () => (held = false);
          // A request after the other keeps the transaction open (a transaction with no request left commits).
          const keep = () => {
            if (held) objects.get("nothing").onsuccess = keep;
          };
          keep();
          tx.oncomplete = () => db.close();
          resolve();
        };
      }),
    store,
  );
  return () => page.evaluate(() => (window as { releaseStore?: () => void }).releaseStore?.());
}

test("a second drag, started while the first drop is still being saved, is not ended when the first move settles", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers", "Swimwear");
  const grip = await boxOf(handleOf(page, "Boots"));
  const last = await boxOf(titlesOf(page).last());
  const release = await holdStore(page, "subtasks");

  // Drop "Boots" below the last row: its move waits for the held store. (React moves the node of "Boots" only when the
  // order arrives, so the browser keeps the pointer on the handle of the row grabbed next.)
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, last.y + last.height + 10, { steps: 8 });
  await page.mouse.up();
  // Grab "Chargers" before that is saved and shown.
  const second = await boxOf(handleOf(page, "Chargers"));
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2 + 15, { steps: 3 });
  await expect(page.locator("li.subtask.dragging .subtask-title")).toHaveText("Chargers");

  // The first move is saved and shown; the second drag, the mouse still down, goes on.
  await release();
  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Swimwear", "Boots"]);
  await expect(page.locator("li.subtask.dragging .subtask-title")).toHaveText("Chargers");
  const top = await boxOf(titlesOf(page).first());
  await page.mouse.move(second.x + second.width / 2, top.y - 30, { steps: 8 });
  await page.mouse.up();

  await expect(titlesOf(page)).toHaveText(["Chargers", "Jacket", "Swimwear", "Boots"]);
  await expect(page.locator("li.subtask.dragging")).toHaveCount(0);
  await page.reload();
  await expect(titlesOf(page)).toHaveText(["Chargers", "Jacket", "Swimwear", "Boots"]);
});

test("a drop that another reload overlaps never shows the old order again before the new one: no row snaps back", async ({ page }) => {
  // A tick of another Subtask reloads the Subtasks too. When it starts while the drop's reload is under way, the drop's
  // reload is passed over and hands nothing on: the screen must not be told the move is over before the newer reload shows it.
  // The gap between the two is a few milliseconds, so the tick comes at several delays after the drop.
  await packWith(page, "Boots", "Jacket", "Chargers", "Swimwear");
  await page.evaluate(() => {
    const list = document.querySelector("ul.subtask-list");
    if (list === null) throw new Error("No list of Subtasks.");
    const seen = window as { snapBack?: string[]; mover?: string };
    const snapBack: string[] = [];
    seen.snapBack = snapBack;
    // A state with no row displaced and the dropped row still last is the old order shown for a moment (a row snapping
    // back), whichever frame it would have been painted in.
    new MutationObserver(() => {
      const rows = [...list.querySelectorAll("li.subtask")];
      const titles = rows.map((row) => row.querySelector(".subtask-title")?.textContent);
      const displaced = rows.some((row) => (row.getAttribute("style") ?? "") !== "");
      if (!displaced && seen.mover !== undefined && titles[titles.length - 1] === seen.mover) snapBack.push(seen.mover);
    }).observe(list, { subtree: true, attributes: true, childList: true });
  });

  for (const delay of [0, 1, 2, 3, 5, 8, 12, 16, 20, 30]) {
    const mover = await textOf(titlesOf(page).last());
    const grip = await boxOf(handleOf(page, mover));
    const first = await boxOf(titlesOf(page).first());
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, first.y - 10, { steps: 8 });
    await page.evaluate(
      ({ mover, delay }) => {
        (window as { mover?: string }).mover = mover;
        document.addEventListener(
          "pointerup",
          () => setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Boots"]')?.click(), delay),
          { once: true, capture: true },
        );
      },
      { mover, delay },
    );
    await page.mouse.up();
    await expect(titlesOf(page).first()).toHaveText(mover);
    await expect(page.locator("li.subtask[style*='transform']")).toHaveCount(0);
    await page.evaluate(() => ((window as { mover?: string | undefined }).mover = undefined));
  }
  expect(await page.evaluate(() => (window as { snapBack?: string[] }).snapBack), "the order before the drop was shown for a moment").toEqual([]);
});

test("after a finger drag, which sends no click, Enter on a handle still shows the Move buttons", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers");
  const grip = await boxOf(handleOf(page, "Boots"));
  const last = await boxOf(titlesOf(page).last());
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: TouchType, atY: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: atY, id: 1 }] });
  await send("touchStart", y);
  const target = last.y + last.height + 10;
  for (let step = 1; step <= 10; step++) await send("touchMove", y + ((target - y) * step) / 10);
  await send("touchEnd", target);
  await cdp.detach();
  await expect(titlesOf(page)).toHaveText(["Jacket", "Chargers", "Boots"]);
  await expect(page.locator(".subtask-moves")).toHaveCount(0);

  // The first activation from the keyboard counts: it is no click that ends a drag.
  await handleOf(page, "Jacket").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Move Jacket down" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".subtask-moves")).toHaveCount(0);
});

test("a press that cannot move the row says so: the first Subtask up, the last one down, each time", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers");
  const announcement = section(page).locator("[aria-live='polite']");
  await handleOf(page, "Boots").focus();
  await page.keyboard.press("ArrowUp");
  await expect(announcement).toHaveText("Boots is already first");
  // The live region's content is replaced by every announcement, so a screen reader reads a repeated one again:
  // mark the node, press again, and the marked node is gone.
  await announcement.locator("span").evaluate((node) => node.setAttribute("data-read", ""));
  await page.keyboard.press("ArrowUp");
  await expect(announcement.locator("span")).toHaveText("Boots is already first");
  await expect(announcement.locator("span[data-read]")).toHaveCount(0);

  // With the Move buttons (what a screen reader on a phone uses) too.
  await handleOf(page, "Chargers").click();
  await page.getByRole("button", { name: "Move Chargers down" }).click();
  await expect(announcement).toHaveText("Chargers is already last");
  await expect(titlesOf(page)).toHaveText(["Boots", "Jacket", "Chargers"]);
  await expect(page.getByRole("button", { name: "Move Chargers down" })).toBeFocused();
});

test("a press that cannot move the row speaks German", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption({ label: "Deutsch" });
  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  await page.getByLabel("Titel").fill("Packen");
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("link", { name: "Packen", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Unteraufgabe hinzufügen" });
  for (const title of ["Schuhe", "Jacke"]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("button", { name: `${title} umbenennen` })).toBeVisible();
  }

  await page.getByRole("button", { name: "Schuhe verschieben" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(section(page).locator("[aria-live='polite']")).toHaveText("Schuhe ist schon an erster Stelle");
  await page.getByRole("button", { name: "Jacke verschieben" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(section(page).locator("[aria-live='polite']")).toHaveText("Jacke ist schon an letzter Stelle");
});

test("a finger drag that the browser cancels ends: no row stays displaced", async ({ page }) => {
  await packWith(page, "Boots", "Jacket", "Chargers");
  const grip = await boxOf(handleOf(page, "Boots"));
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: TouchType, atY: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y: atY, id: 1 }] });
  await send("touchStart", y);
  for (let step = 1; step <= 5; step++) await send("touchMove", y + step * 12);
  await expect(page.locator("li.subtask.dragging")).toHaveCount(1);
  // The browser takes the touch (no `pointerup`): the handle loses the pointer, and that ends the drag.
  await send("touchCancel", y + 60);
  await cdp.detach();

  await expect(page.locator("li.subtask.dragging")).toHaveCount(0);
  await expect(page.locator("li.subtask[style*='transform']")).toHaveCount(0);
  await expect(titlesOf(page)).toHaveText(["Boots", "Jacket", "Chargers"]);
});
