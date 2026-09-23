# Changelog

All notable changes to **dsh-fonttune** are documented here. Chinese version: [CHANGELOG.md](CHANGELOG.md).

## [0.2.5] - 2026-09-23

### Fixed
- **Installed as a link to the source directory, the card and the fonts disappeared together on 0.1.5-rc.x**: the plugin used the copy of the schema library in its own directory instead of the one DSH provides, and the newer copy marked the configuration in a way the rc line's settings controller cannot handle — the settings namespace was therefore never registered: no card in the settings sheet, an empty injected stylesheet, no typography change at all. It now always uses the copy DSH ships, so a linked install and a normal install behave identically.

## [0.2.4] - 2026-09-23

### Added
- **One package for both host lines**: it installs and works as-is on **DSH 0.1.5-rc.1 – rc.3** and on **0.1.7-alpha.1 – alpha.2**, with no version to pick. At runtime the plugin uses whichever settings interface the host offers (the rc line's and the alpha's are different); when neither is there it only injects the font and shows no card.
- **A configuration entry point on the alpha**: on 0.1.7-alpha.x the card lives in the sidebar's Plugins page, under the plugin entry "Font tune"; on rc.x it stays in Settings → Plugins → Plugin configuration.

### Fixed
- **On the alpha the card's first render was a column of empty controls**: it was reading the host's internal references instead of the values, so the injected stylesheet came out empty; the first frame now carries the right family and readouts.
- **On the alpha an edit reported "The setting was not saved"**: the plugin could write to a place that was not its own; it now writes only after confirming the configuration is its own.

### Changed
- The compatibility statement and the compatibility table in both READMEs are updated to 0.2.4, listing the five host lines that were actually tested (0.1.5-rc.1 / rc.2 / rc.3 and 0.1.7-alpha.1 / alpha.2) and where each line's settings live.

## [0.2.3] - 2026-09-22

### Fixed
- **A refused settings write no longer looks like a successful one**: when the host rejects a save, the preset row says "The setting was not saved: <reason>" instead of silently snapping the control back to the stored value.
- **Export hands over the whole thing even without a clipboard**: the clipboard is tried first; on an origin that has none (the remote HTTP entry) the legacy copy path is used; only when both fail does the full JSON land in a fully selected read-only box, one copy shortcut away.
- **The font picker**: the four curated groups (monospace / CJK / Latin / generic) no longer vanish once local enumeration succeeds, so a curated family this machine does not have can still be found by name; a family is listed once; a refused font permission is no longer remembered forever — reopening the panel retries after twenty seconds.
- Every per-theme rule now carries its theme prefix (per-theme is not open yet; a latent bug fixed ahead of time).

### Changed
- **A smaller stylesheet and a cheaper background**: collapsing the exclusion lists took one real configuration's stylesheet from 2735 to 2440 bytes, and the size axis now compares three cheap signals before touching any stylesheet at all.
- Compatibility table gained 0.2.3.


## [0.2.2] - 2026-09-16

### Fixed
- **In simple mode the CJK slot could not be picked or cleared**: choosing a family there, or clearing that chip, threw and lost the change (the western slot was fine); all three family sections now write their CJK slot properly.
- **`MS PGothic` / `MS PMincho` are recognised as CJK**: they used to be treated as western, which feeds simple mode's CJK slot.
- **A guard for unwired controls**: the offline checks now fire every control's callback (sliders, segmented controls, the family picker, the preset select, text inputs, every button), so a handler that was never connected fails immediately.

### Changed
- **A release can no longer ship an untested package**: the tag-triggered build runs the full check before packing, and asserts that the packed artifact matches the sources and that the tag matches the version.
- Documentation: editing a source file requires a build first (the browser loads the built artifact), and the market entry only *states* its compatibility — there is no pre-install preflight.


## [0.2.1] - 2026-09-16

### Fixed
- **After switching "interface follows conversation" off, the interface weight did not fall back and reset did nothing**: two copies of the injected stylesheet lived in the page, and the served one is only rebuilt on the next page load, so any change that *removed* a rule never took effect. There is only one copy now, and both switching the follow off and resetting apply immediately.
- **Going from following to not following no longer snaps the interface back to its own old value**: the value the interface was showing is stored as its own the moment the switch goes off, so nothing moves visually and the slider stays where it was; a conversation axis that was never set keeps DSH's own value.
- **The interface weight is back, and it really cannot touch the conversation**: the whole conversation body and code subtree is excluded from the interface weight rule — every interface text element moves, not a single conversation element does.
- **The conversation section no longer claims to "follow the interface" when unset** (the following has always been one-way: the interface follows the conversation).
- The previews inside the card are no longer dragged along by the interface weight: conversation, code and interface previews each match the real surface.

### Changed
- **The follow switch now covers font and weight together**: while it is on the interface uses the conversation's family and weight (its own two controls are hidden); with it off the interface uses its own, and neither side affects the other.


## [0.2.0] - 2026-09-16

### Added
- **Three separate sets of typography**: **conversation** (body, tables, headings — family, size, line height and weight), **interface** (family only, following the conversation by default) and **code** (its own set, with ligatures and feature switches).
- **Conversation size**: −3 to +6 px on top of DSH's own conversation size, moving paragraphs, headings and line height together.
- **Conversation line height**: 100%–160%; the code line height is a separate additive offset.
- **Code ligatures**: default / on / off, plus a sanitized `font-feature-settings` field in advanced mode.
- **Refuse synthetic italics and bolds**: one switch in simple mode, two independent ones in advanced mode.
- **Presets**: a dropdown in the card with five defaults, applied on pick; once one is selected every edit is saved into it; rename, import and export sit beside it (import merges by name, at most 20, synced across browsers).
- **A rebuilt card**: edit mode, a preset bar, then collapsible conversation / interface / code sections that start collapsed, one open at a time, each ending in its own preview; row heights and controls match dsh-quick-toc.

### Changed
- **The interface's size, line height and weight axes retired**: DSH has no interface-size interface (the settings page and sidebars use hard-coded sizes upstream), so those axes could not reach the interface and only disturbed the conversation. Size, line height and weight now belong to the conversation alone; the interface keeps the family, which does work. The old fields stay in the schema and keep parsing.
- Font families are delivered through the official theme layer, so a theme switch applies immediately.
- Light and dark share one set of values in this release; per-theme values are deferred.

### Fixed
- **"Changing the interface changed the conversation"**: the interface size axis used to scale the conversation's size chain too; it is isolated now.
- **The conversation size offset only moved headings, not paragraphs**: the offset is added once at the source, so paragraphs, headings and line height all follow.
- **In the dark theme a dark value could be overridden by a light one.**
- **The weight readout said "not set" while the slider sat at 400**: the readout is 400 now.
- **The `%` disappeared while dragging the line-height slider**: the pending readout carries its unit too.
- **The conversation section showed English variable names as labels**: both dictionaries are complete.
- The first field of an expanded section sat too far from the heading, and the expanded chevron was not pinned to the right.


## [0.1.6] - 2026-09-15

### Fixed
- **The card's expand chevron did not match the host's**: it was a text character — thinner than the host's arrows and off-centre when rotated. It is now the host's own inline chevron, rotating around its own centre.


## [0.1.5] - 2026-09-15

### Added
- **Code weight**: weight split into independent "body weight" and "code weight" sliders (300–600 each, 400 meaning unchanged), so changing the body no longer drags the code along.

### Changed
- The weight slider moved into the family group it belongs to, with separate labels for the two.
- An unset code weight now writes DSH's own value back explicitly, so code does not follow the body weight after upgrading.


## [0.1.4] - 2026-09-15

### Added
- **Code size**: size split into independent "body size" and "code size" sliders (−3 to +6 px each, 0 meaning unchanged), so changing the body no longer drags the code along.

### Changed
- The size slider moved under the family it belongs to, with separate labels; after upgrading the body behaves as before and code returns to DSH's own value.


## [0.1.3] - 2026-09-14

### Changed
- The switch row's label became "edit mode", and its two options went back to a joined segmented control with one divider between them.
- The card description now mentions the western/CJK split.
- The README dropped three implementation notes ("written on release", "no font flash on the first frame", "bilingual") — behaviour unchanged.


## [0.1.2] - 2026-09-14

### Changed
- The README was rewritten as features / install / usage / compatibility / development; design trade-offs and development pitfalls left it (both languages).
- The compatibility statement is narrower: only the latest patch of the 0.1.5 line is listed — older patches in the same major are compatible per semantic versioning and are no longer enumerated.
- The npm description was trimmed (published metadata cannot be edited, so this takes effect from 0.1.2), and the English card title became "Font tune", matching the package name.


## [0.1.1] - 2026-09-14

### Added
- An English changelog, `CHANGELOG.en.md`, shipped with the package.
- Pushing a `v*` tag now packs and creates/updates a Release automatically, including a version-less `dsh-fonttune.tgz` for the market entry to link to; the release body is the Chinese section for that version with the English one folded inside.


## [0.1.0] - 2026-09-14

The first release: a two-half plugin. The browser half owns the settings card and the style injection; the host half registers the settings namespace and serves the saved declarations with the index, so the first frame already uses them.

### Added
- **The plugin configuration card**: in Settings → Plugins → Plugin configuration, reading and writing DSH's own settings document.
- **Two font stacks**, one for the body and one for code, each a fallback list that may be empty (= leave DSH's fonts alone).
- **A font picker**: the built-in monospace / CJK / Latin / generic groups, the machine's installed families on Chromium, a "use <name>" entry for anything not listed, and every row rendered in its own family.
- **Western/CJK split (simple mode)**: the stack becomes a western slot and a CJK slot while every other entry and the order stay untouched; advanced mode is the full chip editor with drag reordering and a live preview.
- **A global size offset** (−3 to +6 px, stacking with DSH's own size slider) and **a global weight** (300–600, 400 meaning unchanged).
- **Sliders write on release**: nothing is written while dragging, and the readout holds until the host confirms.
- **Bilingual copy**; family names are sanitized so they cannot close a declaration or open a rule.

### Fixed
- **The card crashed on its first render** (a release blocker): the subscribe method was passed bare, losing `this`, so the card never appeared on the plugin configuration page.
- **Three problems in the size offset**: the body itself was not scaled, a refresh multiplied the plugin's own declarations as if they were the baseline, and derived sizes were scaled twice.
- **The family did not reach the conversation area or the sidebars** (those areas declare the font variable themselves).
- **The weight was snapped to the nearest hundred**: any integer now applies as chosen.
- **Family sanitizing was too permissive.**

