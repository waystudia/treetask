import { describe, expect, it } from "vitest";
import { recognizeShape, type ShapePoint } from "./shape-recognition";

const lineBetween = (from: ShapePoint, to: ShapePoint, count = 12): ShapePoint[] =>
  Array.from({ length: count }, (_, index) => [
    from[0] + ((to[0] - from[0]) * index) / (count - 1),
    from[1] + ((to[1] - from[1]) * index) / (count - 1),
  ] as const);

const polygon = (vertices: ShapePoint[]): ShapePoint[] =>
  vertices.flatMap((vertex, index) =>
    lineBetween(vertex, vertices[(index + 1) % vertices.length]!).slice(0, -1),
  ).concat([vertices[0]!]);

describe("shape recognition", () => {
  it("recognizes a held straight stroke", () => {
    const result = recognizeShape(lineBetween([10, 20], [240, 24], 30));
    expect(result?.kind).toBe("line");
    expect(result?.confidence).toBeGreaterThanOrEqual(0.82);
  });

  it("recognizes circle, rectangle and triangle contours", () => {
    const circle = Array.from({ length: 65 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 64;
      return [100 + Math.cos(angle) * 70, 100 + Math.sin(angle) * 70] as const;
    });
    expect(recognizeShape(circle)?.kind).toBe("circle");
    expect(recognizeShape(polygon([[0, 0], [180, 0], [180, 90], [0, 90]]))?.kind).toBe("rectangle");
    expect(recognizeShape(polygon([[90, 0], [180, 150], [0, 150]]))?.kind).toBe("triangle");
  });

  it("recognizes the remaining universal-brush shapes", () => {
    const ellipse = Array.from({ length: 65 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 64;
      return [120 + Math.cos(angle) * 95, 80 + Math.sin(angle) * 42] as const;
    });
    const arrow: ShapePoint[] = [[0, 50], [145, 50], [118, 28], [145, 50], [118, 74]];

    expect(recognizeShape(ellipse)?.kind).toBe("ellipse");
    expect(recognizeShape(polygon([[0, 0], [100, 0], [100, 100], [0, 100]]))?.kind).toBe("square");
    expect(recognizeShape(polygon([[100, 0], [200, 100], [100, 200], [0, 100]]))?.kind).toBe("diamond");
    expect(recognizeShape(arrow)?.kind).toBe("arrow");
  });

  it("does not perfect a low-confidence scribble", () => {
    const scribble: ShapePoint[] = [
      [0, 0], [80, 80], [10, 70], [90, 10], [30, 100], [100, 55],
      [20, 15], [70, 110], [0, 0],
    ];
    expect(recognizeShape(scribble)).toBeNull();
  });
});
