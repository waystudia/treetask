import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, CloudUpload, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "../data/db";
import { useRemoteSyncStore } from "../store/remote-sync";

export function OnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const pending = useLiveQuery(() => db.mutationQueue.count(), [], 0);
  const syncStatus = useRemoteSyncStore((state) => state.status);
  const syncMessage = useRemoteSyncStore((state) => state.message);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online && syncStatus !== "syncing" && !(syncStatus === "error" && pending > 0)) return null;
  const offlineLabel = pending > 0
    ? `Офлайн · сохранено: ${pending}`
    : "Офлайн · данные сохраняются";
  return (
    <div className={`offline-banner ${online ? "syncing" : ""}`} role="status">
      {online
        ? syncStatus === "syncing"
          ? <LoaderCircle className="sync-spinner" size={16} aria-hidden="true" />
          : <CloudUpload size={16} aria-hidden="true" />
        : <CloudOff size={16} aria-hidden="true" />}
      {online ? syncMessage : offlineLabel}
    </div>
  );
}
