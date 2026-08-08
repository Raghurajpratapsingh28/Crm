import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./notification-bell";
import { NotificationProvider } from "./notification-provider";

const apiFetch = vi.fn();
const push = vi.fn();

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("../../lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiRequestError: class ApiRequestError extends Error {},
}));

vi.mock("../auth-provider", () => ({
  useAuth: () => ({
    session: { access_token: "token" },
    can: () => true,
  }),
}));

const unread = {
  id: "n1",
  type: "DEAL_WON",
  title: "Deal won",
  message: '"Acme Enterprise Contract" was marked as won.',
  entityType: "DEAL",
  entityId: "d1",
  payload: { dealId: "d1", name: "Acme Enterprise Contract" },
  readAt: null,
  createdAt: new Date().toISOString(),
  href: "/deals/d1",
};

function renderBell() {
  return render(
    <NotificationProvider>
      <NotificationBell />
    </NotificationProvider>,
  );
}

afterEach(() => {
  apiFetch.mockReset();
  push.mockReset();
});

describe("NotificationBell", () => {
  it("renders the unread badge, opens the dropdown, and shows empty/error states", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).includes("unread-count")) return { count: 7 };
      if (String(path).startsWith("/api/v1/notifications")) {
        return { items: [unread], pagination: { page: 1, limit: 8, total: 1, totalPages: 1 } };
      }
      return {};
    });
    const user = userEvent.setup();
    renderBell();
    const button = await screen.findByRole("button", { name: "Notifications, 7 unread" });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(await screen.findByText("Deal won")).toBeInTheDocument();
    expect(screen.getByText(/Acme Enterprise Contract/)).toBeInTheDocument();
    expect(screen.getByText("View all")).toHaveAttribute("href", "/notifications");
  });

  it("marks a notification read and navigates", async () => {
    apiFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (String(path).includes("unread-count")) return { count: 1 };
      if (String(path).includes("/read") && options?.method === "PATCH") {
        return { ...unread, readAt: new Date().toISOString() };
      }
      if (String(path).startsWith("/api/v1/notifications")) {
        return { items: [unread], pagination: { page: 1, limit: 8, total: 1, totalPages: 1 } };
      }
      return {};
    });
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await user.click(await screen.findByText("Deal won"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/deals/d1"));
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/notifications/n1/read", expect.objectContaining({ method: "PATCH" }));
  });

  it("shows an error state and restores unread count when mark-all fails", async () => {
    apiFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (String(path).includes("read-all") && options?.method === "PATCH") {
        throw new Error("nope");
      }
      if (String(path).includes("unread-count")) return { count: 1 };
      return { items: [unread], pagination: { page: 1, limit: 8, total: 1, totalPages: 1 } };
    });
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await user.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to mark notifications as read.");
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).includes("unread-count")) return { count: 0 };
      return { items: [], pagination: { page: 1, limit: 8, total: 0, totalPages: 1 } };
    });
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();
  });

  it("cleans up polling on unmount", async () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).includes("unread-count")) return { count: 0 };
      return { items: [], pagination: { page: 1, limit: 8, total: 0, totalPages: 1 } };
    });
    const { unmount } = renderBell();
    await screen.findByRole("button", { name: "Notifications" });
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
