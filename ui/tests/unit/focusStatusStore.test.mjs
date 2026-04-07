// 2026/4/7 authored by Zhecheng Xu
// Purpose: Verifies focus status store state updates and subscription behavior.

import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeBroadcastChannel {
  static channels = new Map();

  constructor(name) {
    this.name = name;
    this.handlers = new Set();
    if (!FakeBroadcastChannel.channels.has(name)) {
      FakeBroadcastChannel.channels.set(name, new Set());
    }
    FakeBroadcastChannel.channels.get(name).add(this);
  }

  addEventListener(event, cb) {
    if (event === "message") {
      this.handlers.add(cb);
    }
  }

  postMessage(data) {
    for (const instance of FakeBroadcastChannel.channels.get(this.name) || []) {
      for (const cb of instance.handlers) {
        cb({ data });
      }
    }
  }
}

describe("focusStatusStore", () => {
  beforeEach(() => {
    vi.resetModules();
    global.BroadcastChannel = FakeBroadcastChannel;
    global.window = {
      electronAPI: {
        onFocusStatus: vi.fn(),
        emitFocusStatus: vi.fn(),
      },
    };
  });

  it("set/get returns merged state", async () => {
    const { setFocusStatus, getFocusStatus } = await import("../../js/focusStatusStore.js");

    setFocusStatus({ isRunning: true, remainingSeconds: 42 });
    const st = getFocusStatus();

    expect(st.isRunning).toBe(true);
    expect(st.remainingSeconds).toBe(42);
  });

  it("subscribe receives updates and initial snapshot", async () => {
    const { subscribeFocusStatus, setFocusStatus } = await import("../../js/focusStatusStore.js");
    const calls = [];

    const unsubscribe = subscribeFocusStatus((s) => calls.push(s));
    setFocusStatus({ isViolating: true, violationSeconds: 3 });
    unsubscribe();

    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.at(-1).isViolating).toBe(true);
    expect(calls.at(-1).violationSeconds).toBe(3);
  });
});
