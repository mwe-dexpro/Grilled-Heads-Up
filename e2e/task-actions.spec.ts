import { boxOf, expect, test, type TouchType } from "./fixtures";
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
  const box = await boxOf(row(page, title));
  const y = box.y + box.height / 2;
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(fromX + byX, y, { steps: 8 });
  await page.mouse.up();
}

/**
 * Swipes a row with a finger: real touch events (through the DevTools protocol), which differ from the mouse in
 * the browser's own handling (the touch is captured by the row it started on, `touch-action`, `pointercancel`).
 */
async function touchSwipe(page: Page, title: string, fromX: number, byX: number) {
  const box = await boxOf(row(page, title));
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: TouchType, x: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  await send("touchStart", fromX);
  const steps = 8;
  for (let step = 1; step <= steps; step++) await send("touchMove", fromX + (byX * step) / steps);
  await send("touchEnd", fromX + byX);
  await cdp.detach();
}

/** From now on every write to IndexedDB fails, as it does when the disk is full or the database was taken away. */
async function failWrites(page: Page) {
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new Error("disk full");
    };
  });
}

/** Swipes a row left from its right side, away from the edge zones. */
async function swipeLeft(page: Page, title: string) {
  await drag(page, title, 330, -230);
}

const rectOf = async (locator: Locator) => await boxOf(locator);
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

test("opening a row closes the one that was open, and scrolling the page closes an open row", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  await addTask(page, "Order cake", { date: "2026-10-07" });
  const first = row(page, "Pay dentist invoice").locator(".swipe-content");
  const second = row(page, "Order cake").locator(".swipe-content");
  const open = "matrix(1, 0, 0, 1, -234, 0)";

  await swipeLeft(page, "Pay dentist invoice");
  await expect(first).toHaveCSS("transform", open);
  await swipeLeft(page, "Order cake");
  await expect(second).toHaveCSS("transform", open);
  await expect(first).toHaveCSS("transform", "none");

  // The page is made long enough to scroll, and scrolls.
  await page.evaluate(() => {
    document.body.style.minHeight = "4000px";
  });
  await page.evaluate(() => window.scrollTo(0, 120));
  await expect(second).toHaveCSS("transform", "none");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("a swipe that starts at either screen edge opens nothing, and changes nothing on an open row", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  const width = await page.evaluate(() => window.innerWidth);
  const content = row(page, "Pay dentist invoice").locator(".swipe-content");

  // Right edge: a leftward swipe would open the row.
  await drag(page, "Pay dentist invoice", width - 6, -230);
  await expect(content).toHaveCSS("transform", "none");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  // Left edge: a rightward swipe would close an open row, and it stays open.
  await swipeLeft(page, "Pay dentist invoice");
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  // Three actions of 78 px each.
  const open = "matrix(1, 0, 0, 1, -234, 0)";
  await expect(content).toHaveCSS("transform", open);
  await drag(page, "Pay dentist invoice", 20, 230);
  await expect(content).toHaveCSS("transform", open);
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();

  // The same swipe from the middle does close it.
  await drag(page, "Pay dentist invoice", 100, 230);
  await expect(content).toHaveCSS("transform", "none");
  await expect(page).toHaveURL(/#\/$|^[^#]*$/);
});

test("a finger swipe opens the row, and a short one that snaps back doesn't swallow the next keyboard activation", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  const content = row(page, "Pay dentist invoice").locator(".swipe-content");

  await touchSwipe(page, "Pay dentist invoice", 330, -230);
  await expect(row(page, "Pay dentist invoice").getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await page.getByRole("heading", { name: "Today", level: 1 }).click();
  await expect(content).toHaveCSS("transform", "none");

  // A short swipe: the row snaps back. A finger ends in no click, so nothing may wait for one: the Space the Owner
  // presses on the focused check circle a moment later is a click of its own, and Completes the Task.
  await touchSwipe(page, "Pay dentist invoice", 330, -40);
  await expect(content).toHaveCSS("transform", "none");
  // Past the moment the app stops expecting the click of the swipe (the page's clock is faked, so this takes no real time).
  await page.clock.fastForward(300);
  const check = page.getByRole("checkbox", { name: "Complete Pay dentist invoice" });
  await check.focus();
  await page.keyboard.press("Space");
  await expect(check).toBeChecked();
});

test("a press that goes down and is let go outside the row leaves nothing armed: the mouse moving over it later moves nothing", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  await addTask(page, "Order cake", { date: "2026-10-07" });
  const content = row(page, "Pay dentist invoice").locator(".swipe-content");
  const box = await boxOf(row(page, "Pay dentist invoice"));
  const other = await boxOf(row(page, "Order cake"));

  await page.mouse.move(330, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(325, box.y + 40, { steps: 4 });
  // Let go over the other row: the first row never hears of it.
  await page.mouse.move(325, other.y + other.height / 2, { steps: 4 });
  await page.mouse.up();
  // With no button pressed, move sideways over the first row.
  await page.mouse.move(330, box.y + 10);
  await page.mouse.move(150, box.y + 10, { steps: 8 });

  await expect(content).toHaveCSS("transform", "none");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("a short swipe snaps back, and a vertical drag moves nothing", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  const content = row(page, "Pay dentist invoice").locator(".swipe-content");

  await drag(page, "Pay dentist invoice", 330, -40);
  await expect(content).toHaveCSS("transform", "none");

  const box = await boxOf(row(page, "Pay dentist invoice"));
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

test("Reschedule all… after midnight, with the sheet's day gone stale, still moves every Task to the earliest day it may have", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setSystemTime(new Date(2026, 9, 7, 23, 59, 40));
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-01" });
  await addTask(page, "Buy gift for Mom", { date: "2026-10-05" });
  await expect(bucket(page, "Overdue").getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Reschedule all…" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /^Tomorrow/ })).toContainText("Thu, Oct 8");

  // Midnight passes while the sheet is open; the screen does not know yet (it looks at the clock every 30 seconds).
  await page.clock.setSystemTime(new Date(2026, 9, 8, 0, 0, 5));
  await page.getByRole("dialog").getByRole("button", { name: /^Tomorrow/ }).click();

  // The Tasks went to the real tomorrow, the 9th, which the stale screen shows as the day after tomorrow.
  await expect(page.getByText("Nothing overdue.")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveText([/Pay dentist invoice.*Fri, Oct 9/, /Buy gift for Mom.*Fri, Oct 9/]);
  expect(errors).toEqual([]);
});

test("a Reschedule that fails in the store is not hidden: the page reports it and the Task stays Overdue", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await addTask(page, "Pay dentist invoice", { date: "2026-10-05" });
  // The sheet closes before the add has been written; the lists show the Task only once it has. Only then do writes fail.
  await expect(bucket(page, "Overdue")).toContainText("Pay dentist invoice");
  await failWrites(page);

  await swipeLeft(page, "Pay dentist invoice");
  await row(page, "Pay dentist invoice").getByRole("button", { name: "Reschedule", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Tomorrow/ }).click();

  // Like a failed Complete or a failed add, the failure is not swallowed.
  await expect.poll(() => errors).toEqual([expect.stringContaining("disk full")]);
  await expect(bucket(page, "Overdue")).toContainText("Pay dentist invoice");
});

test("a Delete that fails in the store is not hidden: the page reports it, and there is nothing to undo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await addTask(page, "Order cake", { date: "2026-10-07" });
  // The sheet closes before the add has been written; the lists show the Task only once it has. Only then do writes fail.
  await expect(bucket(page, "Today")).toContainText("Order cake");
  await failWrites(page);

  await swipeLeft(page, "Order cake");
  await row(page, "Order cake").getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => errors).toEqual([expect.stringContaining("disk full")]);
  await expect(page.getByText("Task deleted")).toBeHidden();
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

test("the undo toast is announced: its live region is in the page before it, and a second delete is announced again", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Order cake", { date: "2026-10-07" });
  await addTask(page, "Call the plumber", { date: "2026-10-07" });
  // A live region that comes with its text is often not read out; one that was already there and gets text is.
  const region = page.locator("[aria-live='polite']");
  await expect(region).toHaveCount(1);
  await expect(region).toBeEmpty();
  const regionHandle = await region.elementHandle();

  await row(page, "Order cake").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

  await expect(region).toContainText("Task deleted");
  expect(await regionHandle.evaluate((element) => element.isConnected)).toBe(true);
  const firstToast = await region.locator(".undo-toast").elementHandle();
  await row(page, "Call the plumber").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  // The second toast is a new element in the same region, which is what a screen reader reads out.
  await expect.poll(() => firstToast.evaluate((element) => element.isConnected)).toBe(false);
  await expect(region.locator(".undo-toast")).toHaveCount(1);
  expect(await regionHandle.evaluate((element) => element.isConnected)).toBe(true);
  // It is not a second status line: the page's one `status` is the sync line, which the sync tests listen to.
  await expect(page.getByRole("status")).toHaveCount(1);
});

test("the undo toast goes after 5 seconds, and the Task is then restored from the Trash", async ({ page }) => {
  // The page's clock is faked (see beforeEach), so the 5 seconds pass at once.
  await page.goto("/");
  await addTask(page, "Order cake", { date: "2026-10-07" });

  await row(page, "Order cake").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Task deleted")).toBeVisible();
  // The mouse is where the sheet's Delete button was, which is over the toast, and a toast the mouse is over stays.
  await page.mouse.move(5, 5);
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

test("the undo toast waits while Undo has the keyboard focus, and goes 5 seconds after the focus leaves", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Order cake", { date: "2026-10-07" });
  await row(page, "Order cake").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Task deleted")).toBeVisible();
  await page.mouse.move(5, 5);

  // The Owner tabs to Undo; the five seconds pass and the toast is still there to be pressed.
  await page.getByRole("button", { name: "Undo" }).focus();
  await expect(page.locator(".undo-toast")).toHaveAttribute("data-held", "");
  await page.clock.fastForward(8_000);
  await expect(page.getByText("Task deleted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();

  await page.getByRole("button", { name: "Undo" }).blur();
  await expect(page.locator(".undo-toast")).not.toHaveAttribute("data-held");
  await page.clock.fastForward(4_000);
  await expect(page.getByText("Task deleted")).toBeVisible();
  await page.clock.fastForward(1_500);
  await expect(page.getByText("Task deleted")).toBeHidden();
});

test("the undo toast waits while the mouse is over it, and goes 5 seconds after it leaves; a finger does not hold it for good", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Order cake", { date: "2026-10-07" });
  await addTask(page, "Call the plumber", { date: "2026-10-07" });
  await row(page, "Order cake").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  const toast = page.locator(".undo-toast");
  await expect(toast).toBeVisible();

  // The toast says when it is held (`data-held`); the clock is moved only once that has been seen to change, so the
  // five seconds are not counted before the toast has noticed the mouse arriving or leaving.
  const box = await rectOf(toast);
  await page.mouse.move(5, 5);
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await expect(toast).toHaveAttribute("data-held", "");
  await page.clock.fastForward(8_000);
  await expect(toast).toBeVisible();

  await page.mouse.move(5, 300);
  await expect(toast).not.toHaveAttribute("data-held");
  await page.clock.fastForward(4_000);
  await expect(toast).toBeVisible();
  await page.clock.fastForward(1_500);
  await expect(toast).toBeHidden();

  // A touch on the toast (not on Undo) ends with the finger: it does not make the toast stay.
  await row(page, "Call the plumber").dispatchEvent("contextmenu");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(toast).toBeVisible();
  await page.mouse.move(5, 5);
  const again = await rectOf(toast);
  const cdp = await page.context().newCDPSession(page);
  const point = { x: again.x + 8, y: again.y + again.height / 2, id: 1 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  // The finger is up: whatever the touch did to the toast is over before the clock moves.
  await expect(toast).not.toHaveAttribute("data-held");
  await page.clock.fastForward(5_500);
  await expect(toast).toBeHidden();
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

test("a double tap on Delete in Task detail goes back once, to where the Task was opened from", async ({ page }) => {
  await page.goto("/#/calendar");
  await page.goto("/");
  await addTask(page, "Call the plumber", { date: "2026-10-07" });
  await page.getByRole("link", { name: "Call the plumber" }).click();
  await expect(page.getByRole("heading", { name: "Call the plumber", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).dblclick();

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/$|^[^#]*$/);
  await expect(page.getByText("Task deleted")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(bucket(page, "Today")).toContainText("Call the plumber");
});

test("Delete in a Task detail that was opened straight from a link stays in the app, on Today, with the undo toast", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Call the plumber", { date: "2026-10-07" });
  const href = await page.getByRole("link", { name: "Call the plumber" }).getAttribute("href");
  // The tab had another page before the link was followed: Back would leave the app.
  await page.goto("about:blank");
  await page.goto(`/${href}`);
  await expect(page.getByRole("heading", { name: "Call the plumber", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByText("Task deleted")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(bucket(page, "Today")).toContainText("Call the plumber");
});

test("Back in an app screen goes back a step of the app, and after a reload of the screen opened on still does", async ({ page }) => {
  await page.goto("/");
  await addTask(page, "Call the plumber", { date: "2026-10-07" });
  await page.getByRole("link", { name: "Trash" }).click();
  await expect(page.getByRole("heading", { name: "Trash", level: 1 })).toBeVisible();
  await page.reload();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/$|^[^#]*$/);
  // It went back in the history, not forward to a new Today: Forward is Trash again.
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Trash", level: 1 })).toBeVisible();
});

test("a double tap on Back stays in the app: it goes back once, not out of it", async ({ page }) => {
  await page.goto("about:blank");
  await page.goto("/");
  await page.getByRole("link", { name: "Trash" }).click();
  await expect(page.getByRole("heading", { name: "Trash", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).dblclick();

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/(#\/)?$/);
});

test("Back from a new Event, opened straight from a link, stays in the app: saving replaces the form, it does not add a step", async ({ page }) => {
  await page.goto("about:blank");
  await page.goto("/#/event/new");
  await page.getByRole("textbox", { name: "Title" }).fill("Mom's birthday");
  await page.getByLabel("Start date").fill("2026-10-14");
  await page.getByLabel("Start time").fill("12:30");
  await page.getByLabel("End time").fill("15:00");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("heading", { name: "Mom's birthday", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/(#\/)?$/);
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
