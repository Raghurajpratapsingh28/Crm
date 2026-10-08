import { PERMISSIONS, type GlobalSearchResponse } from "@crm/types";
import { describe, expect, it } from "vitest";
import { commandItems, flattenSearchResults, groupPaletteItems } from "./search";

const results: GlobalSearchResponse = {
  query: "john",
  total: 3,
  results: {
    contacts: [{ id: "c1", type: "contact", title: "John Doe", subtitle: "john@x.test", href: "/contacts/c1", relevance: 1 }],
    companies: [{ id: "co1", type: "company", title: "Johnson Labs", subtitle: "Software", href: "/companies/co1", relevance: 2 }],
    deals: [],
    activities: [{ id: "a1", type: "activity", title: "Follow-up call", href: "/activities/a1", relevance: 3 }],
  },
};

describe("search palette helpers", () => {
  it("flattens grouped results across categories", () => {
    const items = flattenSearchResults(results);
    expect(items.map((item) => item.id)).toEqual(["contact:c1", "company:co1", "activity:a1"]);
    expect(groupPaletteItems(items).map((group) => group.label)).toEqual(["Contacts", "Companies", "Activities"]);
  });

  it("hides commands the user cannot perform", () => {
    const none = commandItems(() => false);
    expect(none.some((item) => item.label === "New Contact")).toBe(false);
    expect(none.some((item) => item.label === "Dashboard")).toBe(true);
    const all = commandItems(() => true);
    expect(all.some((item) => item.label === "New Task")).toBe(true);
    const member = commandItems((permission) => permission !== PERMISSIONS.TASKS_CREATE);
    expect(member.some((item) => item.label === "New Task")).toBe(false);
  });
});
