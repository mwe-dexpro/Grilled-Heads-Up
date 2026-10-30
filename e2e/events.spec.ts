import { expect, test, type Page } from "@playwright/test";

const bucket = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function addLinkedTask(page: Page, title: string, days: number, when: "before" | "on the day" | "after") {
  await page.getByRole("button", { name: "Add task" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Title").fill(title);
  await sheet.getByLabel("When").selectOption({ label: when });
  if (when !== "on the day") await sheet.getByLabel("Days").fill(String(days));
  await sheet.getByRole("button", { name: "Add" }).click();
  await expect(sheet).toBeHidden();
}

test("an Event with Linked tasks: Offsets, home screen, moving the Event, unlinking", async ({ page }) => {
  // Sunday 4 October 2026, 13:05.
  await page.clock.setFixedTime(new Date(2026, 9, 4, 13, 5));
  await page.goto("/");

  // Create the Event from the "+" sheet.
  await page.getByRole("button", { name: "New Task" }).click();
  await page.getByRole("button", { name: "New event" }).click();
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("alert")).toHaveText("Give the event a title.");
  await page.getByRole("textbox", { name: "Title" }).fill("Mom's birthday");
  await page.getByLabel("Start date").fill("2026-10-12");
  await page.getByLabel("Start time").fill("12:30");
  await page.getByLabel("End time").fill("15:00");
  await page.getByLabel("Location").fill("Café Luise, Berlin");
  await page.getByRole("button", { name: "Add" }).click();

  // The Event view.
  await expect(page.getByRole("heading", { name: "Mom's birthday", level: 1 })).toBeVisible();
  await expect(page.getByText("Monday, Oct 12 · 12:30 PM · in 8 days")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Café Luise, Berlin in maps" })).toBeVisible();
  await expect(page.getByText("No tasks yet.", { exact: false })).toBeVisible();

  await addLinkedTask(page, "Buy gift", 7, "before");
  await addLinkedTask(page, "Order cake", 8, "before");
  await addLinkedTask(page, "Thank-you card", 2, "after");
  // Tasks up to the Event's day prepare for it; those after it are Follow-up tasks.
  const tasks = page.getByRole("region", { name: "Preparation" }).getByRole("listitem");
  await expect(tasks).toHaveText([/Order cake.*8 days before · Sun, Oct 4/, /Buy gift.*7 days before · Mon, Oct 5/]);
  await expect(page.getByRole("region", { name: "Follow-up" }).getByRole("listitem")).toHaveText([
    /Thank-you card.*2 days after · Wed, Oct 14/,
  ]);
  await expect(page.getByRole("heading", { name: "Progress: 0 of 3 done" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Complete Order cake" }).click();
  await expect(page.getByRole("heading", { name: "Progress: 1 of 3 done" })).toBeVisible();

  // Today: Linked tasks show their Event and Offset; the Event sits in its Bucket with its Progress.
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Today" }).click();
  await expect(bucket(page, "Today")).toContainText(/Order cake.*Mom's birthday · 8 days before/);
  await expect(bucket(page, "Tomorrow")).toContainText(/Buy gift.*Mom's birthday · 7 days before/);
  await expect(bucket(page, "Later").getByRole("listitem")).toHaveText([
    /Mom's birthday.*12:30 PM · 1 of 3 done/,
    /Thank-you card.*Mom's birthday · 2 days after/,
  ]);

  // Moving the Event a day later moves its Linked tasks with it.
  await bucket(page, "Tomorrow").getByRole("link", { name: "Mom's birthday" }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Start date").fill("2026-10-13");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Tuesday, Oct 13 · 12:30 PM · in 9 days")).toBeVisible();
  await expect(tasks.filter({ hasText: "Buy gift" })).toContainText("7 days before · Tue, Oct 6");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Today" }).click();
  await expect(bucket(page, "Next 3 days")).toContainText(/Buy gift.*Mom's birthday · 7 days before/);
  // The Completed cake follows too and stays crossed out in its new place until the end of the day.
  await expect(bucket(page, "Tomorrow").getByRole("listitem")).toHaveText([/Order cake.*Mom's birthday · 8 days before/]);

  // Unlinking keeps the date; linking again finds the same Offset.
  await bucket(page, "Next 3 days").getByRole("link", { name: "Buy gift" }).click();
  await expect(page.getByRole("link", { name: /Part of · 7 days before.*Mom's birthday/ })).toBeVisible();
  await page.getByRole("button", { name: "Unlink from event" }).click();
  await expect(page.getByText("Due Tue, Oct 6")).toBeVisible();
  await page.getByRole("combobox", { name: "Event" }).selectOption({ label: "Mom's birthday · Tue, Oct 13" });
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByRole("link", { name: /Part of · 7 days before.*Mom's birthday/ })).toBeVisible();

  // Everything survives a reload.
  await page.reload();
  await expect(page.getByRole("link", { name: /Part of · 7 days before.*Mom's birthday/ })).toBeVisible();
});

test("an all-day Event over several days shows in Today while it is going on", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 4, 13, 5));
  await page.goto("/#/event/new");

  await page.getByRole("textbox", { name: "Title" }).fill("Weekend at Anna & Tom's");
  await page.getByLabel("All day").check();
  await page.getByLabel("Start date").fill("2026-10-03");
  await page.getByLabel("End date").fill("2026-10-05");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Sat, Oct 3 – Mon, Oct 5 · yesterday")).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Today" }).click();
  await expect(bucket(page, "Today")).toContainText(/Weekend at Anna & Tom's.*All day/);
});
