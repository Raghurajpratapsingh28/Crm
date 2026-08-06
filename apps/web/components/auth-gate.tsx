"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-provider";

const AUTH_PAGES = new Set(["/login", "/signup", "/forgot-password"]);

function isInvitationPath(pathname: string) {
  return pathname.startsWith("/invitations/");
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, isAuthenticated, organization } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (isInvitationPath(pathname)) return;

    if (!isAuthenticated && !AUTH_PAGES.has(pathname) && pathname !== "/") {
      router.replace("/login");
      return;
    }

    if (isAuthenticated && AUTH_PAGES.has(pathname)) {
      const next = new URLSearchParams(window.location.search).get("next");
      if (next?.startsWith("/invitations/")) {
        router.replace(next);
        return;
      }
      router.replace(organization ? "/dashboard" : "/onboarding");
      return;
    }

    if (isAuthenticated && organization && pathname === "/onboarding") {
      router.replace("/dashboard");
      return;
    }

    if (isAuthenticated && !organization && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [loading, isAuthenticated, organization, pathname, router]);

  if (loading) {
    return (
      <main>
        <div className="card">
          <h1>Loading</h1>
          <p>Checking your session…</p>
        </div>
      </main>
    );
  }

  return children;
}
