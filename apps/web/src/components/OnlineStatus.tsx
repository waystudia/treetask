import { CloudOff } from "lucide-react";
import { useEffect, useState } from "react";

export function OnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);

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

  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <CloudOff size={16} aria-hidden="true" />
      Нет сети — изменения сохраняются на устройстве
    </div>
  );
}
