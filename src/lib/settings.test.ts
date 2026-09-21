import { describe, expect, it } from "vitest";
import type { AppSettings, AutoConnectMode } from "./ipc";

describe("settings data contracts", () => {
  it("verifies default AppSettings fields", () => {
    const defaultSettings: AppSettings = {
      schemaVersion: 1,
      autostart: false,
      silentStart: false,
      autoConnect: false,
      autoConnectMode: "last",
      lastCaptureMode: null,
    };

    expect(defaultSettings.schemaVersion).toBe(1);
    expect(defaultSettings.autostart).toBe(false);
    expect(defaultSettings.silentStart).toBe(false);
    expect(defaultSettings.autoConnect).toBe(false);
    expect(defaultSettings.autoConnectMode).toBe("last");
  });

  it("handles autoConnectMode values properly", () => {
    const modes: AutoConnectMode[] = ["last", "system", "tun"];
    expect(modes).toContain("last");
    expect(modes).toContain("system");
    expect(modes).toContain("tun");
  });

  it("safely accepts partial update payloads", () => {
    const base: AppSettings = {
      schemaVersion: 1,
      autostart: false,
      silentStart: false,
      autoConnect: false,
      autoConnectMode: "last",
      lastCaptureMode: "system",
    };

    const updated: AppSettings = {
      ...base,
      autostart: true,
      silentStart: true,
      autoConnect: true,
      autoConnectMode: "tun",
    };

    expect(updated.autostart).toBe(true);
    expect(updated.silentStart).toBe(true);
    expect(updated.autoConnect).toBe(true);
    expect(updated.autoConnectMode).toBe("tun");
    expect(updated.lastCaptureMode).toBe("system");
  });
});
