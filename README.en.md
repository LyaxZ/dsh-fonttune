# dsh-fonttune

A font enhancement plugin for the DeepSeek Harness (DSH) Web GUI: **UI & code font families + a global font-size offset + a global font weight**, configured from **Settings → Plugins → Plugin configuration** (a native settings card). Every change applies immediately — no reload.

中文文档：[README.md](README.md)

## Why it is not a client-only plugin

The design doc originally planned a client-only plugin with localStorage. In practice it became a **dual-half (host + client)** plugin, for three verified reasons:

| Client-only | Dual-half (this plugin) |
| --- | --- |
| The card can never render — the `settings.plugin.item` slot is dispatched by the settings namespace **registered on the host**; without the host half there is no key | The card appears in the native plugin configuration page; save/reset go through DSH's own settings document |
| First paint flashes the default fonts (client plugins load asynchronously) | The host half listens on `webserver/index-inject` and injects the same declarations into the served index `<head>` — **the first paint is already correct** |
| Settings live in localStorage only (cleared with the cache) | Settings live in the Host settings document (`settings.yaml`) |

The doc's worry that a host half forces a restart does not hold: the web profile runs with `patchReload: "live"`. Only the install itself needs one restart (to place the package into the profile).

## Install

```powershell
# from npm (after publishing)
dsh plugin --profile web add dsh-fonttune

# local development: junction into this folder and add
#   - id: fonttune / name: dsh-fonttune  to profiles\web\cordis.patch.yml
dsh plugin --profile web add link:F:\deepseek harness\dsh-fonttune
```

Restart DSH once after installing; after that, changing settings needs no restart.

## The four axes

| Axis | Range | Default | Notes |
| --- | --- | --- | --- |
| Body font (`sans`) | Arbitrary fallback list | empty = untouched | Latin families first, CJK after; empty keeps DSH's own stack |
| Code font (`mono`) | Same | empty = untouched | Applies to `pre/code/kbd/samp/var/tt/textarea` and CodeMirror editors |
| Font-size offset | -3 ~ +6 px | 0 = untouched | Uniform proportional rescale, stacks with DSH's own font-size setting |
| Font weight | 300 ~ 600, any integer | unset = untouched | 400 is DSH's own body weight and also counts as "untouched" |

Both number sliders are **commit-on-release**: dragging only updates a local value, and the write happens once on pointer/touch release (or keyboard/blur) — no recomputation per pixel.

### West / CJK split (simple / advanced mode)

The switch row at the top of the card (a label on the left, a segmented Simple/Advanced toggle on the right):

- **Simple mode** splits the stack into a Western and a CJK single-pick slot (one pair for body, one for code). It only manages the **front** of the stack: the Western slot replaces the first non-CJK entry in place; the CJK slot replaces the first CJK entry in place, or inserts right after the Western slot when none exists. Everything beyond the two slots keeps its order.
- **Advanced mode** is the full chip editor with drag-to-reorder.
- **Switching modes writes nothing** — both views share one stack, and your tuned order survives; the preference is stored in the browser.

The font picker ships with four preset groups (monospace / CJK / Latin / generic), adds "installed on this machine" via `queryLocalFonts()` on Chromium, and lets you create any name via "use xxx". Each row renders in its own font, with a mixed-script live preview below.

## How the size offset works

DSH does not have "one font size"; it generates a set of CSS custom properties at runtime — `--dsh-content-font-size` (written **inline on `body`** by the theme package) plus one `--dsw-font-*-font-size` / `-line-height` per design-system step. Writing `font-size: calc(1em + 2px)` would compound down the DOM tree, so this plugin instead **rescales every token by one ratio** (`(16 + offset) / 16`), with the base read live — so it stacks with DSH's own slider, and each step scales its own line-height along. The token list is discovered at runtime (stylesheet declarations → computed values → built-in fallback), so future DSH token changes are followed automatically.

## Safety

User-entered family names are sanitized with an allowlist (letters incl. CJK, digits, space, `.`, `,`, `_`, `-`); everything else is dropped and the whole name is quoted, so a name cannot close a declaration, start a rule, or reach `url()`. The host schema adds a `^[^{};<>\\]*$` pattern and a length cap on top.

## Development

```powershell
node build.mjs            # build lib/ (zero-dependency, no bundler)
node build.mjs --watch
node test/run.mjs         # 42 offline checks
```

The sources are plain JavaScript with **no build dependencies**: `src/shared.cjs` (pure-function core), `src/index.mjs` (host half), `src/client.js` (browser half). `build.mjs` inlines the core into the client bundle, wraps it in the `window.__ModuleLoader__.load({id, factory})` shell, copies the host half, and verifies the "only shell-held modules may be required" constraint.

## Compatibility

- DSH `0.1.5-rc.2` (declared in `dsh.compatibility.dshReleases`).
- Do not enable other plugins that also write the `body` font family at the same time; this plugin can fully replace them.

## License

MIT
