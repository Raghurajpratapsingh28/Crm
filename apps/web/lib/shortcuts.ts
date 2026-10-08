import { PERMISSIONS, type Permission } from "@crm/types";

export const SEQUENCE_TIMEOUT_MS = 800;
export const SEARCH_DEBOUNCE_MS = 200;
export const SEARCH_SPINNER_DELAY_MS = 120;

export type SequencePrefix = "n" | "g" | null;

export type ShortcutAction =
  | "search"
  | "help"
  | "newLead"
  | "newContact"
  | "newDeal"
  | "newTask"
  | "dashboard"
  | "contacts"
  | "pipeline"
  | "analytics";

export const SHORTCUT_HREFS: Record<Exclude<ShortcutAction, "search" | "help">, string> = {
  newLead: "/deals/new",
  newContact: "/contacts/new",
  newDeal: "/deals/new",
  newTask: "/tasks?new=1",
  dashboard: "/dashboard",
  contacts: "/contacts",
  pipeline: "/pipeline",
  analytics: "/analytics",
};

export const SHORTCUT_PERMISSIONS: Partial<Record<ShortcutAction, Permission>> = {
  newLead: PERMISSIONS.DEALS_CREATE,
  newContact: PERMISSIONS.CONTACTS_CREATE,
  newDeal: PERMISSIONS.DEALS_CREATE,
  newTask: PERMISSIONS.TASKS_CREATE,
  contacts: PERMISSIONS.CONTACTS_READ,
  pipeline: PERMISSIONS.PIPELINE_READ,
  analytics: PERMISSIONS.ANALYTICS_READ,
};

export const SHORTCUT_REGISTRY: Array<{
  id: ShortcutAction;
  keys: string;
  label: string;
  group: "Navigation" | "Creation" | "Search";
}> = [
  { id: "dashboard", keys: "G D", label: "Dashboard", group: "Navigation" },
  { id: "contacts", keys: "G C", label: "Contacts", group: "Navigation" },
  { id: "pipeline", keys: "G P", label: "Pipeline", group: "Navigation" },
  { id: "analytics", keys: "G A", label: "Analytics", group: "Navigation" },
  { id: "newContact", keys: "N C", label: "New Contact", group: "Creation" },
  { id: "newDeal", keys: "N D", label: "New Deal", group: "Creation" },
  { id: "newTask", keys: "N T", label: "New Task", group: "Creation" },
  { id: "newLead", keys: "N", label: "New Lead / Deal", group: "Creation" },
  { id: "search", keys: "/", label: "Global Search", group: "Search" },
  { id: "help", keys: "?", label: "Keyboard Shortcuts", group: "Search" },
];

export function isTypingTarget(target: EventTarget | null) {
  if (!target || !(target instanceof Element)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    const type = target.type;
    if (["button", "submit", "checkbox", "radio", "reset", "file", "color", "range", "hidden", "image"].includes(type)) {
      return false;
    }
    return true;
  }
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return Boolean(el.closest('[contenteditable="true"], [contenteditable=""], [role="textbox"]'));
}

export function handleShortcutKey(input: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  typing: boolean;
  paletteOpen: boolean;
  helpOpen: boolean;
  prefix: SequencePrefix;
}): { action: ShortcutAction | null; prefix: SequencePrefix; armLeadTimeout: boolean; preventDefault: boolean } {
  const idle = { action: null, prefix: input.prefix, armLeadTimeout: false, preventDefault: false };
  if (input.metaKey || input.ctrlKey || input.altKey) return idle;
  if (input.typing) return idle;
  if (input.paletteOpen) {
    return { action: null, prefix: null, armLeadTimeout: false, preventDefault: false };
  }

  const key = input.key;
  if (key === "/" && !input.shiftKey) {
    return { action: "search", prefix: null, armLeadTimeout: false, preventDefault: true };
  }
  if (key === "?") {
    return { action: "help", prefix: null, armLeadTimeout: false, preventDefault: true };
  }
  if (input.helpOpen) {
    return { action: null, prefix: null, armLeadTimeout: false, preventDefault: false };
  }

  const letter = key.length === 1 ? key.toLowerCase() : "";
  if (input.prefix === "n") {
    if (letter === "c") return { action: "newContact", prefix: null, armLeadTimeout: false, preventDefault: true };
    if (letter === "d") return { action: "newDeal", prefix: null, armLeadTimeout: false, preventDefault: true };
    if (letter === "t") return { action: "newTask", prefix: null, armLeadTimeout: false, preventDefault: true };
    return { action: null, prefix: null, armLeadTimeout: false, preventDefault: true };
  }
  if (input.prefix === "g") {
    if (letter === "d") return { action: "dashboard", prefix: null, armLeadTimeout: false, preventDefault: true };
    if (letter === "c") return { action: "contacts", prefix: null, armLeadTimeout: false, preventDefault: true };
    if (letter === "p") return { action: "pipeline", prefix: null, armLeadTimeout: false, preventDefault: true };
    if (letter === "a") return { action: "analytics", prefix: null, armLeadTimeout: false, preventDefault: true };
    return { action: null, prefix: null, armLeadTimeout: false, preventDefault: true };
  }
  if (letter === "n") {
    return { action: null, prefix: "n", armLeadTimeout: true, preventDefault: true };
  }
  if (letter === "g") {
    return { action: null, prefix: "g", armLeadTimeout: false, preventDefault: true };
  }
  return idle;
}

export function nextIndex(current: number, length: number, delta: number) {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}
