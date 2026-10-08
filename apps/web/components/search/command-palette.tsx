"use client";

import type { GlobalSearchResponse, Permission } from "@crm/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "../crm/ui";
import { useAuth } from "../auth-provider";
import { apiFetch } from "../../lib/api";
import { commandItems, flattenSearchResults, groupPaletteItems, RESULT_ICONS, type PaletteItem } from "../../lib/search";
import {
  handleShortcutKey,
  isTypingTarget,
  nextIndex,
  SEARCH_DEBOUNCE_MS,
  SEARCH_SPINNER_DELAY_MS,
  SEQUENCE_TIMEOUT_MS,
  SHORTCUT_HREFS,
  SHORTCUT_PERMISSIONS,
  SHORTCUT_REGISTRY,
  type SequencePrefix,
  type ShortcutAction,
} from "../../lib/shortcuts";
import { SearchErrorBoundary } from "./search-error-boundary";

interface CommandPaletteContextValue {
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const { can, session } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const restoreRef = useRef<HTMLElement | null>(null);
  const prefixRef = useRef<SequencePrefix>(null);
  const timerRef = useRef<number | null>(null);

  const clearSequence = useCallback(() => {
    prefixRef.current = null;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const openSearch = useCallback(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setHelpOpen(false);
    setOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    const node = restoreRef.current;
    restoreRef.current = null;
    window.setTimeout(() => node?.focus?.(), 0);
  }, []);

  const runAction = useCallback(
    (action: ShortcutAction) => {
      const permission = SHORTCUT_PERMISSIONS[action];
      if (permission && !can(permission)) return;
      if (action === "search") {
        openSearch();
        return;
      }
      if (action === "help") {
        setOpen(false);
        setHelpOpen((value) => !value);
        return;
      }
      setOpen(false);
      setHelpOpen(false);
      router.push(SHORTCUT_HREFS[action]);
    },
    [can, openSearch, router],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const result = handleShortcutKey({
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        typing: isTypingTarget(event.target),
        paletteOpen: open,
        helpOpen,
        prefix: prefixRef.current,
      });
      if (result.preventDefault) event.preventDefault();
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      prefixRef.current = result.prefix;
      if (result.armLeadTimeout) {
        timerRef.current = window.setTimeout(() => {
          prefixRef.current = null;
          timerRef.current = null;
          runAction("newLead");
        }, SEQUENCE_TIMEOUT_MS);
      }
      if (result.action) runAction(result.action);
    }
    function onFocusIn(event: FocusEvent) {
      if (isTypingTarget(event.target)) clearSequence();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focusin", onFocusIn);
      clearSequence();
    };
  }, [open, helpOpen, runAction, clearSequence]);

  const value = useMemo(() => ({ open, openSearch, closeSearch }), [open, openSearch, closeSearch]);

  return (
    <CommandPaletteContext.Provider value={value}>
      <SearchErrorBoundary>
        <SearchDialog
          open={open}
          token={session?.access_token}
          can={can}
          onClose={closeSearch}
          onNavigate={(href) => {
            closeSearch();
            router.push(href);
          }}
          onHelp={() => {
            closeSearch();
            setHelpOpen(true);
          }}
        />
        <KeyboardShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      </SearchErrorBoundary>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function SearchTrigger() {
  const { openSearch } = useCommandPalette();
  return (
    <button type="button" className="search-trigger" onClick={openSearch} aria-keyshortcuts="/">
      <span>Search…</span>
      <kbd className="kbd-hint">/</kbd>
    </button>
  );
}

function SearchDialog({
  open,
  token,
  can,
  onClose,
  onNavigate,
  onHelp,
}: {
  open: boolean;
  token?: string;
  can: (permission: Permission) => boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
  onHelp: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [retry, setRetry] = useState(0);
  const listId = useId();
  const optionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (open) return;
    setQuery("");
    setResults(null);
    setError(null);
    setLoading(false);
    setSelected(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!token) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q, type: "all", limit: "20" });
        const data = await apiFetch<GlobalSearchResponse>(`/api/v1/search?${params}`, {
          token,
          signal: controller.signal,
        });
        setResults(data);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setResults(null);
        setError("Unable to search right now. Try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, token, retry]);

  useEffect(() => {
    if (!loading) {
      setShowSpinner(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSpinner(true), SEARCH_SPINNER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const commands = useMemo(() => commandItems(can), [can]);
  const trimmed = query.trim();
  const items = useMemo(() => {
    if (!trimmed) return commands;
    if (error) return [];
    if (!results) return [];
    return flattenSearchResults(results);
  }, [trimmed, commands, error, results]);
  const groups = useMemo(() => groupPaletteItems(items), [items]);

  useEffect(() => {
    setSelected(0);
  }, [trimmed, results, error]);

  useEffect(() => {
    const current = items[selected];
    if (!current) return;
    optionRefs.current[current.id]?.scrollIntoView({ block: "nearest" });
  }, [selected, items]);

  function activate(item: PaletteItem | undefined) {
    if (!item) return;
    if (item.kind === "command" && item.action === "help") {
      onHelp();
      return;
    }
    if (item.href) onNavigate(item.href);
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((value) => nextIndex(value, items.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((value) => nextIndex(value, items.length, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      activate(items[selected]);
    }
  }

  const selectedId = items[selected]?.id;
  const emptyQuery = !trimmed;
  const noResults = Boolean(trimmed && !loading && !error && results && items.length === 0);

  return (
    <ConfirmDialog open={open} title="Search" hideActions className="dialog-search" onClose={onClose}>
      <div className="search-palette">
        <label className="search-palette-field">
          <span className="sr-only">Search contacts, companies, deals, and activities</span>
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={selectedId ? `${listId}-${selectedId}` : undefined}
            aria-autocomplete="list"
            placeholder="Search contacts, companies, deals…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        {showSpinner ? (
          <p className="muted search-palette-status" aria-live="polite">
            Searching…
          </p>
        ) : null}
        {error ? (
          <div className="search-palette-status" role="alert">
            <p>Unable to search right now. Try again.</p>
            <button type="button" className="secondary" onClick={() => setRetry((value) => value + 1)}>
              Retry
            </button>
          </div>
        ) : null}
        {noResults ? (
          <p className="search-palette-status" role="status">
            No results for “{trimmed}”. Try a different search term.
          </p>
        ) : null}
        <div id={listId} role="listbox" aria-label="Search results" className="search-palette-list">
          {groups.map((group) => (
            <section key={group.label} className="search-palette-group">
              <h3 id={`${listId}-${group.label}`}>
                {group.label}
                {group.items[0]?.kind === "result" ? (
                  <span className="muted"> {group.items.length}</span>
                ) : null}
              </h3>
              {group.items.map((item) => {
                const index = items.indexOf(item);
                const active = index === selected;
                const icon = item.kind === "result" ? RESULT_ICONS[item.result.type] : "→";
                return (
                  <div
                    key={item.id}
                    id={`${listId}-${item.id}`}
                    ref={(node) => {
                      optionRefs.current[item.id] = node;
                    }}
                    role="option"
                    aria-selected={active}
                    className="search-option"
                    onMouseEnter={() => setSelected(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => activate(item)}
                  >
                    <span className="search-icon" aria-hidden="true">
                      {icon}
                    </span>
                    <span>
                      <span className="search-option-title">{item.label}</span>
                      {item.description ? <span className="muted search-option-sub">{item.description}</span> : null}
                      {item.kind === "result" ? (
                        <span className="sr-only">
                          {item.result.type}
                          {active ? ", selected" : ""}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        {emptyQuery && items.length === 0 ? (
          <p className="search-palette-status" role="status">
            No actions available.
          </p>
        ) : null}
        <p className="search-palette-footer kbd-hint">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>esc Close</span>
        </p>
      </div>
    </ConfirmDialog>
  );
}

function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = ["Navigation", "Creation", "Search"] as const;
  return (
    <ConfirmDialog open={open} title="Keyboard shortcuts" cancelLabel="Close" onClose={onClose}>
      {groups.map((group) => (
        <section key={group} className="shortcut-help-group">
          <h3>{group}</h3>
          <ul className="shortcut-help-list">
            {SHORTCUT_REGISTRY.filter((item) => item.group === group).map((item) => (
              <li key={item.id}>
                <kbd>{item.keys}</kbd>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="muted">Shortcuts are ignored while typing in fields. On phones, use Search in the sidebar.</p>
    </ConfirmDialog>
  );
}
