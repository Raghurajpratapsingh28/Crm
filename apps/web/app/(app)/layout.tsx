import { AppNav } from "../../components/app-nav";
import { AuthGate } from "../../components/auth-gate";
import { NotificationProvider } from "../../components/notifications/notification-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <NotificationProvider>
        <div className="shell">
          <AppNav />
          <div>{children}</div>
        </div>
      </NotificationProvider>
    </AuthGate>
  );
}
