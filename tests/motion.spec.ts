import { test, expect } from "@playwright/test";

test("one 3D canvas stays visible alongside every landing chapter", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".inspection-canvas.is-ready")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".inspection-canvas canvas")).toHaveCSS(
    "opacity",
    "1",
  );
  const canvas = await page
    .locator(".inspection-canvas canvas")
    .elementHandle();
  await page.screenshot({ path: "reference/persistent-hero-desktop.png" });
  for (const id of [
    "the-promise",
    "the-permission",
    "protection-modes",
    "how-it-works",
    "next-step",
  ]) {
    await page.locator(`#${id}`).evaluate((e) =>
      window.scrollTo({
        top: e.getBoundingClientRect().top + scrollY,
        behavior: "instant",
      }),
    );
    await expect(
      page.locator(`.story-visual a[href='#${id}']`),
    ).toHaveAttribute("aria-current", "step");
    const box = await page.locator(".story-visual").boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(-2);
    expect(box!.y).toBeLessThanOrEqual(2);
    expect(await canvas!.evaluate((e) => e.isConnected)).toBeTruthy();
    await expect(page.locator(".inspection-canvas canvas")).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    if (["protection-modes", "next-step"].includes(id))
      await page.screenshot({ path: `reference/persistent-${id}-desktop.png` });
  }
  await page
    .getByRole("link", { name: "Enter rescue mode", exact: true })
    .click();
  await expect(page).toHaveURL(/rescue/);
  expect(errors).toEqual([]);
});

test("mobile keeps the model above readable content and reduced motion stays usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.locator(".inspection-canvas.is-ready")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".inspection-canvas canvas")).toHaveCSS(
    "opacity",
    "1",
  );
  await page.screenshot({ path: "reference/persistent-hero-mobile.png" });
  for (const id of ["protection-modes", "next-step"]) {
    await page.locator(`#${id}`).evaluate((e) =>
      window.scrollTo({
        top:
          e.getBoundingClientRect().top +
          scrollY -
          document.querySelector(".story-visual")!.getBoundingClientRect()
            .height -
          20,
        behavior: "instant",
      }),
    );
    const model = await page.locator(".story-visual").boundingBox();
    const heading = await page.locator(`#${id} h2`).boundingBox();
    expect(model!.y).toBeGreaterThanOrEqual(-2);
    expect(model!.y).toBeLessThanOrEqual(2);
    expect(heading!.y).toBeGreaterThan(model!.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({ path: `reference/persistent-${id}-mobile.png` });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".story-chapter")).toHaveCount(6);
  await page
    .locator(".story-intro")
    .getByRole("link", { name: "Enter SCAMurai" })
    .click();
  await expect(page).toHaveURL(/login/);
  expect(errors).toEqual([]);
});
