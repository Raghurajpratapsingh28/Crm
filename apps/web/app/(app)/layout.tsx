import Link from "next/link";
import { AuthGate } from "../../components/auth-gate";
import { LogoutButton } from "../../components/logout-button";

const links = [
  ["/dashboard", "Dashboard"],
  ["/leads", "Leads"],
  ["/contacts", "Contacts"],
  ["/companies", "Companies"],
  ["/deals", "Deals"],
  ["/pipeline", "Pipeline"],
  ["/tasks", "Tasks"],
  ["/activities", "Activities"],
  ["/analytics", "Analytics"],
  ["/team", "Team"],
  ["/settings", "Settings"],
  ["/billing", "Billing"],
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="shell">
        <nav>
          <strong>CRM</strong>
          {links.map(([href, label]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
          <LogoutButton />
        </nav>
        <div>{children}</div>
      </div>
    </AuthGate>
  );
}
