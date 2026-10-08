# Keyboard shortcuts

Shortcuts are registered in `apps/web/lib/shortcuts.ts` and handled by `CommandPaletteProvider` on authenticated app pages. Do not add `window` key listeners in feature pages for these actions.

Sequence timeout: **800ms**. Debounce for search queries: **200ms**.

## Shortcuts

### Navigation

| Keys | Action | Route | Permission |
|---|---|---|---|
| `G` then `D` | Dashboard | `/dashboard` | — |
| `G` then `C` | Contacts | `/contacts` | `contacts.read` |
| `G` then `P` | Pipeline | `/pipeline` | `pipeline.read` |
| `G` then `A` | Analytics | `/analytics` | `analytics.read` |

`G` alone does nothing. If the second key is not one of the above, the sequence is cancelled.

### Creation

| Keys | Action | Route | Permission |
|---|---|---|---|
| `N` then `C` | New Contact | `/contacts/new` | `contacts.create` |
| `N` then `D` | New Deal | `/deals/new` | `deals.create` |
| `N` then `T` | New Task | `/tasks?new=1` | `tasks.create` |
| `N` (held until timeout) | New Lead / Deal | `/deals/new` | `deals.create` |

There is no separate Lead entity. `N` opens deal creation (Lead is the first pipeline stage).

`N` does **not** navigate immediately. The handler waits 800ms for `C` / `D` / `T`. `N` then `X` cancels and does nothing.

### Search

| Keys | Action |
|---|---|
| `/` | Open global search |
| `?` | Keyboard shortcuts help |
| `↑` / `↓` | Move selection (wraps) |
| `Enter` | Open the selected result or command |
| `Esc` | Close the palette or help modal |

While the palette is open, application shortcuts (`G`, `N`, `/`) do not run. Arrow keys are handled by the combobox and do not scroll the page.

## Input suppression

Shortcuts do not run when focus is in:

- `input` (except button/checkbox/radio/submit-style inputs)
- `textarea`
- `select`
- `[contenteditable]`
- `[role="textbox"]`

Focusing a field also cancels an in-progress `N` / `G` sequence so a pending New Deal timeout cannot fire while the user types.

`Meta`, `Ctrl`, and `Alt` combinations never trigger these shortcuts (`Cmd+C`, `Ctrl+V`, `Cmd+F`, …).

## Command palette

Empty query: Quick Actions, Navigation, Keyboard Shortcuts. Actions the user cannot perform are omitted. Backend authorization still applies.

Results: grouped Contacts / Companies / Deals / Activities. Keyboard selection is a single flattened index. Hover updates the same selection. Enter navigates to `href` and closes the palette. Focus returns to the control that opened search.

Mobile: the Search button in the sidebar is the entry point. `/` is not required. Keyboard hint text (`.kbd-hint`) is hidden under 720px.

## Accessibility

The palette is a `role="dialog"` (existing `ConfirmDialog`) with a `combobox` input, `listbox`, and `option` rows. The active option uses `aria-selected` and `aria-activedescendant`. Selection is not color-only (background plus the selected announcement). Help is the same dialog primitive.

## Adding a shortcut

1. Add an id, keys, href, and optional permission to `SHORTCUT_REGISTRY` / `SHORTCUT_HREFS` / `SHORTCUT_PERMISSIONS`.
2. Teach `handleShortcutKey` the sequence (keep two-key prefixes on `n` and `g` unless you add a new prefix).
3. Cover it in `shortcuts.test.ts` and the command palette tests.
4. Update this file.

Do not attach a second global listener.
