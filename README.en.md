# dsh-fonttune

> [中文](README.md) | **English**

**Font plugin for DeepSeek Harness (DSH)**: the **conversation** (markdown prose) gets full typographic control — font, size, line height, weight; the **interface** (settings sheet, sidebars, workspace, buttons) keeps a font and **follows the conversation by default**; **code** stays its own axis with ligature and feature switches; and whole setups can be saved as **presets**. Everything lives in the native card under **Settings → Plugins → Plugin configuration** (collapsed sections with summaries) and applies immediately.

## Features

- **Three typography sets** — the conversation (markdown paragraphs, tables, headings) comes first and owns every axis; the interface (settings sheet, sidebars, workspace, headings and buttons) offers **a font only** and follows the conversation by default (switchable); code stays its own axis
- **Interface / conversation / code fonts** — three independent fallback lists, Latin families first and CJK after; leaving one empty keeps DSH's own stack untouched
- **Font-size offsets** — the **conversation** takes -3 ~ +6 px on top of DSH's own "conversation font size" (the official value is the base), moving paragraphs, headings and line heights together; code is its own axis at -3 ~ +6 px. **The interface has no size axis**: verified against DSH, the settings sheet, sidebars and workspace size their text in upstream CSS, and the only official size hook is the conversation one
- **Font weights** — the **conversation** and **code** each take any integer from 300 to 600 (unset reads 400 in the UI). The interface weight axis is gone: a weight can only be expressed as a `body, body *` rule, which cannot avoid reaching the conversation, so the weight belongs to the conversation alone
- **Line heights** — the **conversation** uses a ratio (100% ~ 160%), code an additive offset (-4 ~ +8 px); the interface has no line-height axis either, for the same reason as size
- **Code ligatures** — a three-mode switch (default / on / off; browsers enable them by default, turning them off restores `=>` and `!=` as plain characters), plus an advanced `font-feature-settings` value field
- **Refuse synthetic styles** — stops the browser from faking italic and bold for CJK faces, which have neither, so marked text stays upright
- **The interface-follows-conversation switch** — a "Follows the conversation" switch at the top of the interface section (on by default): on, the interface takes the conversation's font and its own font control stays hidden; off, the interface can set its own font. Weight, size and line height belong to the conversation only (the interface has no hooks for them)
- **Presets** — a dropdown select right under the edit mode: five built-in presets out of the box, pick one to apply it; with a preset selected every change auto-saves into it, and "Rename / Export / Import" manage the list (export as JSON, import-merge a paste)
- **West / CJK split (simple mode)** — an edit-mode switch: simple mode gives just a Western and a CJK single-pick slot per set, advanced mode is the full stack editor; both views share one stack, so toggling never changes the order you set up
- **Font picker panel** — four preset groups (monospace / CJK / Latin / generic), plus an "installed on this machine" group on Chromium; a name that is not in the list can be created with "use xxx"
- **Drag to reorder** — picked fonts are draggable chips with earlier/later buttons too (keyboard and touch friendly)
- **Per-section previews** — expanding the conversation / interface / code section ends with that section's own preview box, rendering just that part with the current configuration

## Compatibility

| Plugin version | Supported DSH versions |
| --- | --- |
| **0.2.0** (latest) | 0.1.5-rc.2 |

`engines.dsh` requires **0.1.5-rc.2** or newer, and the compatibility declaration lists only the **latest release of the 0.1.5 line**: it carries every fix in that line, which makes it the most stable build of the major version, while older builds of the same major version stay compatible per semantic versioning. Earlier or newer DSH versions are untested and not declared. On install or update, the DSH market runs a host-compatibility preflight against `engines.dsh`, `dsh.compatibility.dshReleases` and `peerDependencies` in `package.json`.

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
- **The conversation leads** — the conversation section sets font, size, line height and weight; the interface section shows a single "Follows the conversation" row by default, and its own font control appears once that is switched off
- **Weight readouts** — an unset weight reads 400 (DSH's own body weight, which is where the slider sits); no "unset" wording appears anywhere
- **Presets** — the dropdown select below the edit mode (默认配置 1 ~ 5, with the card's own chevron inside the box); picking one switches and auto-saves the edits that follow. "Rename" renames the current preset, "Export" copies JSON and "Import" merges a paste. Operation results ("copied to the clipboard") appear on the **right** of the row below and fade out by themselves after about 2.6 s, without moving any layout
- **Preview** — expanding the conversation / interface / code section ends with that section's own preview box, rendering just that part
- Settings are stored in DSH's settings document (`settings.yaml`), so they travel with your configuration

## Development

- `src/shared.cjs` — pure-function core: family sanitizing and parsing, configuration normalization, generated stylesheet
- `src/index.mjs` — host half: registers the `dsh-fonttune` settings namespace (schemastery schema with length and range validation) and ships the saved declarations into the served index through `webserver/index-inject`, so the first paint already uses them
- `src/client.js` — browser half: the settings card, the font picker panel, font enumeration and style injection
- `build.mjs` — zero-dependency build: inlines the shared core, wraps the bundle in the `window.__ModuleLoader__.load({id, factory})` shell, copies the host half, and enforces that the client bundle only requires shell-held modules
- `test/run.mjs` — offline checks (hand-built DOM / cordis / settings-surface doubles, the real schemastery schema, CSS generation and injection, sanitizer adversarial cases, dictionary key parity); `test/render-card.mjs` renders the card component through a mini React hooks runtime (including forced-open and forced-state renders, covering the 0.1.0 release-blocking crash class); `test/` also holds headless-browser walk scripts plus the market-entry tooling — `test/market-pr.mjs` (status / update / refresh / reopen / open) and the diagnostic `test/market-inspect.mjs` (PR state, comments, CI and branch diff)
- `docs/` — the 0.2.0 [research](docs/research-0.2.0.md) and [specification](docs/spec-0.2.0.md) records (written during design, with the trade-offs of that moment; where they differ from what shipped, README/CHANGELOG win — see the note at the top of each). **Not part of the npm `files` list, so they are not published**
- The client bundle may only require modules from the shell's static table (`react`, `react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-*`…); `dsh.client.inject` declares load order, not require permission
- Editing `src/client.js` is enough after a page refresh (client modules are versioned by content hash and DSH's client HMR pushes reloads); editing the host half (`src/index.mjs`) or `cordis.patch.yml` needs a DSH restart

## License

MIT © 2026 LyaxZ
