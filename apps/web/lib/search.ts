import { PERMISSIONS, type GlobalSearchResponse, type GlobalSearchResult, type Permission } from "@crm/types";
import { SHORTCUT_HREFS } from "./shortcuts";

export type PaletteItem =
  | {
      kind: "result";
      id: string;
      group: string;
      label: string;
      description?: string;
      href: string;
      result: GlobalSearchResult;
    }
  | {
      kind: "command";
      id: string;
      group: string;
      label: string;
      description?: string;
      href?: string;
      action?: "help";
    };

const RESULT_GROUPS: Array<{ key: keyof GlobalSearchResponse["results"]; label: string }> = [
  { key: "contacts", label: "Contacts" },
  { key: "companies", label: "Companies" },
  { key: "deals", label: "Deals" },
  { key: "activities", label: "Activities" },
];

export const RESULT_ICONS: Record<GlobalSearchResult["type"], string> = {
  contact: "C",
  company: "Co",
  deal: "D",
  activity: "A",
};

export function flattenSearchResults(results: GlobalSearchResponse): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const group of RESULT_GROUPS) {
    for (const result of results.results[group.key]) {
      items.push({
        kind: "result",
        id: `${result.type}:${result.id}`,
        group: group.label,
        label: result.title,
        description: result.subtitle,
        href: result.href,
        result,
      });
    }
  }
  return items;
}

export function commandItems(can: (permission: Permission) => boolean): PaletteItem[] {
  const items: PaletteItem[] = [];
  if (can(PERMISSIONS.CONTACTS_CREATE)) {
    items.push({
      kind: "command",
      id: "cmd:new-contact",
      group: "Quick Actions",
      label: "New Contact",
      href: SHORTCUT_HREFS.newContact,
    });
  }
  if (can(PERMISSIONS.DEALS_CREATE)) {
    items.push({
      kind: "command",
      id: "cmd:new-deal",
      group: "Quick Actions",
      label: "New Deal",
      href: SHORTCUT_HREFS.newDeal,
    });
  }
  if (can(PERMISSIONS.TASKS_CREATE)) {
    items.push({
      kind: "command",
      id: "cmd:new-task",
      group: "Quick Actions",
      label: "New Task",
      href: SHORTCUT_HREFS.newTask,
    });
  }
  items.push({
    kind: "command",
    id: "cmd:dashboard",
    group: "Navigation",
    label: "Dashboard",
    href: SHORTCUT_HREFS.dashboard,
  });
  if (can(PERMISSIONS.CONTACTS_READ)) {
    items.push({
      kind: "command",
      id: "cmd:contacts",
      group: "Navigation",
      label: "Contacts",
      href: SHORTCUT_HREFS.contacts,
    });
  }
  if (can(PERMISSIONS.PIPELINE_READ)) {
    items.push({
      kind: "command",
      id: "cmd:pipeline",
      group: "Navigation",
      label: "Pipeline",
      href: SHORTCUT_HREFS.pipeline,
    });
  }
  if (can(PERMISSIONS.ANALYTICS_READ)) {
    items.push({
      kind: "command",
      id: "cmd:analytics",
      group: "Navigation",
      label: "Analytics",
      href: SHORTCUT_HREFS.analytics,
    });
  }
  items.push({
    kind: "command",
    id: "cmd:shortcuts",
    group: "Keyboard Shortcuts",
    label: "Keyboard Shortcuts",
    action: "help",
  });
  return items;
}

export function groupPaletteItems(items: PaletteItem[]) {
  const groups: Array<{ label: string; items: PaletteItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.label === item.group) last.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }
  return groups;
}
