import { create } from "zustand";

export type RemoteSyncState =
  | "local"
  | "signed_out"
  | "offline"
  | "syncing"
  | "synced"
  | "error";

interface RemoteSyncStore {
  status: RemoteSyncState;
  message: string;
  lastSyncedAt: string | null;
  setRemoteSync: (
    status: RemoteSyncState,
    message: string,
    lastSyncedAt?: string | null,
  ) => void;
}

export const useRemoteSyncStore = create<RemoteSyncStore>((set) => ({
  status: "local",
  message: "Локальный offline-first режим",
  lastSyncedAt: null,
  setRemoteSync: (status, message, lastSyncedAt) => set((current) => ({
    status,
    message,
    lastSyncedAt: lastSyncedAt === undefined ? current.lastSyncedAt : lastSyncedAt,
  })),
}));
