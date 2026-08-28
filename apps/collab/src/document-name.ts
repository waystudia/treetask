const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CanvasDocumentName {
  projectId: string;
  canvasId: string;
}

export function parseCanvasDocumentName(value: string): CanvasDocumentName {
  const [prefix, projectId, kind, canvasId, ...rest] = value.split(":");
  if (
    prefix !== "project" ||
    kind !== "canvas" ||
    rest.length > 0 ||
    !projectId ||
    !canvasId ||
    !UUID_PATTERN.test(projectId) ||
    !UUID_PATTERN.test(canvasId)
  ) {
    throw new Error("Invalid Canvas document name");
  }
  return { projectId, canvasId };
}
