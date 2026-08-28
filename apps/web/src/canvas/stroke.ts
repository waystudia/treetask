import { getStroke } from "perfect-freehand";

export type Point = readonly [number, number, number?];

export interface BrushStrokeOptions {
  size?: number;
  hardness?: number;
  usePressure?: boolean;
  simulatePressure?: boolean;
}

const average = (a: number, b: number): number => (a + b) / 2;

export function strokeToSvgPath(
  points: readonly Point[],
  options: BrushStrokeOptions = {},
): string {
  const hardness = Math.min(100, Math.max(0, options.hardness ?? 70));
  const usePressure = options.usePressure ?? true;
  const outline = getStroke(points.map(([x, y, pressure]) => [x, y, pressure ?? 0.5]), {
    size: Math.min(48, Math.max(1, options.size ?? 5)),
    thinning: usePressure ? 0.62 : 0,
    smoothing: 0.88 - hardness * 0.0052,
    streamline: 0.58 - hardness * 0.0032,
    simulatePressure: usePressure && (options.simulatePressure ?? true),
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
  });
  if (outline.length < 3) return "";
  const first = outline[0];
  const second = outline[1];
  if (!first || !second) return "";
  let path = `M ${first[0]} ${first[1]} Q ${second[0]} ${second[1]} `;
  for (let index = 2; index < outline.length; index += 1) {
    const current = outline[index];
    const next = outline[index + 1];
    if (!current) continue;
    if (next) {
      path += `${average(current[0], next[0])} ${average(current[1], next[1])} `;
    } else {
      path += `${current[0]} ${current[1]}`;
    }
  }
  return `${path} Z`;
}
