import type { User } from "@supabase/supabase-js";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

interface AuthState {
  user: User | null;
  loading: boolean;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  refreshAdminStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const refreshAdminStatus = useCallback(async () => {
    const client = supabase;
    if (!client || !user) {
      setIsPlatformAdmin(false);
      return;
    }
    const { data, error } = await client.rpc("is_platform_admin");
    setIsPlatformAdmin(!error && data === true);
  }, [user]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshAdminStatus();
  }, [refreshAdminStatus]);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    isPlatformAdmin,
    mustChangePassword: user?.app_metadata?.must_change_password === true,
    refreshAdminStatus,
  }), [isPlatformAdmin, loading, refreshAdminStatus, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
