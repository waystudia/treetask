import { create } from "zustand";

export type CanvasTool =
  | "select"
  | "lasso"
  | "hand"
  | "text"
  | "sticky"
  | "pen";

interface UiState {
  mobileMenuOpen: boolean;
  quickTaskOpen: boolean;
  canvasTool: CanvasTool;
  setMobileMenuOpen: (value: boolean) => void;
  setQuickTaskOpen: (value: boolean) => void;
  setCanvasTool: (tool: CanvasTool) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mobileMenuOpen: false,
  quickTaskOpen: false,
  canvasTool: "select",
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
  setQuickTaskOpen: (quickTaskOpen) => set({ quickTaskOpen }),
  setCanvasTool: (canvasTool) => set({ canvasTool }),
}));
