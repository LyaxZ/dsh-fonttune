# dsh-fonttune

> [中文](README.md) | **English**

**Font plugin for DeepSeek Harness (DSH)**: set the body and code font families, a global font-size offset and a global font weight, and pick fonts per **Western / CJK** slot. Everything lives in the native card under **Settings → Plugins → Plugin configuration** and applies immediately.

## Features

- **Body / code fonts** — two independent fallback lists, Latin families first and CJK after; leaving one empty keeps DSH's own stack untouched
- **Global font-size offset** — -3 ~ +6 px, stacked on top of DSH's own font-size setting rather than replacing it; every size step scales together with its line height
- **Global font weight** — any integer from 300 to 600; unset or 400 both mean "keep DSH's own weight"
- **West / CJK split (simple mode)** — a switch at the top of the card: simple mode gives just a Western and a CJK single-pick slot (one pair for body, one for code), advanced mode is the full stack editor; both views share one stack, so toggling never changes the order you set up
- **Font picker panel** — four preset groups (monospace / CJK / Latin / generic), plus an "installed on this machine" group on Chromium; a name that is not in the list can be created with "use xxx"
- **Drag to reorder** — selected families are a chip list you can drag, with earlier / later buttons kept for keyboard and touch
- **Live preview** — a mixed Chinese/English line and a code line, rendered from the current configuration

## Compatibility

| Plugin version | Supported DSH versions |
| --- | --- |
| **0.1.3** (latest) | 0.1.5-rc.2 |

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
- **Pick fonts** — in simple mode click the four slots (Body · Western, Body · CJK, Code · Western, Code · CJK); in advanced mode use "Add font" and the chip editor to maintain the full fallback list
- **Tune numbers** — drag the size-offset / weight sliders; the value applies on release. Changed fields are marked and can be reset individually, with "Reset all" at the bottom of the card
- **Preview** — the mixed-script and code preview at the bottom of the card renders with the current configuration
- Settings are stored in DSH's settings document (`settings.yaml`), so they travel with your configuration

## Development

- `src/shared.cjs` — pure-function core: family sanitizing and parsing, configuration normalization, generated stylesheet
- `src/index.mjs` — host half: registers the `dsh-fonttune` settings namespace (schemastery schema with length and range validation) and ships the saved declarations into the served index through `webserver/index-inject`, so the first paint already uses them
- `src/client.js` — browser half: the settings card, the font picker panel, font enumeration and style injection
- `build.mjs` — zero-dependency build: inlines the shared core, wraps the bundle in the `window.__ModuleLoader__.load({id, factory})` shell, copies the host half, and enforces that the client bundle only requires shell-held modules
- `test/run.mjs` — offline checks (hand-built DOM / cordis / settings-surface doubles, the real schemastery schema, CSS generation and injection, sanitizer adversarial cases, dictionary key parity); `test/` also holds headless-browser walk scripts that verify the card and its interactions in a real page
- The client bundle may only require modules from the shell's static table (`react`, `react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-*`…); `dsh.client.inject` declares load order, not require permission
- Editing `src/client.js` is enough after a page refresh (client modules are versioned by content hash and DSH's client HMR pushes reloads); editing the host half (`src/index.mjs`) or `cordis.patch.yml` needs a DSH restart

## License

MIT © 2026 LyaxZ
