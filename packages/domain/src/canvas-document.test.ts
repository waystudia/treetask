import { describe, expect, it } from "vitest";
import { addCanvasNodes, createEmptyCanvasSnapshot, deleteCanvasNodes, updateCanvasNode } from "./canvas-document";

describe("canvas document commands", () => {
  it("adds a connected group of nodes", () => {
    const result = addCanvasNodes(createEmptyCanvasSnapshot("before"), [
      { id: "goal", text: "Цель", x: 0, y: 0 },
      { id: "step", text: "Шаг", x: 240, y: 0, parentId: "goal" },
    ], "after");
    expect(result.items).toHaveLength(2);
    expect(result.items[1]?.parentId).toBe("goal");
    expect(result.updatedAt).toBe("after");
  });

  it("updates a node without replacing the rest of the snapshot", () => {
    const original = addCanvasNodes(createEmptyCanvasSnapshot(), [{ id: "a", text: "A", x: 1, y: 2 }]);
    const result = updateCanvasNode(original, "a", { text: "Готово", x: 50 });
    expect(result.items[0]).toMatchObject({ text: "Готово", x: 50, y: 2 });
  });

  it("deletes descendants with their parent", () => {
    const original = addCanvasNodes(createEmptyCanvasSnapshot(), [
      { id: "root", text: "Root", x: 0, y: 0 },
      { id: "child", text: "Child", x: 1, y: 1, parentId: "root" },
    ]);
    expect(deleteCanvasNodes(original, ["root"]).items).toEqual([]);
  });
});
