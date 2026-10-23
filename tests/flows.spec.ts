import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, destination = "/dashboard") {
  await page.goto(destination);
  await expect(page).toHaveURL(/login/);
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(page).toHaveURL(new RegExp(destination.split("?")[0]));
}

test("landing separates tools from marketing and has accessible mobile navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Scammers/ })).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "reference/home-desktop.png", fullPage: true });
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({ path: "reference/home-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Rescue mode" })
    .click();
  await expect(page).toHaveURL(/rescue/);
});
test("empty results, input validation, KYC fixture, evidence, and benign fixture", async ({
  page,
}) => {
  await login(page, "/dashboard/kage/results");
  await expect(
    page.getByText("Your next step starts with a scan."),
  ).toBeVisible();
  await page.goto("/scan");
  await page.getByRole("button", { name: "Explore demo analysis" }).click();
  await expect(page.locator(".error[role=alert]")).toContainText("Add content");
  await page.getByRole("tab", { name: "Website URL" }).click();
  await page.getByRole("textbox", { name: "Website URL" }).fill("invalid");
  await page.getByRole("button", { name: "Explore demo analysis" }).click();
  await expect(page.locator(".error[role=alert]")).toContainText(
    "complete HTTP",
  );
  await page.getByRole("tab", { name: "Message", exact: true }).click();
  await page.getByRole("button", { name: "Bank KYC scam" }).click();
  await page.getByRole("button", { name: "Explore demo analysis" }).click();
  await expect(page).toHaveURL(/results/);
  await expect(
    page.getByText("DEMONSTRATION DATA", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bank impersonation" }),
  ).toBeVisible();
  await expect(
    page.locator("mark").filter({ hasText: "pay ₹499" }),
  ).toBeVisible();
  await page.screenshot({
    path: "reference/results-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "reference/results-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Analyze another threat" }).click();
  await page.getByRole("button", { name: "Everyday message" }).click();
  await page.getByRole("button", { name: "Explore demo analysis" }).click();
  await expect(page.getByText("LOW RISK", { exact: true })).toBeVisible();
});
test("transaction validation and Promise vs. Action sample", async ({
  page,
}) => {
  await login(page, "/dashboard/kagami?tool=compare");
  await page
    .getByRole("textbox", { name: "Transaction calldata" })
    .fill("not-hex");
  await page.getByRole("button", { name: "Explore demo analysis" }).click();
  await expect(page.locator(".error[role=alert]")).toContainText("hexadecimal");
  await page.getByRole("button", { name: "Unlimited approval" }).click();
  await page.getByRole("button", { name: "Explore demo analysis" }).click();
  await expect(page).toHaveURL(/results/);
  await expect(
    page.getByRole("heading", { name: "Promise vs. Action" }),
  ).toBeVisible();
  await expect(page.getByText("Approval type", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "reference/intent-result.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("recovery checklist and official reporting options", async ({ page }) => {
  await page.goto("/rescue");
  await page.getByRole("button", { name: "I transferred money" }).click();
  await expect(page.getByText("DEMO GUIDANCE", { exact: true })).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await expect(page.getByRole("status")).toContainText("1 of");
  await expect(
    page.getByRole("link", { name: "1930", exact: true }),
  ).toHaveAttribute("href", "tel:1930");
  await page.screenshot({
    path: "reference/rescue-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "reference/rescue-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Choose another situation" }).click();
  await expect(
    page.getByRole("button", { name: "I shared an OTP" }),
  ).toBeVisible();
});
