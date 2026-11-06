import { expect, test } from "./fixtures";
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
  const grip = (await handle("Swimwear").boundingBox())!;
  const first = (await titlesOf(page).first().boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, first.y - 10, { steps: 12 });
  await page.mouse.up();
  await expect(titlesOf(page)).toHaveText(["Swimwear", "Jacket", "Chargers", "Boots"]);

  // And one row down by a part of the list.
  const gripJacket = (await handle("Jacket").boundingBox())!;
  const last = (await titlesOf(page).last().boundingBox())!;
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
  const grip = (await page.getByRole("button", { name: "Reorder Boots" }).boundingBox())!;
  const last = (await titlesOf(page).last().boundingBox())!;
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, atY: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: atY, id: 1 }] });
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

  const grip = (await page.getByRole("button", { name: "Reorder Boots" }).boundingBox())!;
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
  await expect(page.getByText("1 von 1 Unteraufgaben erledigt")).toBeAttached();
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
    expect(errors).toEqual([]);
  });
});
