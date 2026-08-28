export type ShapePoint = readonly [number, number];

export type RecognizedShapeKind =
  | "line"
  | "arrow"
  | "circle"
  | "ellipse"
  | "square"
  | "rectangle"
  | "triangle"
  | "diamond";

export interface RecognizedShape {
  kind: RecognizedShapeKind;
  confidence: number;
  points: ShapePoint[];
  bounds: { x: number; y: number; width: number; height: number };
}

const distance = (a: ShapePoint, b: ShapePoint) =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);

function bounds(points: readonly ShapePoint[]) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function pointLineDistance(point: ShapePoint, start: ShapePoint, end: ShapePoint) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
      (dx * dx + dy * dy),
  ));
  return distance(point, [start[0] + t * dx, start[1] + t * dy]);
}

function simplifyRdp(points: readonly ShapePoint[], tolerance: number): ShapePoint[] {
  if (points.length <= 2) return [...points];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxDistance = 0;
  let maxIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const value = pointLineDistance(points[index]!, first, last);
    if (value > maxDistance) {
      maxDistance = value;
      maxIndex = index;
    }
  }
  if (maxDistance <= tolerance) return [first, last];
  const left = simplifyRdp(points.slice(0, maxIndex + 1), tolerance);
  const right = simplifyRdp(points.slice(maxIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function sample(points: readonly ShapePoint[], maximum = 96): ShapePoint[] {
  if (points.length <= maximum) return [...points];
  return Array.from({ length: maximum }, (_, index) =>
    points[Math.round((index * (points.length - 1)) / (maximum - 1))]!,
  );
}

function cyclicArc(points: readonly ShapePoint[], from: number, to: number) {
  const result: ShapePoint[] = [];
  let index = from;
  while (true) {
    result.push(points[index]!);
    if (index === to) return result;
    index = (index + 1) % points.length;
  }
}

function simplifyClosed(points: readonly ShapePoint[], tolerance: number) {
  const sampled = sample(points.filter((point, index) =>
    index === 0 || distance(point, points[index - 1]!) > 0.5,
  ));
  if (sampled.length < 3) return sampled;
  let left = 0;
  let right = 0;
  for (let index = 1; index < sampled.length; index += 1) {
    if (sampled[index]![0] < sampled[left]![0]) left = index;
    if (sampled[index]![0] > sampled[right]![0]) right = index;
  }
  const upper = simplifyRdp(cyclicArc(sampled, left, right), tolerance);
  const lower = simplifyRdp(cyclicArc(sampled, right, left), tolerance);
  return [...upper.slice(0, -1), ...lower.slice(0, -1)];
}

function polygonConfidence(vertices: readonly ShapePoint[], expected: number) {
  const cornerScore = 1 - Math.min(1, Math.abs(vertices.length - expected) / 2);
  if (vertices.length < 2) return 0;
  const lengths = vertices.map((point, index) =>
    distance(point, vertices[(index + 1) % vertices.length]!),
  );
  const average = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const shortest = Math.min(...lengths);
  return Math.max(0, Math.min(0.98, cornerScore * (0.84 + 0.14 * Math.min(1, shortest / Math.max(average, 1)))));
}

export function recognizeShape(input: readonly ShapePoint[]): RecognizedShape | null {
  const points = sample(input);
  if (points.length < 5) return null;
  const box = bounds(points);
  const diagonal = Math.hypot(box.width, box.height);
  if (diagonal < 12) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const pathLength = points.slice(1).reduce(
    (sum, point, index) => sum + distance(points[index]!, point),
    0,
  );
  const closure = distance(first, last) / diagonal;
  const straightness = distance(first, last) / Math.max(pathLength, 1);

  if (closure > 0.2 && straightness >= 0.94) {
    return {
      kind: "line",
      confidence: Math.min(0.99, 0.82 + (straightness - 0.94) * 2.8),
      points: [first, last],
      bounds: box,
    };
  }

  const openSimplified = simplifyRdp(points, diagonal * 0.045);
  if (closure > 0.2 && openSimplified.length >= 4 && openSimplified.length <= 7) {
    let tipIndex = 1;
    for (let index = 2; index < openSimplified.length; index += 1) {
      if (distance(first, openSimplified[index]!) > distance(first, openSimplified[tipIndex]!)) {
        tipIndex = index;
      }
    }
    const tip = openSimplified[tipIndex]!;
    const hasHeadAfterTip = tipIndex < openSimplified.length - 1;
    const headLength = hasHeadAfterTip ? distance(tip, openSimplified[tipIndex + 1]!) : 0;
    if (hasHeadAfterTip && distance(first, tip) > diagonal * 0.7 && headLength < diagonal * 0.55) {
      return {
        kind: "arrow",
        confidence: 0.86,
        points: [first, tip],
        bounds: box,
      };
    }
  }

  if (closure > 0.18) return null;

  const vertices = simplifyClosed(points, diagonal * 0.055);
  if (vertices.length === 3) {
    const confidence = polygonConfidence(vertices, 3);
    return confidence >= 0.82
      ? { kind: "triangle", confidence, points: vertices, bounds: box }
      : null;
  }
  if (vertices.length === 4) {
    const confidence = polygonConfidence(vertices, 4);
    if (confidence < 0.82) return null;
    const sides = vertices.map((point, index) =>
      distance(point, vertices[(index + 1) % vertices.length]!),
    );
    const averageSide = sides.reduce((sum, value) => sum + value, 0) / 4;
    const equalSides = Math.max(...sides) / Math.max(Math.min(...sides), 1) < 1.28;
    const firstEdgeAngle = Math.abs(Math.atan2(
      vertices[1]![1] - vertices[0]![1],
      vertices[1]![0] - vertices[0]![0],
    ));
    const normalizedAngle = firstEdgeAngle % (Math.PI / 2);
    const diamondLike = equalSides && normalizedAngle > Math.PI / 7 && normalizedAngle < Math.PI * 5 / 14;
    const aspect = box.width / Math.max(box.height, 1);
    const kind: RecognizedShapeKind = diamondLike
      ? "diamond"
      : equalSides && aspect > 0.78 && aspect < 1.22 && averageSide > 0
        ? "square"
        : "rectangle";
    return { kind, confidence, points: vertices, bounds: box };
  }

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const radiusX = Math.max(box.width / 2, 1);
  const radiusY = Math.max(box.height / 2, 1);
  const radialError = points.reduce((sum, point) => {
    const normalizedRadius = Math.hypot(
      (point[0] - centerX) / radiusX,
      (point[1] - centerY) / radiusY,
    );
    return sum + Math.abs(1 - normalizedRadius);
  }, 0) / points.length;
  const confidence = Math.max(0, Math.min(0.98,
    0.98 - radialError * 1.7 - closure * 0.35,
  ));
  if (confidence < 0.82) return null;
  const aspect = box.width / Math.max(box.height, 1);
  return {
    kind: aspect > 0.84 && aspect < 1.19 ? "circle" : "ellipse",
    confidence,
    points: [],
    bounds: box,
  };
}
