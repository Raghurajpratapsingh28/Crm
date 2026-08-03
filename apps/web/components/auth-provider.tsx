"use client";

import type { Role } from "@crm/types";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiRequestError } from "../lib/api";
import { hasSupabaseConfig } from "../lib/env";
import { createBrowserSupabase } from "../lib/supabase/client";

export interface OrganizationSummary {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  role: Role;
  membershipStatus: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  organization: OrganizationSummary | null;
  membership: OrganizationSummary | null;
  role: Role | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshProfile: () => Promise<OrganizationSummary | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<OrganizationSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (accessToken?: string) => {
    if (!accessToken) {
      setOrganization(null);
      return null;
    }
    try {
      const data = await apiFetch<{
        user: { id: string };
        organization: OrganizationSummary | null;
      }>("/api/v1/auth/me", { token: accessToken });
      setOrganization(data.organization);
      return data.organization;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        setOrganization(null);
        return null;
      }
      throw error;
    }
  };

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setLoading(false);
      return;
    }

    const supabase = createBrowserSupabase();
    let cancelled = false;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      try {
        await loadProfile(data.session?.access_token);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();

    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, next: Session | null) => {
      setSession(next);
      setUser(next?.user ?? null);
      void loadProfile(next?.access_token);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      organization,
      membership: organization,
      role: organization?.role ?? null,
      loading,
      isAuthenticated: Boolean(session?.user),
      refreshProfile: () => loadProfile(session?.access_token) as Promise<OrganizationSummary | null>,
    }),
    [user, session, organization, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
