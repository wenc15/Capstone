// 2026/4/7 authored by Zhecheng Xu
// Purpose: Verifies utility helpers for timer formatting, clamping, and toast behavior.

import { describe, expect, it, vi } from "vitest";
import { clampMins, fmt, showToast } from "../../js/utils.js";

describe("utils", () => {
  it("clampMins clamps and defaults correctly", () => {
    expect(clampMins(Number.NaN)).toBe(25);
    expect(clampMins(0)).toBe(1);
    expect(clampMins(200)).toBe(60);
    expect(clampMins(12.9)).toBe(12);
  });

  it("fmt formats milliseconds as mm:ss", () => {
    expect(fmt(0)).toBe("00:00");
    expect(fmt(61_000)).toBe("01:01");
    expect(fmt(3_599_000)).toBe("59:59");
  });

  it("showToast updates element and hides after timeout", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");

    showToast(el, "hello");
    expect(el.textContent).toBe("hello");
    expect(el.classList.contains("show")).toBe(true);

    vi.advanceTimersByTime(3000);
    expect(el.classList.contains("show")).toBe(false);

    vi.useRealTimers();
  });
});
