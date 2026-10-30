import { expect, test, type Page } from "@playwright/test";

const bucket = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name });

async function addLinkedTask(page: Page, title: string, days: number, when: "before" | "after") {
  await page.getByRole("button", { name: "Add task" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Title").fill(title);
  await sheet.getByLabel("When").selectOption({ label: when });
  await sheet.getByLabel("Days").fill(String(days));
  await sheet.getByRole("button", { name: "Add" }).click();
  await expect(sheet).toBeHidden();
}

/** Lets the app's clock run to another day, as if it was opened again then. */
async function openOn(page: Page, moment: Date) {
  await page.clock.setFixedTime(moment);
  await page.reload();
}

test("an Event turns At risk, then Critical, then passes with its open Preparation tasks", async ({ page }) => {
  // Sunday 4 October 2026: Mom's birthday is on Monday the 12th.
  await page.clock.setFixedTime(new Date(2026, 9, 4, 13, 5));
  await page.goto("/#/event/new");
  await page.getByRole("textbox", { name: "Title" }).fill("Mom's birthday");
  await page.getByLabel("Start date").fill("2026-10-12");
  await page.getByLabel("Start time").fill("12:30");
  await page.getByLabel("End time").fill("15:00");
  await page.getByRole("button", { name: "Add" }).click();
  await addLinkedTask(page, "Buy gift", 7, "before");
  await addLinkedTask(page, "Wrap gift", 1, "before");
  await addLinkedTask(page, "Thank-you card", 1, "after");
  const band = page.getByRole("region", { name: "Progress: 0 of 3 done" });
  await expect(band).toBeVisible();
  await expect(band).not.toContainText("At risk");
  const eventUrl = page.url();

  // Tuesday the 6th: the gift is a day late, so the birthday is At risk.
  await openOn(page, new Date(2026, 9, 6, 9, 0));
  await expect(band).toContainText("At risk");
  await expect(band).toContainText("Buy gift is 1 day overdue. Mom's birthday is in 6 days.");
  await tab(page, "Today").click();
  await expect(bucket(page, "Overdue")).toContainText(/Buy gift.*Puts Mom's birthday at risk/);
  await expect(bucket(page, "Later")).toContainText(/Mom's birthday.*12:30 PM · 0 of 3 done.*At risk/);

  // In German.
  await page.getByLabel("Language").selectOption("de");
  await expect(bucket(page, "Überfällig")).toContainText(/Buy gift.*Gefährdet Mom's birthday/);
  await expect(bucket(page, "Später")).toContainText("Gefährdet");
  await page.getByLabel("Sprache").selectOption("en");

  // Sunday the 11th, the gift bought: one Preparation task is left the day before, so the birthday is Critical.
  const buyGift = page.getByRole("checkbox", { name: "Complete Buy gift" });
  await buyGift.click();
  // Checked only once it is saved; moving the clock before that would lose it on reload.
  await expect(buyGift).toBeChecked();
  await openOn(page, new Date(2026, 9, 11, 9, 0));
  await expect(bucket(page, "Tomorrow")).toContainText(/Mom's birthday.*Critical: Tomorrow · 1 open/);
  await page.goto(eventUrl);
  await expect(page.getByRole("region", { name: "Progress: 1 of 3 done" })).toContainText(
    /Tomorrow · 1 open.*1 task is still open\. Mom's birthday is tomorrow\./,
  );

  // Tuesday the 13th: it has passed. No risk any more, just a note; the Follow-up task never counted.
  await openOn(page, new Date(2026, 9, 13, 9, 0));
  const passed = page.getByRole("region", { name: "Progress: 1 of 3 done" });
  await expect(passed).toContainText("Passed with 1 open task");
  await expect(passed).not.toContainText("At risk");
  await tab(page, "Today").click();
  await expect(bucket(page, "Overdue")).toContainText(/Wrap gift.*Mom's birthday · 2 days overdue/);
});
