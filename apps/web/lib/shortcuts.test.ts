import { afterEach, describe, expect, it } from "vitest";
import { handleShortcutKey, isTypingTarget, nextIndex } from "./shortcuts";

function key(partial: Partial<Parameters<typeof handleShortcutKey>[0]> = {}) {
  return handleShortcutKey({
    key: "a",
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    typing: false,
    paletteOpen: false,
    helpOpen: false,
    prefix: null,
    ...partial,
  });
}

describe("isTypingTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("treats text fields as typing targets", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const textbox = document.createElement("div");
    textbox.setAttribute("role", "textbox");
    const button = document.createElement("button");
    document.body.append(input, textarea, select, editable, textbox, button);
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(textbox)).toBe(true);
    expect(isTypingTarget(button)).toBe(false);
  });
});

describe("handleShortcutKey", () => {
  it("opens search on / and help on ?", () => {
    expect(key({ key: "/" }).action).toBe("search");
    expect(key({ key: "?" }).action).toBe("help");
  });

  it("waits for a second key after N and G", () => {
    expect(key({ key: "n" })).toMatchObject({ prefix: "n", armLeadTimeout: true, action: null });
    expect(key({ key: "c", prefix: "n" }).action).toBe("newContact");
    expect(key({ key: "d", prefix: "n" }).action).toBe("newDeal");
    expect(key({ key: "t", prefix: "n" }).action).toBe("newTask");
    expect(key({ key: "d", prefix: "g" }).action).toBe("dashboard");
    expect(key({ key: "c", prefix: "g" }).action).toBe("contacts");
    expect(key({ key: "p", prefix: "g" }).action).toBe("pipeline");
    expect(key({ key: "a", prefix: "g" }).action).toBe("analytics");
  });

  it("ignores invalid sequences", () => {
    expect(key({ key: "x", prefix: "n" })).toMatchObject({ action: null, prefix: null });
    expect(key({ key: "x", prefix: "g" })).toMatchObject({ action: null, prefix: null });
  });

  it("does not fire while typing or when modifiers are held", () => {
    expect(key({ key: "/", typing: true }).action).toBeNull();
    expect(key({ key: "n", typing: true }).prefix).toBeNull();
    expect(key({ key: "g", typing: true }).action).toBeNull();
    expect(key({ key: "c", metaKey: true }).action).toBeNull();
    expect(key({ key: "v", ctrlKey: true }).action).toBeNull();
    expect(key({ key: "n", altKey: true }).prefix).toBeNull();
  });

  it("does not run app shortcuts while the palette is open", () => {
    expect(key({ key: "n", paletteOpen: true }).action).toBeNull();
    expect(key({ key: "/", paletteOpen: true }).action).toBeNull();
  });

  it("wraps selection", () => {
    expect(nextIndex(0, 3, -1)).toBe(2);
    expect(nextIndex(2, 3, 1)).toBe(0);
  });
});
