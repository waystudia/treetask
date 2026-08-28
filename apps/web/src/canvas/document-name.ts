const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canvasDocumentName(projectId: string): string {
  if (!UUID_PATTERN.test(projectId)) throw new Error("Canvas collaboration requires a project UUID");
  return `project:${projectId}:canvas:${projectId}`;
}

export function shouldPublishLocalCanvasSnapshot(
  hadLocalSnapshotOnLoad: boolean,
  localUpdatedAt: string | undefined,
  remoteUpdatedAt: string | undefined,
): boolean {
  if (!hadLocalSnapshotOnLoad) return false;
  if (!remoteUpdatedAt) return true;
  if (!localUpdatedAt) return false;
  return Date.parse(localUpdatedAt) > Date.parse(remoteUpdatedAt);
}
