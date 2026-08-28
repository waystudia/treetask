import { describe, expect, it } from "vitest";
import { eraseStrokePoints } from "./canvas-eraser";

describe("eraseStrokePoints", () => {
  it("splits a stroke around the erased area", () => {
    const chunks = eraseStrokePoints(
      [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0], [50, 0]],
      { x: 25, y: 0 },
      4,
    );
    expect(chunks).toEqual([[[0, 0], [10, 0]], [[40, 0], [50, 0]]]);
  });

  it("keeps an untouched stroke as one chunk", () => {
    const points = [[0, 0, 0.2], [10, 0, 0.8], [20, 0, 0.5]] as const;
    expect(eraseStrokePoints(points, { x: 100, y: 100 }, 8)).toEqual([points]);
  });

  it("removes the whole stroke when the eraser covers it", () => {
    expect(eraseStrokePoints([[0, 0], [3, 2], [5, 1]], { x: 2, y: 1 }, 10)).toEqual([]);
  });
});
