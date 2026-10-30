import { expect, test, type Page } from "@playwright/test";

/** Adds a Task through the "+" button; without a date it goes to the Inbox. */
async function addTask(page: Page, title: string, { date = "", time = "" } = {}) {
  await page.getByRole("button", { name: "New Task" }).click();
  await page.getByLabel("Title").fill(title);
  if (date) await page.getByLabel("Date").fill(date);
  if (time) await page.getByLabel("Time").fill(time);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** Clicks the checkbox and waits until the Task shows as Completed, i.e. it is saved. */
async function completeTask(page: Page, title: string) {
  const checkbox = page.getByRole("checkbox", { name: `Complete ${title}` });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
}

async function waitForOfflineReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve));
    }
  });
}

test("add a Task and Complete it; both survive a reload", async ({ page }) => {
  await page.goto("/");

  await addTask(page, "Buy birthday present");
  await addTask(page, "Book restaurant");
  await completeTask(page, "Buy birthday present");
  await page.reload();

  await expect(page.getByRole("listitem")).toHaveText(["Buy birthday present", "Book restaurant"].map((t) => new RegExp(t)));
  await expect(page.getByRole("checkbox", { name: "Complete Buy birthday present" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Complete Book restaurant" })).not.toBeChecked();
});

test("works with no network connection once installed", async ({ page, context }) => {
  await page.goto("/");
  await waitForOfflineReady(page);

  await context.setOffline(true);
  await page.reload();
  await addTask(page, "Pack for the trip");
  await completeTask(page, "Pack for the trip");
  await page.reload();

  await expect(page.getByRole("checkbox", { name: "Complete Pack for the trip" })).toBeChecked();
});

test("is installable as a full-screen app", async ({ page, request }) => {
  await page.goto("/");
  await waitForOfflineReady(page);

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(manifestHref!)).json();

  expect(manifest).toMatchObject({ name: "Grilled Heads-Up", start_url: "/", display: "standalone" });
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});

test("starts in English and remembers a switch to German", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

  await page.getByRole("combobox", { name: "Language" }).selectOption({ label: "Deutsch" });
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("heading", { name: "Heute", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  await page.getByLabel("Titel").fill("Kuchen backen");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByRole("checkbox", { name: "Kuchen backen erledigen" })).toBeVisible();
});

test("groups Tasks into the home screen Buckets", async ({ page }) => {
  // Sunday 4 October 2026, 13:05.
  await page.clock.setFixedTime(new Date(2026, 9, 4, 13, 5));
  await page.goto("/");

  await expect(page.getByText("Nothing overdue.")).toBeVisible();
  await expect(page.getByText("Nothing planned for today.")).toBeVisible();

  await addTask(page, "Pay dentist invoice", { date: "2026-10-01" });
  await addTask(page, "Buy gift for Mom", { date: "2026-10-03" });
  await addTask(page, "Order cake", { date: "2026-10-04" });
  await addTask(page, "Call the plumber", { date: "2026-10-04", time: "13:00" });
  await addTask(page, "Sort boxes in the basement", { date: "2026-10-05" });
  await addTask(page, "Wash Leo's jersey", { date: "2026-10-07" });
  await addTask(page, "Renew passport", { date: "2026-11-20" });
  await addTask(page, "Birthday card for Jonas");
  await completeTask(page, "Order cake");

  const bucket = (name: string) => page.getByRole("region", { name, exact: true });
  await expect(bucket("Overdue")).toContainText("Pay dentist invoice");
  await expect(bucket("Overdue").getByRole("listitem")).toHaveText([/Pay dentist invoice.*3 days overdue/, /Buy gift for Mom.*1 day overdue/]);
  await expect(bucket("Overdue").getByLabel("2 overdue")).toBeVisible();
  await expect(bucket("Today").getByRole("listitem")).toHaveText([/Order cake/, /Call the plumber.*Late/]);
  await expect(page.getByText("1 left")).toBeVisible();
  await expect(page.getByText("1 of 2 done")).toBeVisible();
  await expect(bucket("Tomorrow")).toContainText("Sort boxes in the basement");
  await expect(bucket("Next 3 days")).toContainText(/Wash Leo's jersey.*Wed, Oct 7/);
  await expect(page.getByText("Tue – Thu · 1")).toBeVisible();
  await expect(bucket("Later")).toContainText("Renew passport");
  await expect(bucket("Inbox")).toContainText("Birthday card for Jonas");
  await completeTask(page, "Birthday card for Jonas");
  await expect(page.getByText("1 of 1 done")).toBeVisible();

  // At midnight Today's open Tasks become Overdue.
  await page.clock.setFixedTime(new Date(2026, 9, 5, 0, 0, 1));
  await page.reload();
  await expect(bucket("Overdue")).toContainText("Call the plumber");
  await expect(bucket("Overdue")).not.toContainText("Order cake");
  await expect(bucket("Today")).toContainText("Sort boxes in the basement");
});

test("has Today, Calendar and Projects tabs, with the + button on each", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Main" }).getByRole("button");

  await expect(tabs).toHaveText(["Today", "Calendar", "Projects"]);
  for (const name of ["Calendar", "Projects", "Today"]) {
    await tabs.filter({ hasText: name }).click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Task" })).toBeVisible();
  }
});
