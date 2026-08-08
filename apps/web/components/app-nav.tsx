"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notifications/notification-bell";
import { PERMISSIONS } from "../lib/permissions";

const links = [
  { href: "/dashboard", label: "Dashboard", show: true as const },
  { href: "/contacts", label: "Contacts", permission: PERMISSIONS.CONTACTS_READ },
  { href: "/companies", label: "Companies", permission: PERMISSIONS.COMPANIES_READ },
  { href: "/pipeline", label: "Pipeline", permission: PERMISSIONS.PIPELINE_READ },
  { href: "/tasks", label: "Tasks", permission: PERMISSIONS.TASKS_READ },
  { href: "/activities", label: "Activities", permission: PERMISSIONS.ACTIVITIES_READ },
  { href: "/analytics", label: "Analytics", permission: PERMISSIONS.ANALYTICS_TEAM },
  { href: "/team", label: "Team", permission: PERMISSIONS.USERS_READ },
  { href: "/billing", label: "Billing", permission: PERMISSIONS.BILLING_READ },
  { href: "/settings", label: "Settings", permission: PERMISSIONS.ORGANIZATION_READ },
] as const;

export function AppNav() {
  const { can } = useAuth();

  return (
    <nav>
      <strong>CRM</strong>
      {links.map((link) => {
        const visible = "show" in link ? link.show : can(link.permission);
        if (!visible) return null;
        return (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        );
      })}
      <NotificationBell />
      <LogoutButton />
    </nav>
  );
}
