import { describe, expect, it } from "vitest";
import { strokeToSvgPath } from "./stroke";

describe("strokeToSvgPath", () => {
  it("returns an empty path for an empty stroke", () => {
    expect(strokeToSvgPath([])).toBe("");
  });

  it("creates a closed vector path for a drawn line", () => {
    const path = strokeToSvgPath([
      [0, 0, 0.5],
      [20, 10, 0.5],
      [40, 20, 0.5],
      [60, 25, 0.5],
    ]);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
  });

  it("supports brush width, hardness and real pressure", () => {
    const points = [
      [0, 0, 0.1],
      [20, 10, 0.35],
      [40, 20, 0.9],
      [60, 25, 0.5],
    ] as const;
    const soft = strokeToSvgPath(points, { size: 4, hardness: 20, usePressure: false });
    const pressure = strokeToSvgPath(points, { size: 18, hardness: 90, usePressure: true, simulatePressure: false });
    expect(soft).not.toBe(pressure);
    expect(pressure.endsWith(" Z")).toBe(true);
  });
});
