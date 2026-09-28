import { expect, test, type Page } from "@playwright/test";

async function addTask(page: Page, title: string) {
  await page.getByLabel("New Task").fill(title);
  await page.getByRole("button", { name: "Add" }).click();
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
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

  await page.getByRole("combobox", { name: "Language" }).selectOption({ label: "Deutsch" });
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("heading", { name: "Aufgaben" })).toBeVisible();
  await page.getByLabel("Neue Aufgabe").fill("Kuchen backen");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByRole("checkbox", { name: "Kuchen backen erledigen" })).toBeVisible();
});
