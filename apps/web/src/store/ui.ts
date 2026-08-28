import { create } from "zustand";

export type CanvasTool =
  | "select"
  | "lasso"
  | "hand"
  | "text"
  | "sticky"
  | "pen"
  | "eraser";

interface UiState {
  mobileMenuOpen: boolean;
  quickTaskOpen: boolean;
  quickTaskProjectId: string | null;
  canvasTool: CanvasTool;
  setMobileMenuOpen: (value: boolean) => void;
  setQuickTaskOpen: (value: boolean) => void;
  setQuickTaskProjectId: (projectId: string | null) => void;
  setCanvasTool: (tool: CanvasTool) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mobileMenuOpen: false,
  quickTaskOpen: false,
  quickTaskProjectId: null,
  canvasTool: "select",
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
  setQuickTaskOpen: (quickTaskOpen) => set({ quickTaskOpen }),
  setQuickTaskProjectId: (quickTaskProjectId) => set({ quickTaskProjectId }),
  setCanvasTool: (canvasTool) => set({ canvasTool }),
}));
