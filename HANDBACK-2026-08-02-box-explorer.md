# Handback — Inventory Box Explorer (2026-08-02)

## Task status

| Task | Status | Notes |
| --- | --- | --- |
| Task 0 — verify the code repoint | Already done | Commit `d9bac8a` had already repointed `/api/contents` to `items` (`type='item'`) + `item_categories`. Nothing in the app reads a dropped table. |
| Task 1 — box explorer at `/inventory` | Done | Static explorer, animations, URL sync and the mobile breakpoint all shipped together. |
| Preserve the Audit view | Done, not in the brief | The brief said `/inventory` was a stats + flat list page. It wasn't — it was the Audit view. Moved to `/audit` rather than deleted. See below. |

## The one real deviation: `/inventory` was not what the brief described

The brief said to replace a "stats + filter pills + flat list" page. That page no longer existed — `/inventory`
had been rebuilt as the **Audit view** (stale nudges, unassigned containers, empty locations, tagging progress)
in commit `adb2d81`, a week before this brief was written.

The brief also says the audit view is out of scope but should not be foreclosed: "a future tab/route can coexist."
Deleting shipped, working functionality is not reversible from the brief's wording alone, so:

- `/inventory` is now the box explorer (the brief's clear intent — this is the tab the logo and the scan page land on).
- The Audit view moved **unchanged** to `/audit`.
- The tab row on all three pages is now **Explore · Audit · Tools**. The Tools tab's first button used to read
  "Shop hierarchy" and point at `/inventory`; it now reads "Explore".

If you actually wanted the Audit view gone, deleting `pages/audit.js` and its two tab buttons is a clean revert.

## What shipped

**New:** [pages/inventory.js](pages/inventory.js) — the explorer. **Moved:** `pages/inventory.js` → [pages/audit.js](pages/audit.js).
**Touched:** [styles/globals.css](styles/globals.css) (explorer styles + keyframes), [lib/icons.js](lib/icons.js) (`IconDoor`),
[pages/contents.js](pages/contents.js) (tab row), [pages/api/contents.js](pages/api/contents.js) (stale comment only, no behavior change).

Built to spec: one level at a time, everything is a clickable box, clickable breadcrumbs with a bolded
non-clickable current segment, one-level-only previews (nested containers as mini-rows with "· N inside",
tools as pills, "Empty" when childless), short item cards with comma-joined category sublines, the
`balancedCols` algorithm verbatim, the three keyframes verbatim, 0.06s stagger capped at index 8,
`animating` guard, `prefers-reduced-motion` support, and `/inventory?at=<id>` URL sync that survives
deep links and the back button. Item boxes hand off to the existing `/entry?id=<id>` page.

Where it differs from the brief's wording, and why:

- **Top level is "everything with no parent," not "the 5 locations."** Only 4 of the 5 locations are actually
  top-level (see data notes), and one container has no parent. Deriving roots as "no parent, or a `parent_id`
  pointing at a row that doesn't exist" gives 4 rooms + 1 stray container = 5 boxes, and guarantees no row
  is unreachable in the explorer. The brief's fallback ("all locations if that yields zero") would have
  hidden the stray container permanently.
- **Previews are capped at 3 nested containers + 4 tool pills, then "+N more."** Not specified in the brief.
  Without a cap, a room with 15 containers renders a card several times taller than its neighbours and the
  grid stops reading as a grid. Depth is still exactly one level, as decided.
- **The explorer page is 720px wide on desktop; every other page stays at 480px** (`.page-wide`). Four columns
  inside the shared 480px container gave ~100px cards, too narrow for a name plus a preview. No effect on mobile.
- **Desktop/phone breakpoint is 620px**, chosen so a phone in landscape still gets the 2-column layout.
- **Item pills got a 0.5px border.** In light mode `--purple-bg` on a room card's `--blue-bg` is nearly the
  same value and the pills disappeared.
- **Tools are leaves.** A tool with children is not something this data models, so item boxes always navigate
  to `/entry` rather than drilling.

## Discovered along the way (not fixed, worth knowing)

1. **App-wide hang after repeated client-side navigation.** After several navigations within one tab, every
   page sticks on "Loading…" *and* the top bar disappears — which means `supabase.auth.getSession()` never
   resolved, since `_app.js` gates the top bar on it and `lib/apiFetch.js` awaits it on every single API call.
   Reproduced on `/audit` (untouched pre-existing code), so this is **not** from this change, but it is a real
   bug on a phone-first app: one wedged `getSession()` takes down every page at once. Likely the navigator
   LockManager contention in `@supabase/supabase-js` 2.43.1. Worth a look before the next feature.
2. **The Audit view's item filter is now based on a false premise.** Its comment claimed `type='item'` rows were
   frozen leftovers from a partial migration and that tools "are still actually read/written via the separate
   `contents` table." Post-unification those rows *are* the real tools. I corrected the comment but left the
   behavior alone — whether tools should appear in the stale/recently-added feeds is a product decision, not a
   bug fix. Same for `/api/contents`'s header comment, which claimed the `contents` table still existed.
3. **Data:** `White Bookshelf 1` is `type='location'` parented to `Living Room`, so "the 5 rooms" is really
   4 rooms and a nested location. It renders as a room-styled box one level in, which looks correct.
4. **Data:** there is a container with id `test`, name `"Test "` (trailing space), no parent and no children.
   It shows up as a fifth box at the top level. Probably junk from testing — I did not delete it.
5. `/api/items?id=<id>` deliberately excludes `type='item'` children. The explorer doesn't use that path
   (it builds the tree from the unfiltered list endpoint), but anything else reading it sees containers only.

## Where things live

- Branch `master`, commit `7be67a8` ("Replace /inventory with a spatial box explorer, move Audit to /audit"),
  plus a follow-up commit for this note and the stale API comment. Pushed to `cmcgarr1/workshop-nfc`.
- No schema changes, no new env vars, no new dependencies. `OWNER_USER_ID` public-read logic untouched;
  the explorer reads through the same `apiFetch` path, so signed-out visitors get the read-only view.
- Verified against the live DB (79 rows: 5 locations, 39 containers, 35 items) — matches the brief's numbers.

## Suggested first step for whoever picks this up

Open `https://workshop-nfc.vercel.app/inventory` on a phone and drill from a room to a tool. The layout and
the animation were verified at a 375px viewport in a desktop browser, not on real hardware — the specific
thing to watch for is whether the 0.45s rise-in with the 0.06s stagger still feels quick enough on a phone
after an NFC scan, since that is the app's dominant entry path. If it drags, lower `STAGGER_CAP` in
`pages/inventory.js` before touching the keyframes.
