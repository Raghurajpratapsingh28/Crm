import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPaletteProvider, SearchTrigger } from "./command-palette";
import type { GlobalSearchResponse } from "@crm/types";
import { SEARCH_DEBOUNCE_MS, SEQUENCE_TIMEOUT_MS } from "../../lib/shortcuts";

const apiFetch = vi.fn();
const push = vi.fn();
const can = vi.fn(() => true);

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
    can: (permission: string) => can(permission),
  }),
}));

const grouped: GlobalSearchResponse = {
  query: "john",
  total: 2,
  results: {
    contacts: [{ id: "c1", type: "contact", title: "John Doe", subtitle: "john@x.test", href: "/contacts/c1", relevance: 1 }],
    companies: [{ id: "co1", type: "company", title: "Johnson Labs", subtitle: "Software", href: "/companies/co1", relevance: 2 }],
    deals: [],
    activities: [],
  },
};

function renderPalette() {
  return render(
    <CommandPaletteProvider>
      <SearchTrigger />
    </CommandPaletteProvider>,
  );
}

afterEach(() => {
  apiFetch.mockReset();
  push.mockReset();
  can.mockImplementation(() => true);
  vi.useRealTimers();
});

describe("Command palette", () => {
  it("opens from the trigger and from /", async () => {
    renderPalette();
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Search/ }));
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: "/" });
    expect(await screen.findByRole("dialog", { name: "Search" })).toBeInTheDocument();
  });

  it("shows commands when empty and grouped results after search", async () => {
    apiFetch.mockResolvedValue(grouped);
    renderPalette();
    fireEvent.keyDown(window, { key: "/" });
    expect(await screen.findByText("New Contact")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "john");
    expect(await screen.findByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Contacts")).toBeInTheDocument();
    expect(screen.getByText("Companies")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /John Doe/ })).toHaveAttribute("aria-selected", "true");
  });

  it("navigates results with arrows, opens with Enter, and wraps", async () => {
    apiFetch.mockResolvedValue(grouped);
    renderPalette();
    fireEvent.keyDown(window, { key: "/" });
    const input = await screen.findByRole("combobox");
    await userEvent.type(input, "john");
    await screen.findByText("John Doe");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Johnson Labs/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /John Doe/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/contacts/c1");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument());
  });

  it("shows an error with retry and a no-results state", async () => {
    apiFetch.mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce({
      query: "zzz",
      total: 0,
      results: { contacts: [], companies: [], deals: [], activities: [] },
    });
    renderPalette();
    fireEvent.keyDown(window, { key: "/" });
    const input = await screen.findByRole("combobox");
    await userEvent.type(input, "zzz");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to search right now.");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/No results for “zzz”/)).toBeInTheDocument();
  });

  it("keeps the latest query when an older request finishes later", async () => {
    const pending: Array<{ path: string; resolve: (value: unknown) => void; reject: (reason?: unknown) => void }> = [];
    apiFetch.mockImplementation((path: string, options?: { signal?: AbortSignal }) => {
      return new Promise((resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
        pending.push({ path: String(path), resolve, reject });
      });
    });
    renderPalette();
    fireEvent.keyDown(window, { key: "/" });
    const input = await screen.findByRole("combobox");
    await userEvent.type(input, "jo");
    await waitFor(() => expect(pending.length).toBe(1));
    await userEvent.type(input, "hn");
    await waitFor(() => expect(pending.length).toBe(2));
    pending[0]?.resolve({
      query: "jo",
      total: 1,
      results: {
        contacts: [{ id: "old", type: "contact", title: "Jo Old", href: "/contacts/old", relevance: 3 }],
        companies: [],
        deals: [],
        activities: [],
      },
    });
    pending[1]?.resolve({
      query: "john",
      total: 1,
      results: {
        contacts: [{ id: "new", type: "contact", title: "John New", href: "/contacts/new", relevance: 1 }],
        companies: [],
        deals: [],
        activities: [],
      },
    });
    expect(await screen.findByText("John New")).toBeInTheDocument();
    expect(screen.queryByText("Jo Old")).not.toBeInTheDocument();
  });

  it("does not trigger shortcuts while typing in form controls", async () => {
    render(
      <CommandPaletteProvider>
        <SearchTrigger />
        <input aria-label="Name" />
        <textarea aria-label="Notes" />
        <select aria-label="Stage">
          <option>Lead</option>
        </select>
        <div role="textbox" aria-label="Custom field" tabIndex={0}>
          custom
        </div>
        <div contentEditable aria-label="Editor" />
      </CommandPaletteProvider>,
    );
    for (const label of ["Name", "Notes", "Stage", "Editor"]) {
      const node = screen.getByLabelText(label);
      node.focus();
      fireEvent.keyDown(node, { key: "/" });
      fireEvent.keyDown(node, { key: "n" });
      fireEvent.keyDown(node, { key: "g" });
    }
    screen.getByRole("textbox", { name: "Custom field" }).focus();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Custom field" }), { key: "/" });
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores modifier combinations", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    fireEvent.keyDown(window, { key: "/", metaKey: true });
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("runs creation and navigation sequences", async () => {
    vi.useFakeTimers();
    renderPalette();
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "d" });
    expect(push).toHaveBeenCalledWith("/dashboard");
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "c" });
    expect(push).toHaveBeenCalledWith("/contacts");
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "p" });
    expect(push).toHaveBeenCalledWith("/pipeline");
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "a" });
    expect(push).toHaveBeenCalledWith("/analytics");
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.keyDown(window, { key: "c" });
    expect(push).toHaveBeenCalledWith("/contacts/new");
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.keyDown(window, { key: "d" });
    expect(push).toHaveBeenCalledWith("/deals/new");
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.keyDown(window, { key: "t" });
    expect(push).toHaveBeenCalledWith("/tasks?new=1");
    push.mockClear();
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.keyDown(window, { key: "x" });
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "n" });
    await vi.advanceTimersByTimeAsync(SEQUENCE_TIMEOUT_MS);
    expect(push).toHaveBeenCalledWith("/deals/new");
  });

  it("opens the shortcuts help modal", async () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "?" });
    const help = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(help).getByText("G D")).toBeInTheDocument();
    expect(within(help).getByText("Dashboard")).toBeInTheDocument();
  });
});

describe("command palette debounce", () => {
  it("waits before calling the API", async () => {
    vi.useFakeTimers();
    apiFetch.mockResolvedValue(grouped);
    renderPalette();
    fireEvent.keyDown(window, { key: "/" });
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "john" } });
    expect(apiFetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
