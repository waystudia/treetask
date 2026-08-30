import { describe, expect, it } from "vitest";
import {
  createDefaultStylusProfile,
  mapStylusPressure,
  parseImportedStylusProfile,
  parseStylusProfile,
  StylusPointFilter,
} from "./stylus-calibration";

describe("stylus calibration", () => {
  it("maps a saved pressure range and gamma", () => {
    const profile = { ...createDefaultStylusProfile(), pressureMin: 0.2, pressureMax: 0.8, pressureGamma: 2 };
    expect(mapStylusPressure(0.2, profile)).toBeCloseTo(0.02);
    expect(mapStylusPressure(0.5, profile)).toBeCloseTo(0.25);
    expect(mapStylusPressure(0.8, profile)).toBeCloseTo(1);
  });

  it("rejects an invalid imported profile", () => {
    const profile = { ...createDefaultStylusProfile(), pressureMin: 0.9, pressureMax: 0.2 };
    expect(() => parseStylusProfile(JSON.stringify(profile))).toThrow();
  });

  it("keeps zero stabilization pixel-exact", () => {
    const filter = new StylusPointFilter({ ...createDefaultStylusProfile(), stabilization: 0 });
    expect(filter.filter({ x: 10, y: 20 }, 1)).toEqual({ x: 10, y: 20 });
    expect(filter.filter({ x: 50, y: 80 }, 17)).toEqual({ x: 50, y: 80 });
  });

  it("imports a compatible profile from the Android Stylus Calibrator", () => {
    const imported = parseImportedStylusProfile({
      schemaVersion: 1,
      profile: {
        name: "Xiaomi Pen",
        viewportFingerprint: { windowWidthPx: 2000, windowHeightPx: 1200 },
        translation: { dx: 0.004, dy: -0.005 },
        manualOffset: { x: 0.001, y: 0 },
        pressureProfile: { pressureMin: 0.1, pressureMax: 0.9, gamma: 1.25 },
        smoothingProfile: { preset: "MEDIUM" },
      },
    }, "2026-08-30T00:00:00.000Z");
    expect(imported.name).toBe("Xiaomi Pen");
    expect(imported.offsetX).toBe(10);
    expect(imported.offsetY).toBe(-6);
    expect(imported.stabilization).toBe(36);
    expect(imported.pressureGamma).toBe(1.25);
  });
});
