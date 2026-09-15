# Changelog

All notable changes to **dsh-fonttune** are documented here. Chinese version: [CHANGELOG.md](CHANGELOG.md).

## [0.1.4] - 2026-09-15

### Added
- **Code font-size offset**: the size control is split into **two independent axes** — "Body font size offset" for text and interface sizes, and "Code font size offset" for code blocks and inline code only. The single slider used to scale both chains, so moving the body always dragged code along with it; now each moves on its own. The field is `sizeOffsetCode` (-3 ~ +6 px, 0 = leave alone), sitting next to the existing `sizeOffset`, whose meaning narrows to "body and interface text". After upgrading, an existing configuration leaves code at DSH's own sizes while body behaviour is unchanged.

### Changed
- **Card layout**: each size slider now sits under the font it resizes — body font → body size offset → code font → code size offset → weight. The two sliders are labelled separately ("Body font size offset" / "Code font size offset"), and the card description reads "Body and code fonts, a size offset for each, weight, and a West/CJK split".
- **How the code chain is consumed**: DSH's markdown code tokens are `font` shorthands (`--dsw-font-markdown-code` / `-code-block` / `-code-block-small`, valued like `11px/19px <family>`), and the shorthands — not their `-font-size` parts — are what the shipped stylesheets actually read, so the code axis rewrites those too (size and line height scaled, family list kept verbatim) alongside the split parts. The embedded fallback map is corrected to rc.2's real values (it claimed 13px/20px) and gains the three shorthand names.
- **Compatibility table** now lists 0.1.4 as the latest version.

## [0.1.3] - 2026-09-14

### Changed
- **Switch row wording and shape**: the label on the left is now **编辑模式 / "Edit mode"** (was 编辑方式), and the two options are back to a **joined segmented control** (one shared frame with a divider between the options), while the selected option keeps its grey `--dsw-specific-sidebar-nav-item-active` surface and primary-coloured text (0.1.2 had split them into two separate buttons; this reverts that shape).
- **Card description**: now mentions the **West/CJK split** as well, in both languages, so it matches what the card actually offers.
- **Feature list trimmed in the README**: the "commit on release", "no first-paint flash" and "bilingual" bullets are gone — they describe implementation details rather than features, and the behaviour itself is unchanged (still recorded under 0.1.0 in this file).
- **Compatibility table** now lists 0.1.3 as the latest version.

## [0.1.2] - 2026-09-14

### Changed
- **README rewritten**: it now covers features, install, usage, compatibility and development only — design trade-offs, implementation rationale and development pitfalls are no longer part of it. Both the Chinese and the English file were rewritten together.
- **Tighter compatibility declaration**: `engines.dsh` stays `>=0.1.5-rc.2`, while the compatibility table lists only the **latest release of the 0.1.5 line** (`0.1.5-rc.2`) — it carries every fix in that line and is the most stable build of the major version; older builds of the same major version stay compatible per semantic versioning, so they are no longer enumerated.
- **Trimmed npm description**: the "configured from Settings…" clause and the `(DSH)` parenthetical are gone, replaced by one functional sentence. Published-version metadata cannot be edited, so this takes effect from 0.1.2.
- **English card title**: `Font plus` → `Font tune`, matching the package name (the Chinese title stays 字体增强).

## [0.1.1] - 2026-09-14

### Added
- **English changelog**: `CHANGELOG.en.md` was added and ships inside the package.
- **GitHub Release workflow**: pushing a `v*` tag packs the plugin and creates or updates the Release with a **version-free** `dsh-fonttune.tgz` asset (the market's `tarball:` field points at it, so the link cannot rot on the next release). The release body takes the Chinese section of this file for that version and folds the English section into `<details>`.

### Changed
- The stale offline-check count in the README and changelog was corrected (35 → 42). The running code is identical to 0.1.0.

## [0.1.0] - 2026-09-14

First release. The architecture is a dual-half plugin (host + client): the client half owns the settings card and the style injection, the host half registers the settings namespace and ships the saved declarations with the served index.

### Added
- **Plugin settings card**: a host settings namespace registered under `settings.plugin.item` with the key `dsh-fonttune`, so it appears in **Settings → Plugins → Plugin configuration**; saving and resetting go through DSH's own settings document (`settings.yaml`).
- **Body / code font families**: two independent CSS font-family fallback lists, each allowed to be empty (= leave DSH's own stack alone).
- **Font picker panel**: four preset groups (monospace / CJK / Latin / generic); on Chromium `queryLocalFonts()` adds an "installed on this machine" group; a name that is not in the list can be created with "use xxx"; every row renders in its own font.
- **West / CJK split (simple mode)**: a switch at the top of the card — **simple mode** splits the stack into a Western and a CJK single-pick slot (one pair for body, one for code) while keeping one stack underneath; **advanced mode** is the full chip editor. The semantics are "simple mode only touches the front": the Western slot is the first non-CJK entry (picking replaces it in place, or prepends when there is none) and the CJK slot is the first CJK entry (picking replaces it in place, or **inserts right after the Western slot** when there is none, which keeps `Western, CJK, generic` CSS semantics correct). Everything beyond the two slots keeps its order and is shown as an "other fallbacks" note. **Switching modes is a pure view switch that writes nothing.** CJK classification is name-heuristic first (a broad regex plus localized names containing CJK characters); canvas measurement only confirms names that do not look CJK, so a preset family that is not installed still lands in the CJK slot. The switch row is a label on the left and a segmented toggle on the right.
- **Drag to reorder**: the selected families are a chip list with drag reordering, plus earlier/later buttons for keyboard and touch.
- **Live preview**: mixed Chinese/English plus a code line, rendered from the current configuration.
- **Global font-size offset** (-3 ~ +6 px): rescales DSH's own size tokens (`--dsh-content-font-size`, `--dsw-font-*-font-size` / `-line-height`) with the base read live, so it **stacks** with DSH's own font-size setting instead of overriding it; the token list is discovered at runtime with a built-in fallback map.
- **Global font weight** (300 ~ 600, any integer): applied through `body, body *`; 400 and "unset" both mean "leave DSH's own weight alone".
- **Commit-on-release sliders**: dragging the size-offset or weight slider only updates a local value and its readout — the write happens once on `pointerup` / `touchend` (window capture-level listeners) or on blur/keyup, so dragging never recomputes the size tokens and rewrites the settings document per step. **The local value also stays on screen until the host confirms it**: clearing it immediately would show the old committed number for one frame ("bounces back, then settles"); a repeated `pointerup` is guarded by an "already awaiting confirmation" flag so the same value is never written twice.
- **No first-paint font flash**: the host half listens on `webserver/index-inject` and injects the same declarations, so the first paint is already correct.
- **Bilingual copy** (Chinese/English) with a Chinese fallback; `queryLocalFonts` unavailability or refusal falls back to the built-in list silently.
- **Family-name sanitizing**: names are filtered through an allowlist and then quoted as a whole (letters/digits/space/`.` `,` `_` `-` only); the host schema adds a `^[^{};<>\\]*$` pattern and a length cap. A hand-crafted CSS injection cannot close a declaration or start a rule.

### Fixed
- **The card crashed on first render** (a release blocker): `scope.subscribe` was passed to React's `useSyncExternalStore` as a bare method reference, while the host's `SettingsScopeController.subscribe` is a prototype method reading `this.store` — called detached, `this` is undefined → the slot entry crashed silently and the card never appeared in the plugin configuration page. Fixed by wrapping the subscribe in a closure that preserves `this`. The offline tests had missed it (the double's subscribe did not depend on `this` and the React double never called subscribe); both doubles now reproduce the bug.
- **Three size-offset defects**: ① missing `!important` — the theme writes `--dsh-content-font-size` **inline on body**, and an inline declaration beats a normal stylesheet rule, so the body itself was not scaled while descendants were, splitting the page's font size in two; ② a **self-pollution compounding loop** — the 4-second token refresh re-read the plugin's own stylesheet declarations as its base and multiplied the ratio again on every cycle ("the fonts keep growing"); fixed by skipping the plugin's own tags, reading `--dsh-content-font-*` from the body inline style, and no longer using computed styles as a base source; ③ **double scaling through the `var()` chain** — DSH's derived tokens (delta/secondary/markdown) all derive from `var(--dsh-content-font-size)`, so scaling them too multiplied the ratio twice; fixed by skipping tokens whose base contains `var(` and letting the variable chain carry them.
- **Families did not reach the conversation or sidebar**: markdown and sidebar CSS declare `font-family: var(--dsw-font-family)` themselves, truncating inheritance, so a body-level `font-family` never got through. Fixed by overriding at the **variable source** (`:root,body{--dsw-font-family:…!important}` plus `--dsw-font-mono` / `--ds-font-family-code`), with the explicit `body` / `pre,code` rules kept as a second path.
- **Weight snapped to ±100**: values used to snap to 300/400/500/600, which looked like a ±100 step while dragging; the chosen integer is now written to CSS verbatim (variable fonts are fully linear, static fonts round to their nearest available weight natively) with a step of 1.
- **The sanitizer was too permissive**: `Arial"; } body { background: url(evil) }` left `:` `(` `)` behind; rewritten as an allowlist.
- **The host half importing named exports from the CJS shared module broke ESM loading** (`Named export not found`); switched to a default import.
- **The size-token regex missed `--dsh-content-font-size`** (the name has no `-font-` segment) and its `-secondary` variants.
- **Timers now go through `globalThis`** instead of assuming `window` carries them.
