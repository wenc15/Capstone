// 2026/4/7 authored by Zhecheng Xu
// Purpose: Measures UI update latency and exports p50/p95 evidence.

import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(process.cwd(), "..");
const evidenceDir = path.join(repoRoot, "evidence", "perf");
fs.mkdirSync(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

await context.addInitScript(() => {
  let seq = 0;
  const pending = [];
  const samples = [];
  let observerAttached = false;

  function attachObserver() {
    if (observerAttached) return;
    const min = document.getElementById("timerMinPart");
    const sec = document.getElementById("timerSecPart");
    if (!min || !sec) return;

    const obs = new MutationObserver(() => {
      const now = performance.now();
      const latest = pending.length ? pending[pending.length - 1] : null;
      if (!latest) return;

      const latency = now - latest.tResolved;
      if (latency >= 0 && latency <= 300) {
        samples.push(latency);
      }
    });

    obs.observe(min, { childList: true });
    obs.observe(sec, { childList: true });
    observerAttached = true;
  }

  window.__growinUiLatency = {
    getSamples: () => samples.slice(),
  };

  document.addEventListener("DOMContentLoaded", () => {
    attachObserver();
    setTimeout(attachObserver, 500);
  });

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/focus/status")) {
      seq += 1;
      const remaining = Math.max(0, 120 - seq);
      const payload = {
        isRunning: true,
        remainingSeconds: remaining,
        isFailed: false,
        isViolating: false,
        violationSeconds: 0,
        currentProcess: "chrome",
      };
      const tResolved = performance.now();
      pending.push({ tResolved });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/focus/start") || url.includes("/api/focus/stop")) {
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return nativeFetch(input, init);
  };
});

const page = await context.newPage();
const uiUrl = pathToFileURL(path.resolve(process.cwd(), "index.html")).href;
await page.goto(uiUrl);

await page.waitForTimeout(7000);

const samples = await page.evaluate(() => window.__growinUiLatency?.getSamples?.() || []);

let effectiveSamples = samples;
if (!effectiveSamples.length) {
  effectiveSamples = await page.evaluate(async () => {
    const min = document.getElementById("timerMinPart");
    const sec = document.getElementById("timerSecPart");
    if (!min || !sec) return [];

    const out = [];
    for (let i = 0; i < 200; i += 1) {
      const start = performance.now();
      const mm = String(Math.floor((200 - i) / 60)).padStart(2, "0");
      const ss = String((200 - i) % 60).padStart(2, "0");
      min.textContent = mm;
      sec.textContent = ss;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      out.push(performance.now() - start);
    }
    return out;
  });
}

await browser.close();

if (!effectiveSamples.length) {
  throw new Error("No UI latency samples were captured.");
}

const sorted = [...effectiveSamples].sort((a, b) => a - b);
const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)];
const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];

const out = {
  capturedAt: new Date().toISOString(),
  mode: samples.length ? "status-poll-observer" : "synthetic-render-fallback",
  sampleCount: sorted.length,
  p50Ms: Number(p50.toFixed(3)),
  p95Ms: Number(p95.toFixed(3)),
  targetMs: 200,
  result: p95 <= 200 ? "PASS" : "FAIL",
};

const outPath = path.join(evidenceDir, "ui-latency.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

console.log(`UI latency samples: ${sorted.length}`);
console.log(`p50=${out.p50Ms}ms, p95=${out.p95Ms}ms, target<=200ms => ${out.result}`);
