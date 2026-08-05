import { AppNav } from "../../components/app-nav";
import { AuthGate } from "../../components/auth-gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="shell">
        <AppNav />
        <div>{children}</div>
      </div>
    </AuthGate>
  );
}
