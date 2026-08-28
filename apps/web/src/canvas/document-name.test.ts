import { describe, expect, it } from "vitest";
import { canvasDocumentName, shouldPublishLocalCanvasSnapshot } from "./document-name";

const PROJECT_ID = "28b17915-822d-4a8f-97f4-26335875fe30";

describe("canvas document name", () => {
  it("uses the project UUID as a deterministic main-canvas UUID", () => {
    expect(canvasDocumentName(PROJECT_ID)).toBe(
      `project:${PROJECT_ID}:canvas:${PROJECT_ID}`,
    );
  });

  it("rejects local demo slugs", () => {
    expect(() => canvasDocumentName("wayyaam")).toThrow();
  });

  it("publishes an offline snapshot only when it pre-existed and is newer", () => {
    expect(shouldPublishLocalCanvasSnapshot(false, "2026-08-28T10:00:00Z", "2026-08-28T09:00:00Z")).toBe(false);
    expect(shouldPublishLocalCanvasSnapshot(true, "2026-08-28T10:00:00Z", "2026-08-28T09:00:00Z")).toBe(true);
    expect(shouldPublishLocalCanvasSnapshot(true, "2026-08-28T08:00:00Z", "2026-08-28T09:00:00Z")).toBe(false);
    expect(shouldPublishLocalCanvasSnapshot(true, "2026-08-28T10:00:00Z", undefined)).toBe(true);
  });
});
