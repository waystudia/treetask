import { z } from "zod";

export const STYLUS_PROFILE_STORAGE_KEY = "treetask:stylus-profile:v1";

const stylusProfileSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(80),
  offsetX: z.number().finite().min(-80).max(80),
  offsetY: z.number().finite().min(-80).max(80),
  stabilization: z.number().finite().min(0).max(100),
  pressureMin: z.number().finite().min(0).max(1),
  pressureMax: z.number().finite().min(0).max(1),
  pressureGamma: z.number().finite().min(0.25).max(4),
  shapeAssist: z.boolean(),
  updatedAt: z.string().datetime(),
}).refine((profile) => profile.pressureMax - profile.pressureMin >= 0.05, {
  message: "Максимальное давление должно быть больше минимального",
  path: ["pressureMax"],
});

const stylusCalibEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.object({
    name: z.string().trim().min(1).max(80),
    viewportFingerprint: z.object({
      windowWidthPx: z.number().positive(),
      windowHeightPx: z.number().positive(),
    }),
    translation: z.object({ dx: z.number().finite(), dy: z.number().finite() }).nullable().optional(),
    manualOffset: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
    pressureProfile: z.object({
      pressureMin: z.number().finite(),
      pressureMax: z.number().finite(),
      gamma: z.number().finite(),
    }).nullable().optional(),
    smoothingProfile: z.object({
      preset: z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]),
    }).optional(),
  }),
});

export type StylusProfile = z.infer<typeof stylusProfileSchema>;

export interface StylusPoint {
  x: number;
  y: number;
}

export function createDefaultStylusProfile(now = new Date().toISOString()): StylusProfile {
  return {
    schemaVersion: 1,
    name: "Мой стилус",
    offsetX: 0,
    offsetY: 0,
    stabilization: 24,
    pressureMin: 0,
    pressureMax: 1,
    pressureGamma: 1,
    shapeAssist: true,
    updatedAt: now,
  };
}

export function parseStylusProfile(value: unknown): StylusProfile {
  const candidate = typeof value === "string" ? JSON.parse(value) as unknown : value;
  return stylusProfileSchema.parse(candidate);
}

export function parseImportedStylusProfile(value: unknown, now = new Date().toISOString()): StylusProfile {
  const candidate = typeof value === "string" ? JSON.parse(value) as unknown : value;
  const treeTaskProfile = stylusProfileSchema.safeParse(candidate);
  if (treeTaskProfile.success) return treeTaskProfile.data;

  const imported = stylusCalibEnvelopeSchema.parse(candidate).profile;
  const width = imported.viewportFingerprint.windowWidthPx;
  const height = imported.viewportFingerprint.windowHeightPx;
  const offsetX = ((imported.translation?.dx ?? 0) + (imported.manualOffset?.x ?? 0)) * width;
  const offsetY = ((imported.translation?.dy ?? 0) + (imported.manualOffset?.y ?? 0)) * height;
  const pressure = imported.pressureProfile;
  const stabilization = ({ NONE: 0, LOW: 14, MEDIUM: 36, HIGH: 72 } as const)[imported.smoothingProfile?.preset ?? "MEDIUM"];
  return stylusProfileSchema.parse({
    schemaVersion: 1,
    name: imported.name,
    offsetX: Math.min(80, Math.max(-80, offsetX)),
    offsetY: Math.min(80, Math.max(-80, offsetY)),
    stabilization,
    pressureMin: Math.min(0.95, Math.max(0, pressure?.pressureMin ?? 0)),
    pressureMax: Math.min(1, Math.max(0.05, pressure?.pressureMax ?? 1)),
    pressureGamma: Math.min(4, Math.max(0.25, pressure?.gamma ?? 1)),
    shapeAssist: true,
    updatedAt: now,
  });
}

export function mapStylusPressure(rawPressure: number, profile: StylusProfile): number {
  if (!Number.isFinite(rawPressure)) return 0.5;
  const span = profile.pressureMax - profile.pressureMin;
  if (span <= 0.0001) return 0.5;
  const normalized = Math.min(1, Math.max(0, (rawPressure - profile.pressureMin) / span));
  return Math.min(1, Math.max(0.02, normalized ** profile.pressureGamma));
}

class ScalarFilter {
  private initialized = false;
  private value = 0;

  filter(next: number, alpha: number): number {
    if (!this.initialized) {
      this.value = next;
      this.initialized = true;
    } else {
      const safeAlpha = Math.min(1, Math.max(0, alpha));
      this.value = safeAlpha * next + (1 - safeAlpha) * this.value;
    }
    return this.value;
  }
}

function smoothingAlpha(deltaSeconds: number, cutoff: number): number {
  if (!Number.isFinite(cutoff) || cutoff <= 0) return 1;
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / deltaSeconds);
}

/** One Euro filter ported from Stylus Calibrator for low-latency in-canvas correction. */
export class StylusPointFilter {
  private readonly xFilter = new ScalarFilter();
  private readonly yFilter = new ScalarFilter();
  private readonly dxFilter = new ScalarFilter();
  private readonly dyFilter = new ScalarFilter();
  private previous: StylusPoint | null = null;
  private previousTimestamp = 0;

  constructor(private readonly profile: StylusProfile) {}

  filter(point: StylusPoint, timestamp: number): StylusPoint {
    const previous = this.previous;
    if (!previous || timestamp <= this.previousTimestamp || this.profile.stabilization <= 0) {
      this.previous = point;
      this.previousTimestamp = timestamp;
      this.xFilter.filter(point.x, 1);
      this.yFilter.filter(point.y, 1);
      this.dxFilter.filter(0, 1);
      this.dyFilter.filter(0, 1);
      return point;
    }

    const strength = this.profile.stabilization / 100;
    const minCutoff = 8 - strength * 7.3;
    const beta = 0.12 - strength * 0.105;
    const deltaSeconds = Math.min(0.1, Math.max(0.0001, (timestamp - this.previousTimestamp) / 1000));
    const derivativeAlpha = smoothingAlpha(deltaSeconds, 1);
    const dx = this.dxFilter.filter((point.x - previous.x) / deltaSeconds, derivativeAlpha);
    const dy = this.dyFilter.filter((point.y - previous.y) / deltaSeconds, derivativeAlpha);
    const result = {
      x: this.xFilter.filter(point.x, smoothingAlpha(deltaSeconds, minCutoff + beta * Math.abs(dx))),
      y: this.yFilter.filter(point.y, smoothingAlpha(deltaSeconds, minCutoff + beta * Math.abs(dy))),
    };
    this.previous = point;
    this.previousTimestamp = timestamp;
    return result;
  }
}
