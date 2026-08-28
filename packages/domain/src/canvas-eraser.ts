export type CanvasStrokePoint = readonly [number, number, number?];

export interface CanvasPoint {
  x: number;
  y: number;
}

function pointDistance(point: CanvasStrokePoint, center: CanvasPoint): number {
  return Math.hypot(point[0] - center.x, point[1] - center.y);
}

function segmentDistance(
  center: CanvasPoint,
  start: CanvasStrokePoint,
  end: CanvasStrokePoint,
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return pointDistance(start, center);
  const ratio = Math.max(0, Math.min(1,
    ((center.x - start[0]) * dx + (center.y - start[1]) * dy) / (dx * dx + dy * dy),
  ));
  return Math.hypot(center.x - (start[0] + ratio * dx), center.y - (start[1] + ratio * dy));
}

export function eraseStrokePoints(
  points: readonly CanvasStrokePoint[],
  center: CanvasPoint,
  radius: number,
): CanvasStrokePoint[][] {
  if (points.length === 0) return [];
  const safeRadius = Math.max(1, radius);
  const erased = points.map((point) => pointDistance(point, center) <= safeRadius);
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (start && end && segmentDistance(center, start, end) <= safeRadius) {
      erased[index - 1] = true;
      erased[index] = true;
    }
  }

  const chunks: CanvasStrokePoint[][] = [];
  let chunk: CanvasStrokePoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point) continue;
    if (erased[index]) {
      if (chunk.length > 0) chunks.push(chunk);
      chunk = [];
    } else {
      chunk.push(point);
    }
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}
