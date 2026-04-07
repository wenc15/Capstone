// 2026/4/7 authored by Zhecheng Xu
// Purpose: Smoke-tests core app shell rendering and timer/navigation visibility.

import { test, expect } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

function uiFileUrl() {
  const indexPath = path.resolve(process.cwd(), "index.html");
  return pathToFileURL(indexPath).href;
}

test("app shell renders core navigation and timer controls", async ({ page }) => {
  await page.goto(uiFileUrl());

  await expect(page.locator("#navTimer")).toBeVisible();
  await expect(page.locator("#navStats")).toBeVisible();
  await expect(page.locator("#navPet")).toBeVisible();

  await expect(page.locator("#timerDisplay")).toBeVisible();
  await expect(page.locator("#startBtn")).toBeVisible();
  await expect(page.locator("#timeRange")).toBeVisible();
});
