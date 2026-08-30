import { useEffect } from "react";
import { hydrateRemoteData } from "../data/remote-sync";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useRemoteSyncStore } from "../store/remote-sync";

const REFRESH_INTERVAL_MS = 60_000;
const BROADCAST_DEBOUNCE_MS = 250;

export function RemoteDataSync() {
  const setRemoteSync = useRemoteSyncStore((state) => state.setRemoteSync);
  const message = useRemoteSyncStore((state) => state.message);

  useEffect(() => {
    const client = supabase;
    if (!client || !isSupabaseConfigured) {
      setRemoteSync("local", "Локальный offline-first режим", null);
      return;
    }
    const activeClient = client;

    let disposed = false;
    let pulling = false;
    let pullAgain = false;
    let debounceTimer: number | undefined;
    const channels = new Map<string, ReturnType<typeof activeClient.channel>>();

    const removeChannels = async () => {
      const current = [...channels.values()];
      channels.clear();
      await Promise.all(current.map((channel) => activeClient.removeChannel(channel)));
    };

    const schedulePull = (delay = BROADCAST_DEBOUNCE_MS) => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void pull(), delay);
    };

    const syncChannels = (projectIds: readonly string[]) => {
      const expected = new Set(projectIds.map((projectId) => `project:${projectId}`));
      for (const [topic, channel] of channels) {
        if (expected.has(topic)) continue;
        channels.delete(topic);
        void activeClient.removeChannel(channel);
      }
      for (const topic of expected) {
        if (channels.has(topic)) continue;
        const channel = activeClient
          .channel(topic, { config: { private: true } })
          .on("broadcast", { event: "*" }, () => schedulePull())
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setRemoteSync("error", "Realtime временно недоступен; включён периодический pull");
            }
          });
        channels.set(topic, channel);
      }
    };

    async function pull() {
      if (disposed) return;
      if (pulling) {
        pullAgain = true;
        return;
      }
      if (!navigator.onLine) {
        setRemoteSync("offline", "Нет сети; локальные изменения сохранены");
        return;
      }
      pulling = true;
      setRemoteSync("syncing", "Синхронизация с Supabase…");
      try {
        const { data, error } = await activeClient.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          await removeChannels();
          setRemoteSync("signed_out", "Войдите, чтобы синхронизировать проекты", null);
          return;
        }
        await activeClient.realtime.setAuth();
        const result = await hydrateRemoteData(activeClient);
        if (disposed) return;
        window.dispatchEvent(new CustomEvent("treetask:remote-pulled", { detail: { syncedAt: result.syncedAt } }));
        syncChannels(result.projectIds);
        setRemoteSync(
          "synced",
          `Синхронизировано: ${result.areas} областей, ${result.projects} проектов, ${result.tasks} задач`,
          result.syncedAt,
        );
      } catch (error) {
        if (disposed) return;
        setRemoteSync(
          "error",
          error instanceof Error ? `Ошибка синхронизации: ${error.message}` : "Ошибка синхронизации",
        );
      } finally {
        pulling = false;
        if (pullAgain && !disposed) {
          pullAgain = false;
          schedulePull(0);
        }
      }
    }

    const onOnline = () => schedulePull(0);
    const onOffline = () => setRemoteSync("offline", "Нет сети; локальные изменения сохранены");
    const onVisibility = () => {
      if (document.visibilityState === "visible") schedulePull(0);
    };
    const onMutationFlushed = () => schedulePull(0);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("treetask:mutation-flushed", onMutationFlushed);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => schedulePull(0), REFRESH_INTERVAL_MS);
    const { data: authListener } = activeClient.auth.onAuthStateChange(() => schedulePull(0));
    schedulePull(0);

    return () => {
      disposed = true;
      window.clearTimeout(debounceTimer);
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("treetask:mutation-flushed", onMutationFlushed);
      document.removeEventListener("visibilitychange", onVisibility);
      authListener.subscription.unsubscribe();
      void removeChannels();
    };
  }, [setRemoteSync]);

  return <span className="sr-only" role="status" aria-live="polite">{message}</span>;
}
