import { expect, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

/** Wednesday 7 October 2026, 13:05: tomorrow is Thu Oct 8, next Monday is Oct 12. */
const wednesday = new Date(2026, 9, 7, 13, 5);

/** Adds a Task through the "+" button; without a date it goes to the Inbox. */
async function addTask(page: Page, title: string, { date = "", time = "" } = {}) {
  await page.getByRole("button", { name: "New Task" }).click();
  await page.getByLabel("Title").fill(title);
  if (date) await page.getByLabel("Date").fill(date);
  if (time) await page.getByLabel("Time").fill(time);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

const bucket = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const row = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });

/** Drags a row with the mouse (pointer events, like a finger), from `fromX` pixels from the left of the window. */
async function drag(page: Page, title: string, fromX: number, byX: number) {
  const box = (await row(page, title).boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(fromX + byX, y, { steps: 8 });
  await page.mouse.up();
}

/** Swipes a row left from its right side, away from the edge zones. */
async function swipeLeft(page: Page, title: string) {
  await drag(page, title, 330, -230);
}

const rectOf = async (locator: Locator) => (await locator.boundingBox())!;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.beforeEach(async ({ page }) => {
  // Starts the page's clock on Wednesday 13:05 and lets it run, so Tasks added one after the other have distinct
  // creation times (their order in a Bucket), and a deletion's time orders the Trash.
  await page.clock.install({ time: wednesday });
});

test("swiping a row left reveals Reschedule, Complete and Delete; Complete works from there", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  await addTask(page, "Order cake", { date: "2026-10-07" });
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await swipeLeft(page, "Pay dentist invoice");

  for (const name of ["Reschedule", "Complete", "Delete"]) await expect(row(page, "Pay dentist invoice").getByRole("button", { name, exact: true })).toBeVisible();
  await row(page, "Pay dentist invoice").getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Complete Pay dentist invoice" })).toBeChecked();
  // A Task in Today works the same, and only one row is open at a time.
  await swipeLeft(page, "Order cake");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(1);
  await page.getByRole("heading", { name: "Today", level: 1 }).click();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("a swipe that starts at either screen edge opens nothing", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  const width = page.viewportSize()!.width;
  const content = row(page, "Pay dentist invoice").locator(".swipe-content");

  await drag(page, "Pay dentist invoice", width - 6, -230);
  await drag(page, "Pay dentist invoice", 20, 230);
  await drag(page, "Pay dentist invoice", 20, -100);

  await expect(content).toHaveCSS("transform", "none");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$|^[^#]*$/);
});

test("a short swipe snaps back, and a vertical drag moves nothing", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  const content = row(page, "Pay dentist invoice").locator(".swipe-content");

  await drag(page, "Pay dentist invoice", 330, -40);
  await expect(content).toHaveCSS("transform", "none");

  const box = (await row(page, "Pay dentist invoice").boundingBox())!;
  await page.mouse.move(330, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(300, box.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect(content).toHaveCSS("transform", "none");
});

test("an Overdue Task can't be rescheduled to today: no Today in the sheet, and the date picker starts tomorrow", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  await expect(bucket(page, "Overdue")).toContainText("Pay dentist invoice");

  await swipeLeft(page, "Pay dentist invoice");
  await row(page, "Pay dentist invoice").getByRole("button", { name: "Reschedule", exact: true }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Pay dentist invoice" })).toBeVisible();
  await expect(sheet.getByRole("button")).toHaveText([/Tomorrow.*Thu, Oct 8/, /Day after tomorrow.*Fri, Oct 9/, /Next week.*Mon, Oct 12/, "Pick a date", "Cancel"]);
  await expect(sheet.getByRole("button", { name: "Today" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Pick a date" }).click();
  await expect(sheet.getByLabel("Date")).toHaveAttribute("min", "2026-10-08");
  await expect(sheet.getByLabel("Date")).toHaveValue("2026-10-08");

  await sheet.getByRole("button", { name: /^Tomorrow/ }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByText("Nothing overdue.")).toBeVisible();
  await expect(bucket(page, "Tomorrow")).toContainText("Pay dentist invoice");
});

test("Pick a date takes a later day, and an empty date means tomorrow", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  await addTask(page, "Book restaurant", { date: "2026-10-06" });

  await row(page, "Pay dentist invoice").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Reschedule" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Pick a date" }).click();
  await page.getByRole("dialog").getByLabel("Date").fill("2026-10-20");
  await page.getByRole("dialog").getByRole("button", { name: "Reschedule", exact: true }).click();
  await expect(bucket(page, "Later")).toContainText(/Pay dentist invoice.*Tue, Oct 20/);

  await row(page, "Book restaurant").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Reschedule" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Pick a date" }).click();
  await page.getByRole("dialog").getByLabel("Date").fill("");
  await page.getByRole("dialog").getByRole("button", { name: "Reschedule", exact: true }).click();
  await expect(bucket(page, "Tomorrow")).toContainText("Book restaurant");
});

test("Reschedule all… empties the Overdue bucket in two taps", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-01" });
  await addTask(page, "Buy gift for Mom", { date: "2026-10-05" });
  await addTask(page, "Order cake", { date: "2026-10-07" });
  await expect(bucket(page, "Overdue").getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Reschedule all…" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "2 tasks" })).toBeVisible();
  await expect(sheet.getByRole("button").first()).toHaveText(/Tomorrow/);
  await sheet.getByRole("button", { name: /^Tomorrow/ }).click();

  await expect(page.getByText("Nothing overdue.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reschedule all…" })).toHaveCount(0);
  await expect(bucket(page, "Tomorrow").getByRole("listitem")).toHaveText([/Pay dentist invoice/, /Buy gift for Mom/]);
  await expect(bucket(page, "Today")).toContainText("Order cake");
});

test("Next week is the next Monday", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });

  await row(page, "Pay dentist invoice").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Reschedule" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Next week/ }).click();

  await expect(bucket(page, "Later")).toContainText(/Pay dentist invoice.*Mon, Oct 12/);
});

test("Delete shows an undo toast that stays clear of the + button and the tab bar; Undo brings the Task back as it was", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-09", time: "09:30" });

  await swipeLeft(page, "Pay dentist invoice");
  await row(page, "Pay dentist invoice").getByRole("button", { name: "Delete", exact: true }).click();

  const toast = page.getByText("Task deleted");
  await expect(toast).toBeVisible();
  await expect(row(page, "Pay dentist invoice")).toHaveCount(0);
  const box = await rectOf(page.locator(".undo-toast"));
  expect(overlaps(box, await rectOf(page.getByRole("button", { name: "New Task" })))).toBe(false);
  expect(box.y + box.height).toBeLessThanOrEqual((await rectOf(page.getByRole("navigation", { name: "Main" }))).y);

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(toast).toBeHidden();
  await expect(bucket(page, "Next 3 days")).toContainText(/Pay dentist invoice.*Fri, Oct 9 · 9:30 AM/);
});

test("a deleted Task is in the Trash, newest first, and Restore puts it back", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Order cake", { date: "2026-10-07" });
  await addTask(page, "Call the plumber", { date: "2026-10-07" });
  await addTask(page, "Birthday card");

  for (const title of ["Order cake", "Call the plumber"]) {
    await row(page, title).dispatchEvent("contextmenu");
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Task deleted")).toBeVisible();
  }
  await page.getByRole("link", { name: "Trash" }).click();

  await expect(page.getByRole("heading", { name: "Trash", level: 1 })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveText([/Call the plumber.*Deleted Oct 7 · 30 days left/, /Order cake.*Deleted Oct 7 · 30 days left/]);
  await expect(page.getByText("Deleted tasks stay here for 30 days.")).toBeVisible();
  await page.getByRole("button", { name: "Restore Order cake" }).click();
  await expect(page.getByRole("listitem")).toHaveText([/Call the plumber/]);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(bucket(page, "Today")).toContainText("Order cake");
  await expect(bucket(page, "Today")).not.toContainText("Call the plumber");
  await expect(bucket(page, "Inbox")).toContainText("Birthday card");
});

test("the undo toast goes after 5 seconds, and the Task is then restored from the Trash", async ({ page }) => {
  // The page's clock is faked (see beforeEach), so the 5 seconds pass at once.
  await page.goto("/");
  await addTask(page, "Order cake", { date: "2026-10-07" });

  await row(page, "Order cake").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Task deleted")).toBeVisible();
  await page.clock.fastForward(4_000);
  await expect(page.getByText("Task deleted")).toBeVisible();
  await page.clock.fastForward(1_500);
  await expect(page.getByText("Task deleted")).toBeHidden();

  await page.getByRole("link", { name: "Trash" }).click();
  await page.getByRole("button", { name: "Restore Order cake" }).click();
  await expect(page.getByText("The Trash is empty.")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(bucket(page, "Today")).toContainText("Order cake");
});

test("a Task deleted 30 days ago is gone from the Trash", async ({ page }) => {
  // Frozen, so the deletion is at exactly this moment and the 30 days can be counted from it.
  await page.clock.setFixedTime(wednesday);
  await page.goto("/");
  await addTask(page, "Order cake", { date: "2026-10-07" });
  await row(page, "Order cake").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Task deleted")).toBeVisible();
  const day = 24 * 60 * 60 * 1000;

  // A minute short of 30 days: still there, on its last day.
  await page.clock.setFixedTime(new Date(wednesday.getTime() + 30 * day - 60_000));
  await page.goto("/#/trash");
  await page.reload();
  await expect(page.getByRole("listitem")).toHaveText([/Order cake.*1 day left/]);

  await page.clock.setFixedTime(new Date(wednesday.getTime() + 30 * day));
  await page.reload();
  await expect(page.getByText("The Trash is empty.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Restore/ })).toHaveCount(0);
});

test("a long press (or right click) opens the Task actions sheet", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Order cake", { date: "2026-10-08" });

  await row(page, "Order cake").dispatchEvent("contextmenu");

  const sheet = page.getByRole("dialog", { name: "Order cake" });
  await expect(sheet.getByRole("button")).toHaveText(["Complete", "Reschedule", "Delete", "Cancel"]);
  await sheet.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByRole("checkbox", { name: "Complete Order cake" })).toBeChecked();

  // A Completed Task can only be deleted.
  await row(page, "Order cake").dispatchEvent("contextmenu");
  await expect(page.getByRole("dialog").getByRole("button")).toHaveText(["Delete", "Cancel"]);
});

test("Task detail has the same actions: Reschedule chips, Delete and a Complete button", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  await addTask(page, "Order cake", { date: "2026-10-07" });
  await addTask(page, "Call the plumber", { date: "2026-10-07" });

  await page.getByRole("link", { name: "Pay dentist invoice" }).click();
  const chips = page.getByRole("region", { name: "Reschedule" }).getByRole("button");
  await expect(chips).toHaveText(["Tomorrow", "Day after tomorrow", "Next week", "Pick a date"]);
  await chips.filter({ hasText: "Day after tomorrow" }).click();
  await expect(page.getByText("Due Fri, Oct 9")).toBeVisible();
  await page.getByRole("button", { name: "Pick a date" }).click();
  await expect(page.locator(".pick-date").getByLabel("Date")).toHaveAttribute("min", "2026-10-07");

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("link", { name: "Order cake" }).click();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Complete Order cake" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("link", { name: "Call the plumber" }).click();
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByText("Task deleted")).toBeVisible();
  await expect(bucket(page, "Today")).not.toContainText("Call the plumber");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(bucket(page, "Today")).toContainText("Call the plumber");
});

test("Rescheduling a Linked task in the Event view changes its Offset, so it keeps following the Event", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Task" }).click();
  await page.getByRole("button", { name: "New event" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Mom's birthday");
  await page.getByLabel("Start date").fill("2026-10-14");
  await page.getByLabel("Start time").fill("12:30");
  await page.getByLabel("End time").fill("15:00");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Add task" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Title").fill("Buy gift");
  await sheet.getByLabel("Days").fill("7");
  await sheet.getByRole("button", { name: "Add" }).click();
  await expect(row(page, "Buy gift")).toContainText("7 days before · Wed, Oct 7");

  await swipeLeft(page, "Buy gift");
  await row(page, "Buy gift").getByRole("button", { name: "Reschedule", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Tomorrow/ }).click();

  await expect(row(page, "Buy gift")).toContainText("6 days before · Thu, Oct 8");
  // Moving the Event moves the Task with it: it still has its Offset.
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Start date").fill("2026-10-16");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row(page, "Buy gift")).toContainText("6 days before · Sat, Oct 10");
});

test("the Reschedule sheet speaks German", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption({ label: "Deutsch" });
  await addTaskGerman(page, "Rechnung zahlen", "2026-10-05");

  await row(page, "Rechnung zahlen").dispatchEvent("contextmenu");
  await expect(page.getByRole("dialog").getByRole("button")).toHaveText(["Erledigen", "Verschieben", "Löschen", "Abbrechen"]);
  await page.getByRole("dialog").getByRole("button", { name: "Verschieben" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button")).toHaveText([/Morgen.*Do\., 8\. Okt\./, /Übermorgen.*Fr\., 9\. Okt\./, /Nächste Woche.*Mo\., 12\. Okt\./, "Datum wählen", "Abbrechen"]);
  await sheet.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByRole("button", { name: "Alle verschieben…" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Papierkorb" })).toBeVisible();
});

async function addTaskGerman(page: Page, title: string, date: string) {
  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  await page.getByLabel("Titel").fill(title);
  await page.getByLabel("Datum").fill(date);
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}
