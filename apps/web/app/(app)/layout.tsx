import { AppNav } from "../../components/app-nav";
import { AuthGate } from "../../components/auth-gate";
import { NotificationProvider } from "../../components/notifications/notification-provider";
import { CommandPaletteProvider } from "../../components/search/command-palette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <NotificationProvider>
        <CommandPaletteProvider>
          <div className="shell">
            <AppNav />
            <div>{children}</div>
          </div>
        </CommandPaletteProvider>
      </NotificationProvider>
    </AuthGate>
  );
}
