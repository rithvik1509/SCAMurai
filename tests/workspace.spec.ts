import { test, expect } from "@playwright/test";

test("workspace navigation, KAGE investigation, responsive layout and sign out", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.screenshot({
    path: "reference/login-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("What should we call you?").fill("Rohith");
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(page.getByRole("heading", { name: "Hi, Rohith" })).toBeVisible();
  await page.screenshot({
    path: "reference/dashboard-desktop.png",
    fullPage: true,
  });
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: "reference/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New check" }).click();
  await page
    .getByPlaceholder("Search investigations, transactions…")
    .fill("YŌKAI");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /YŌKAI investigation/ })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/kage$/);
  await expect(page.getByRole("heading", { name: /YŌKAI/ })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Suspicious message" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "reference/kage-desktop.png", fullPage: true });
  await page.goto("/dashboard/kagami?module=futureview");
  await expect(
    page.getByRole("textbox", { name: "Transaction calldata" }),
  ).toHaveValue("");
  await page.screenshot({
    path: "reference/kagami-desktop.png",
    fullPage: true,
  });
  await page.goto("/dashboard/kage?tool=url");
  await expect(page.getByRole("heading", { name: /YŌKAI/ })).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Website URL", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith("scamurai-")),
    ),
  ).toEqual([]);
  await page.goto("/dashboard/kagami?tool=compare");
  await expect(page).toHaveURL(/login\?next=/);
  await expect(page.locator("textarea")).toHaveCount(0);
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(page).toHaveURL(/kagami\?tool=compare/);
  expect(errors).toEqual([]);
});
