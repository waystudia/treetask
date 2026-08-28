import { describe, expect, it } from "vitest";
import { parseCanvasDocumentName } from "./document-name";

const PROJECT_ID = "28b17915-822d-4a8f-97f4-26335875fe30";
const CANVAS_ID = "66e758d9-440e-4b68-b0f1-cd9eeea3ac14";

describe("parseCanvasDocumentName", () => {
  it("accepts the scoped project/canvas name", () => {
    expect(parseCanvasDocumentName(`project:${PROJECT_ID}:canvas:${CANVAS_ID}`)).toEqual({
      projectId: PROJECT_ID,
      canvasId: CANVAS_ID,
    });
  });

  it("rejects an unscoped or malformed name", () => {
    expect(() => parseCanvasDocumentName("canvas:public")).toThrow();
    expect(() => parseCanvasDocumentName(`project:${PROJECT_ID}:canvas:any`)).toThrow();
  });
});
