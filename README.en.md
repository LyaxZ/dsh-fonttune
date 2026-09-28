# dsh-fonttune

> [中文](README.md) | **English**

**Font plugin for DeepSeek Harness (DSH)**: the **conversation** (markdown prose) gets full typographic control — font, size, line height, weight; the **interface** (settings sheet, sidebars, workspace, buttons) takes a font and a weight and **follows the conversation by default**; **code** stays its own axis with ligature and feature switches; and whole setups can be saved as **presets**. Everything lives in the native card under **Settings → Plugins → Plugin configuration** (collapsed sections with summaries) and applies immediately.

## Features

- **Three typography sets** — the conversation (markdown paragraphs, tables, headings) comes first and owns every axis; the interface (settings sheet, sidebars, workspace, headings and buttons) offers **a font and a weight** and follows the conversation by default (switchable); code stays its own axis
- **Interface / conversation / code fonts** — three independent fallback lists, Latin families first and CJK after; leaving one empty keeps DSH's own stack untouched
- **Font-size offsets** — the **conversation** takes -3 ~ +6 px on top of DSH's own "conversation font size" (the official value is the base), moving paragraphs, headings and line heights together — and it is applied **once, at the source** (H1/H2/H3 all derive from the same delta, so the hierarchy holds at any offset and no heading comes out smaller than expected); code is its own axis at -3 ~ +6 px. **The interface has no size axis**: verified against DSH, the settings sheet, sidebars and workspace size their text in upstream CSS, and the only official size hook is the conversation one
- **Font-weight offsets** — the **conversation**, the **interface** and **code** all take the same **relative offset** (-100 ~ +200, unset reads 0 and the readout is signed): the offset is added to each element's **own** weight, so the heading hierarchy DSH ships (h1~h3 700, h4~h6 and bold 600, table head 500, body 400) survives in both directions — headings stay clearly bolder than body text at any setting, and bold text inside a code surface stays bold. The interface offset is one rule over `body` plus an element table, with the whole conversation markdown subtree excluded: measured against computed styles on a live page, it takes every interface text element to the target and moves nothing inside the markdown subtree, so **changing the interface weight never touches the conversation**. The slider **counts steps**: the readout is the step count (for example `-1 0 +1`) and **the font decides how many there are** — the card measures how many distinct weights the chosen family can render for body text and for bold text, so one step is one pair of neighbouring faces and the range ends where those two stop swapping faces (the heading layer stops once it is at its boldest) — every notch is a visible change and the numbers stay small. What is stored is still a weight offset (older values are converted), so changing the font never breaks a setting; a family with only regular and bold offers three positions in total, and continuous control needs a family with more weights or a variable font
- **Line heights** — the **conversation** uses a ratio (100% ~ 160%), code an additive offset (-4 ~ +8 px); the interface has no line-height axis, for the same reason as size
- **Code ligatures** — a three-mode switch (default / on / off; browsers enable them by default, turning them off restores `=>` and `!=` as plain characters), plus an advanced `font-feature-settings` value field
- **Refuse synthetic styles** (off by default, i.e. synthesis is allowed) — turning it on stops the browser from faking italic and bold for CJK faces, which have neither, so marked text stays upright; left off, the browser synthesises by its own rules, which at least gives a visible "bold" step for a family with no bold face
- **The interface-follows-conversation switch** — a "Follows the conversation" switch at the top of the interface section (on by default): on, the interface takes the conversation's **font and weight** and its own two controls stay hidden; off, it uses its own font and weight, independent of the conversation. Size and line height belong to the conversation only (the interface has no hooks for them)
- **Presets** — a dropdown select right under the edit mode: five built-in presets out of the box, pick one to apply it; with a preset selected every change auto-saves into it, and "Rename / Export / Import" manage the list (export as JSON, import-merge a paste). When the clipboard is unavailable (a non-secure context, or no clipboard permission) the export does not print a truncated message: the whole JSON goes into a selected, read-only box, so the copy shortcut works, and the box puts itself away once copied. A settings write the document **refuses** is reported on the same row instead of leaving the control quietly showing the old value
- **West / CJK split (simple mode)** — an edit-mode switch: simple mode gives just a Western and a CJK single-pick slot per set, advanced mode is the full stack editor; both views share one stack, so toggling never changes the order you set up
- **Font picker panel** — four curated groups (monospace / CJK / Latin / generic), always listed — while searching and even when enumeration fails — plus an "installed on this machine" group on Chromium that lists only what the curated groups do not, so no family is ever offered twice. A name that is not in the list can be created with "use xxx". A refused font permission is retried after a while, so granting it in the browser and reopening the panel fills the list in
- **Drag to reorder** — picked fonts are draggable chips with earlier/later buttons too (keyboard and touch friendly)
- **Per-section previews** — expanding the conversation / interface / code section ends with that section's own preview box, rendering just that part with the current configuration

## Compatibility

**One package serves three host lines** — 0.1.5-rc.3 (the floor), 0.1.7-alpha.1 / alpha.2 and 0.1.7-rc.1 / rc.2 — and the install is the same on any of them: all three were verified for "the settings card opens, the stylesheet really reaches the page, and a change made in the card is written through".

| Plugin version | Supported DSH versions |
| --- | --- |
| **0.3.1** (latest) | 0.1.5-rc.3, 0.1.7-alpha.1 / alpha.2, 0.1.7-rc.1 / rc.2 |
| 0.3.0 | 0.1.5-rc.3, 0.1.7-alpha.1 / alpha.2, 0.1.7-rc.1 / rc.2 |
| 0.2.7 | 0.1.5-rc.3, 0.1.7-alpha.1 / alpha.2, 0.1.7-rc.1 / rc.2 |
| 0.2.6 | 0.1.5-rc.3, 0.1.7-alpha.1 / alpha.2, 0.1.7-rc.1 |
| 0.2.5 | 0.1.5-rc.1 / rc.2 / rc.3, 0.1.7-alpha.1 / alpha.2 |
| 0.2.4 | 0.1.5-rc.1 / rc.2 / rc.3, 0.1.7-alpha.1 / alpha.2 |
| 0.2.3 | 0.1.5-rc.2 |
| 0.2.2 | 0.1.5-rc.2 |
| 0.2.1 | 0.1.5-rc.2 |
| 0.2.0 | 0.1.5-rc.2 |

`engines.dsh` is declared as **`>=0.1.5-rc.3 <0.1.7-0 || >=0.1.7-alpha.1 <0.3.0-0`** (a prerelease needs its own branch: node-semver admits one only when some comparator in the range sits on that version's exact `major.minor.patch` tuple and carries a prerelease tag of its own, so a plain `>=0.1.5-rc.3` never matches `0.1.7-alpha.1`). Every difference between the lines is settled at runtime rather than by version number:

- **The settings service**: up to 0.1.5-rc.x it is `settingsScope.bind({namespace})` (by namespace); 0.1.7-alpha.x and 0.1.7-rc.x use `configForms.get(<profile entry id>)` (by entry id, which the installing profile decides — so the plugin claims the form whose served schema names its own fields). Both expose the same `getSnapshot`/`subscribe`/`set`/`unset` face, so one implementation covers them.
- **The loader row id IS the settings key**: from 0.1.7-rc.1 on, settings are stored per entry id, and the first start imports the removed `settings.yaml` by matching section names against it — so the row id this package ships equals its settings namespace (`dsh-fonttune`). That same id also lets the package be installed through the profile's `dsh.profile.bundles`: the plugin manager then shows it as running while the configuration page stays reachable.
- **The configuration card's seat**: 0.1.5-rc.x has a keyed cell under Settings → Plugins → Plugin configuration (`settings.plugin.item`); the 0.1.7 lines dropped that slot and instead contribute an entry to the Plugins page's official list (`plugins.item`, which is how the built-in settings pages are added there), plus a per-package page for a profile that installed this plugin as a bundle (`plugins.bundle.config`). All three are registered; the one a host never declares is inert. On those pages the card **starts open** — opening the entry is the expansion gesture, and asking for a second click is exactly what this release removed.
- **The host half's config values**: once the alpha marks the schema `.volatile()`, the fields the host half receives are cosmokit volatile references (`{get(),[write]}`) rather than plain values, which left the first-frame stylesheet row empty; the references are unwrapped before use.
- **`inject` declares only services all three lines have** (`slots`, `locale`): declaring one a host does not provide parks the whole package — on the alpha a declared `settingsScope` kept the entire Web UI from booting. The settings service is looked up with `ctx.get(name)` instead.
- **The 0.1.7 form is addressed by entry id**: while the host's `describe()` view has not arrived, the plugin does not guess a name (a wrong guess means every write is refused) — it stands in with a pending scope, adopts the real form as soon as the view is served, and re-reads immediately.

The market entry also states these requirements (`engines.dsh`, `dsh.compatibility.dshReleases` and `peerDependencies` in `package.json`), so the host a version needs can be checked before installing.

## Install

Install through the DSH CLI:

```
dsh plugin --profile web add dsh-fonttune
```

From GitHub:

```
dsh plugin --profile web add github:LyaxZ/dsh-fonttune
```

Or from a local directory:

```
dsh plugin --profile web add <plugin directory>
```

Restart DSH once afterwards and open the Web UI; changing settings needs no restart after that.

## Usage

- **Open the settings** — Settings → Plugins → Plugin configuration → expand the "Font tune" card
- **Section navigation** — top to bottom: edit mode, presets, then the three collapsed sections **conversation → interface → code** (the conversation leads because it owns every axis), with "refuse synthetic styles" flat below them; each title row carries a summary of the current values with the chevron pinned to the far right, and at most one section is open at a time
- **Pick fonts** — in simple mode click the Western/CJK slots; in advanced mode use "Add font" and the chip editor to maintain the full fallback list
- **Tune size / weight / line height** — each slider sits inside its own section; drag and release to apply (the readout keeps its unit while dragging). Changed fields are marked and can be reset individually, with "Reset all" at the bottom of the card
- **The conversation leads** — the conversation section sets font, size, line height and weight; the interface section shows a single "Follows the conversation" row by default, and its own font and weight controls appear once that is switched off
- **Switching following off never jumps** — the moment the switch goes off, the interface writes the font and weight offset it was **already showing** into its own fields (that is what it was following), so nothing changes on screen and the sliders continue from there; an axis the conversation does not set clears the interface's own field instead, keeping DSH's default. "Reset" on that field goes back to DSH's own weight (all three weight offsets return to 0)
- **The interface weight cannot reach the conversation** — it is the one axis that has to cover the whole page (DSH pins its small labels' weights in upstream class rules, which nothing narrower can reach), so it is implemented as a rule with the **whole conversation markdown subtree excluded**: paragraphs, headings and bold text in the conversation are untouched
- **Weight readouts** — all three weight axes read 0 when unset (the slider sits in the middle); no "unset" wording appears anywhere, and an absolute weight stored by an older version (300 ~ 600) is converted to its equivalent offset on read (400 → 0, 450 → +50), so nothing has to be set again
- **The weight slider counts steps** — the card measures how many distinct weights the current family can render for body text and for bold text, one step being one pair of neighbouring faces, and the range ending where those two stop swapping faces (the readout is the step count, e.g. `-2 … +2`), so every notch is a visible change and the numbers stay small; changing the family re-measures it
- **Presets** — the dropdown select below the edit mode (默认配置 1 ~ 5, with the card's own chevron inside the box); picking one switches and auto-saves the edits that follow. "Rename" renames the current preset, "Export" copies JSON and "Import" merges a paste. Operation results ("copied to the clipboard") appear on the **right** of the row below and fade out by themselves after about 2.6 s, without moving any layout
- **Preview** — expanding the conversation / interface / code section ends with that section's own preview box, rendering just that part
- Settings are stored in DSH's settings document (the profile's `cordis.patch.yml` from 0.1.7 on, `settings.yaml` before that), so they travel with the profile

## Development

- `src/shared.cjs` — pure-function core: family sanitizing and parsing, configuration normalization, generated stylesheet
- `src/index.mjs` — host half: registers the `dsh-fonttune` settings namespace (schemastery schema with length and range validation) and ships a **stamped** `<style>` into the served index through `webserver/index-inject`, so the first paint already uses the saved values; the browser half then **adopts and keeps that element** (there is only ever one copy of the stylesheet, so rules can be added *and* removed)
- `src/client.js` — browser half: the settings card, the font picker panel, font enumeration and style injection
- `build.mjs` — zero-dependency build: inlines the shared core, wraps the bundle in the `window.__ModuleLoader__.load({id, factory})` shell, copies the host half, and enforces that the client bundle only requires shell-held modules
- `test/run.mjs` — offline checks (hand-built DOM / cordis / settings-surface doubles, the real schemastery schema, CSS generation and injection, sanitizer adversarial cases, dictionary key parity, the picker's grouping rules, the token-refresh power gate); `test/render-card.mjs` renders the card component through a mini React hooks runtime (including forced-open and forced-state renders, covering the 0.1.0 release-blocking crash class), fires **every control's callback** (an unwired handler only fails when someone actually clicks it) and **renders a second time** to cover a hook order that changes with state; `test/artifacts.mjs` proves `lib/` matches the current `src/` byte for byte (`npm run verify` runs all three). The devDependency is the **newest** schemastery (`^3.18.4`) — the alpha's dialect, whose `.volatile()` makes a resolved field a **reference** rather than a value — so these suites read values through the `plainConfigValue` the host half exports, the same path the plugin takes; at runtime the **host's own copy** is used (3.18.2 on rc.2 / rc.3, with no such modifier, a shape the live probe covers)
- Checks that need a real page run through `npm run verify:browser -- "<url-with-token>"` (start a managed instance first: `dsh web --port 0 --no-open` prints the URL). The default group is read-only (`browser-probe` / `ui-walk` / `host-line-probe` / `style-verify`); `--writers` adds the scripts that **write the settings namespace** (`slider-walk` / `split-walk` / `split-verify` / `weight-verify`, each snapshots the user layer first and restores it before exiting), and `--only a,b` picks a subset. Every script's exit code is its verdict; `test/set-user-layer.mjs <url> '<json>'` puts the layer back after an interrupted run
- `test/host-line-probe.mjs` is the **host-line-independent** check: it asserts only what must hold on every supported line — the page boots without errors, the plugin owns exactly ONE stylesheet element, the settings really reach the document (`DFP_EXPECT_FAMILY` / `DFP_EXPECT_WEIGHT` also assert the computed values when set), the configuration card is reachable from the settings sheet and renders (`.dfp-card`, whichever seat that line declares), and changing a control there really writes through. Run it first after switching host lines (rc ↔ alpha); set `DFP_PROBE=1` when debugging "the card's writes do not stick on the alpha" — the plugin then logs one `[dfp-probe]` line (which namespaces are served, which one was claimed, and what state the seat is in)
- `test/weight-verify.mjs` measures all three weight axes (interface / conversation / code) in a live page, including that there is only one stylesheet element and that switching following off drops the followed offset without a reload, and it asserts the **conversation ladder level by level** (at +180 and at −100, h2 > strong > body text, each group equal to its own base plus the offset); `test/split-verify.mjs` measures the conversation and code size axes plus the **retired interface size axis moving nothing**, and uses an h1~h4 probe to prove **every heading level takes the offset exactly once** (±3, with `h1 > h2 > h3 ≥ h4`); `test/slider-walk.mjs` and `test/split-walk.mjs` drive the real card (a drag writes nothing, a release does; the simple-mode slots and the whole stack round-trip); the market-entry tooling is `test/market-pr.mjs` (status / update / refresh / reopen / open / about) and the diagnostic `test/market-inspect.mjs` (PR state, comments, CI and branch diff)
- `docs/` — the 0.2.0 [research](docs/research-0.2.0.md) and [specification](docs/spec-0.2.0.md) records (written during design, with the trade-offs of that moment; where they differ from what shipped, README/CHANGELOG win — see the note at the top of each). **Not part of the npm `files` list, so they are not published**
- The client bundle may only require modules from the shell's static table (`react`, `react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-*`…); `dsh.client.inject` declares load order, not require permission
- Build before refreshing: `node build.mjs` (or `npm run watch`) turns `src/` into `lib/`, and the browser loads `lib/` — editing `src/client.js` without building leaves the page on the previous bundle. `npm test` only checks behaviour; `node test/artifacts.mjs` (part of `npm run verify`) proves the committed `lib/` is byte-for-byte what the current `src/` produces. Editing the host half (`src/index.mjs`) or `cordis.patch.yml` needs a DSH restart

## License

MIT © 2026 LyaxZ
