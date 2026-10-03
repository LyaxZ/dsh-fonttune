window.__ModuleLoader__.load({
	id: "dsh-fonttune",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		// ---- inlined from src/shared.cjs ----
var __dfpShared = (function () {
	var module = { exports: {} };
	var exports = module.exports;
/**
 * dsh-fonttune shared core.
 *
 * Pure functions and constants only — no document, no cordis, no React. The
 * host half (`lib/index.js`, ESM) and the browser half (`lib/client.js`, the
 * lazy-CJS loader format) both load this file, so it is written as a CJS module
 * that also works when a browser bundle inlines it verbatim.
 *
 * The single source of truth for: the durable field names, the CSS a
 * configuration produces, and the sanitizing that keeps user-typed font names
 * from breaking out of the injected stylesheet.
 *
 * 0.2.x shape: the axes are grouped into three SURFACES — interface (the UI
 * chrome), dialog (the conversation markdown) and code. The CONVERSATION owns
 * every axis: a family, a size offset, a weight and a line-height ratio. The
 * interface owns a family and a weight, and by default FOLLOWS the conversation
 * on both (the switch turns that off and reveals its own controls); DSH exposes
 * no interface size or line-height hook at all, so those two axes are retired
 * and the durable fields inject nothing. Code carries a family, a size offset,
 * a weight, an additive line-height offset and the ligature/feature controls.
 * `perTheme` enables a second value set for the dark theme, stored as a sparse
 * override map.
 *
 * The interface weight is the one axis that has to reach the WHOLE page (DSH
 * pins its labels with literal weights on class rules, so nothing narrower can
 * move them), which is why it is a `body, body *` rule with an exclusion for
 * the conversation markdown subtree: the conversation's own weight rule then
 * owns that subtree completely and neither axis can disturb the other. That
 * exclusion is what makes the axis safe — measured on a live page (computed
 * styles, `test/weight-verify.mjs`): every text element outside the markdown
 * subtree takes the weight, and not one element inside it moves.
 *
 * @module dsh-fonttune/shared
 */
"use strict";

/** Settings namespace registered by the host half. */
var NAMESPACE = "dsh-fonttune";

/* ------------------------------------------------------------------ *
 * durable field names
 * ------------------------------------------------------------------ */

/** Field carrying the interface CSS font-family stack (empty = leave DSH). */
var SANS_FIELD = "sans";

/**
 * Field carrying the dialog stack. The conversation owns the family: empty
 * means DSH's own default family. A document written before 0.2.0 only has the
 * interface family, so an empty dialog takes it (see `expandFollow`) — that is
 * a migration bridge, not a live rule the card describes.
 */
var STACK_DIALOG_FIELD = "stackDialog";

/** Field carrying the code CSS font-family stack (empty = leave DSH). */
var MONO_FIELD = "mono";

/** Field carrying the interface font-size offset in px (0 = leave DSH alone). */
var SIZE_FIELD = "sizeOffset";

/** Field carrying the dialog font-size offset in px (0 = DSH's own sizes). */
var SIZE_DIALOG_FIELD = "sizeOffsetDialog";

/** Field carrying the code font-size offset in px (0 = leave DSH alone). */
var CODE_SIZE_FIELD = "sizeOffsetCode";

/**
 * Field carrying the interface font weight (0 = leave DSH alone). While the
 * interface follows the conversation this is the fallback for a conversation
 * that sets no weight of its own.
 */
var WEIGHT_FIELD = "weight";

/** Field carrying the dialog font weight (0 = DSH's own weights). */
var WEIGHT_DIALOG_FIELD = "weightDialog";

/** Field carrying the code font weight (0 = leave DSH alone). */
var CODE_WEIGHT_FIELD = "weightCode";

/**
 * Marks a document whose weight fields are OFFSETS, not absolute weights.
 *
 * Before 0.2.8 the three weight axes stored an absolute CSS weight (`300…600`,
 * `400` = normal) and `clampWeightDelta` converted one on sight. That inference
 * only works while offsets never land inside the absolute window, which capped
 * the offset range at +200 — and +200 is not enough room for a step the eye can
 * see on a family with few faces (measured: one 200-weight step is a +30% change
 * on Noto Serif SC, one 100-weight step only +16%).
 *
 * So the document says which scale it is on, and the inference is borrowed for
 * exactly one write: the first time 0.3.5+ writes a weight, the card converts any
 * remaining absolute value, converts the saved presets the same way, and sets
 * this field. From then on a stored weight is an offset, whatever its size.
 */
var WEIGHT_OFFSETS_FIELD = "weightOffsets";

/**
 * Field carrying the interface line-height ratio in percent (100 = untouched).
 * A ratio rather than a px offset: interface line heights form a design ladder
 * (14/18/20/22/24/26/28/32), and a ratio keeps every step proportional.
 */
var LINE_HEIGHT_FIELD = "lineHeight";

/** Field carrying the dialog line-height ratio in percent (100 = DSH's own). */
var LINE_HEIGHT_DIALOG_FIELD = "lineHeightDialog";

/** Field carrying the code line-height offset in px (0 = leave DSH alone). */
var CODE_LINE_HEIGHT_FIELD = "lineHeightCode";

/** Ligature mode: 0 = DSH default, 1 = forced on, 2 = forced off. */
var LIGATURES_FIELD = "codeLigatures";

/** Advanced `font-feature-settings` value for code (sanitized; empty = none). */
var FEATURES_FIELD = "codeFeatures";

/** Disable synthetic (faux) italic — the "tilted CJK" rendering. */
var NO_SYNTHETIC_ITALIC_FIELD = "noSyntheticItalic";

/** Disable synthetic (faux) bold, for faces without a real bold. */
var NO_SYNTHETIC_BOLD_FIELD = "noSyntheticBold";

/**
 * How the browser draws the strokes: `SMOOTHING_AUTO` leaves the system's own
 * rendering alone, `SMOOTHING_SHARP` asks for the crisp subpixel kind and
 * `SMOOTHING_SMOOTH` for the soft grayscale kind. The same face reads firmer
 * under one and softer under the other, so this is a look the reader feels
 * rather than measures — durable, but never part of a preset snapshot.
 */
var SMOOTHING_FIELD = "fontSmoothing";
var SMOOTHING_AUTO = "auto";
var SMOOTHING_SHARP = "sharp";
var SMOOTHING_SMOOTH = "smooth";
var SMOOTHING_VALUES = [SMOOTHING_AUTO, SMOOTHING_SHARP, SMOOTHING_SMOOTH];

/** Whether the dark theme keeps its own value set (sparse overrides). */
var PER_THEME_FIELD = "perTheme";

/**
 * JSON string of the dark-theme sparse overrides: a map of axis field to
 * value, applied over the single set while the dark theme is active.
 */
var DARK_VALUES_FIELD = "darkValues";

/** JSON string of saved presets: [{name, values, savedAt}]. */
var PRESETS_FIELD = "presets";

/** Name of the preset the card's edits auto-save into. */
var ACTIVE_PRESET_FIELD = "activePreset";

/**
 * Whether the INTERFACE follows the conversation. The conversation owns every
 * axis; the interface has a family and a weight of its own (DSH exposes no
 * interface size or line-height hook), so on — the default — the conversation's
 * family and weight win and the interface's own values stand as the fallback
 * for an axis the conversation does not set.
 */
var UI_FOLLOWS_FIELD = "uiFollowsDialog";

/**
 * The floating panel's master switch. Chrome, not typography: it never rides
 * a preset snapshot, so switching presets cannot hide or move the panel.
 */
var PANEL_ENABLED_FIELD = "panelEnabled";

/**
 * The floating panel's last position, as `"x,y"` in CSS pixels from the
 * viewport's top-left (empty = the default corner). Chrome, not typography:
 * kept out of presets for the same reason as the master switch.
 */
var PANEL_POS_FIELD = "panelPos";

/**
 * The corner the floating panel LIVES in: one of `"tl"`, `"tr"`, `"bl"`, `"br"`,
 * or "" while no corner has been chosen yet.
 *
 * The corner is the dot's identity and the position is only its consequence. A
 * region that changes shape — a sidebar folding away, a top bar appearing, a
 * window resize — MOVES the corner the dot sits on, and the dot follows that
 * corner; it does not re-decide which one it belongs to from the coordinates the
 * old region gave it. Only a release the user made themselves re-decides (the
 * nearest corner, see `floatNearestCorner`), and this field is what carries that
 * decision across every later region change. Chrome, not typography: kept out of
 * presets for the same reason as the master switch.
 */
var PANEL_CORNER_FIELD = "panelCorner";

/**
 * The floating panel's last size, as `"w,h"` in CSS pixels (empty = default).
 * Chrome, not typography: persisted next to the position, never snapshotted.
 */
var PANEL_SIZE_FIELD = "panelSize";

/** The four corners a remembered identity may name, in reading order. */
var PANEL_CORNERS = ["tl", "tr", "bl", "br"];

/* ------------------------------------------------------------------ *
 * ranges and constants
 * ------------------------------------------------------------------ */

/** Allowed font-size offset range. The upper bound stays under a 2x scale. */
var SIZE_MIN = -3;
var SIZE_MAX = 6;

/** Allowed CODE weight range (an absolute value), and "do not touch". */
var WEIGHT_MIN = 300;
var WEIGHT_MAX = 600;
var WEIGHT_UNSET = 0;

/**
 * Allowed range of the two RELATIVE weight axes, in steps of 100-weight.
 *
 * The conversation and interface weight axes are offsets on each element's own
 * weight, not replacements: a flat `font-weight` over the markdown subtree
 * erased the heading hierarchy (measured on 0.1.7-rc.2, where every markdown
 * weight lives inside its `font` shorthand — `._markdown_ h2{font:var(--dsw-font-markdown-h2)}`
 * with `700` in it — and a long-handed `font-weight` with `!important` beat the
 * shorthand). The delta window is the old absolute window shifted by −400, so
 * `300…600` maps onto `−100…+200` one-to-one and `400` (normal) becomes 0, which
 * is the value meaning "do not touch".
 */
var WEIGHT_DELTA_MIN = -100;
var WEIGHT_DELTA_MAX = 200;

/**
 * The widest range a font-derived slider may use, either way.
 *
 * The nominal window above is what the axes can always express; a family with
 * faces outside it (a black 900 cut, a hairline 100) earns a wider slider — see
 * `weightProfileFrom` — and these are the hard bounds that keeps that in check.
 */
var WEIGHT_DELTA_FLOOR = -300;
var WEIGHT_DELTA_CEIL = 600;

/** The weight DSH gives an element that declares none of its own. */
var WEIGHT_BASE = 400;

/**
 * The weight range CSS accepts at all.
 *
 * Named because it is easy to confuse with `WEIGHT_MIN…WEIGHT_MAX`, which is the
 * window an ABSOLUTE weight from a pre-relative document occupies (300…600) and
 * has nothing to do with what a font can render.
 */
var WEIGHT_CSS_MIN = 100;
var WEIGHT_CSS_MAX = 900;

/**
 * The weight ladder of the conversation: each group carries the weight DSH's
 * own stylesheet gives those elements, so an offset lands ON TOP of it.
 *
 * The bases are the measured ones (`--dsw-font-markdown-h*-font-weight` 700 /
 * 600, `-base-strong-font-weight` 600, `-table-head-font-weight` 500, everything
 * else 400).
 */
var DIALOG_WEIGHT_GROUPS = [
  { base: 700, elements: "h1,h2,h3" },
  { base: 600, elements: "h4,h5,h6" },
  { base: 600, elements: "strong,b" },
  { base: 500, elements: "th" },
  {
    base: 400,
    elements: "p,li,td,dt,dd,blockquote,summary,em,i,a,label,small,div,span",
  },
];

/**
 * The heaviest base in the conversation ladder — the layer with the least room.
 *
 * Derived from the ladder so the two cannot drift apart.
 */
var WEIGHT_LADDER_TOP = DIALOG_WEIGHT_GROUPS.reduce(function (top, group) {
  return group.base > top ? group.base : top;
}, WEIGHT_BASE);

/**
 * How far above its base an offset may reach at all.
 *
 * The ceiling comes from the layer a notch MUST move: body text sits at
 * `WEIGHT_BASE`, so the range runs as far as the text a reader is reading can
 * still change — measured up to +400 on a family whose faces reach 900. Bold text
 * stops moving at +300 and headings at +200; that is accepted, because a heading
 * already at its heaviest face stays there (see `WEIGHT_LADDER_STRONG`).
 *
 * It used to stop at `WEIGHT_CSS_MAX - WEIGHT_LADDER_TOP` (= +200) so an offset
 * could never land inside `WEIGHT_MIN…WEIGHT_MAX`, the window an ABSOLUTE weight
 * from a pre-relative document occupies. The document's own marker resolves that
 * window now (`WEIGHT_OFFSETS_FIELD`), so the range is free to grow.
 */
var WEIGHT_DELTA_UP_LIMIT = WEIGHT_CSS_MAX - WEIGHT_BASE;

/**
 * The heaviest layer a notch still has to move: bold text.
 *
 * The heading layer above it is deliberately left out of that requirement. A heavy
 * family spaces its top faces far apart (a 700 cut next to a 900), so headings
 * reach their heaviest rendering part-way up the range and would otherwise hold the
 * whole control down to one wide step. Every notch must move the text you read and
 * the text you emphasise; a heading that is already at its boldest face stays there.
 */
var WEIGHT_LADDER_STRONG = DIALOG_WEIGHT_GROUPS.reduce(function (strong, group) {
  return group.base < WEIGHT_LADDER_TOP && group.base > strong ? group.base : strong;
}, WEIGHT_BASE);

/** Allowed line-height ratio range, in percent (100 = untouched). */
var LINE_HEIGHT_MIN = 100;
var LINE_HEIGHT_MAX = 160;

/** Allowed code line-height offset range, in px. */
var CODE_LINE_HEIGHT_MIN = -4;
var CODE_LINE_HEIGHT_MAX = 8;

/** Ligature modes. */
var LIGATURES_DEFAULT = 0;
var LIGATURES_ON = 1;
var LIGATURES_OFF = 2;

/** `data-plugin-css` value of the tag applying the configuration. */
var STYLE_TAG = "dsh-fonttune";

/** `data-plugin-css` value of the card's own chrome stylesheet. */
var CARD_STYLE_TAG = "dsh-fonttune-card";

/** Composition defaults: every axis dormant, so installing changes nothing. */
var DEFAULTS = {
  sans: "",
  stackDialog: "",
  mono: "",
  sizeOffset: 0,
  sizeOffsetDialog: 0,
  sizeOffsetCode: 0,
  weight: WEIGHT_UNSET,
  weightDialog: WEIGHT_UNSET,
  weightCode: WEIGHT_UNSET,
  lineHeight: LINE_HEIGHT_MIN,
  lineHeightDialog: LINE_HEIGHT_MIN,
  lineHeightCode: 0,
  codeLigatures: LIGATURES_DEFAULT,
  codeFeatures: "",
  noSyntheticItalic: false,
  noSyntheticBold: false,
  fontSmoothing: SMOOTHING_AUTO,
  perTheme: false,
  darkValues: "{}",
  presets: "[]",
  activePreset: "",
  uiFollowsDialog: true,
  panelEnabled: true,
  panelPos: "",
  panelCorner: "",
  panelSize: "",
};

/**
 * The axis fields a preset snapshots and the light/dark sets are compared
 * over: everything the card edits, excluding the storage fields themselves.
 */
var VALUE_FIELDS = [
  SANS_FIELD,
  STACK_DIALOG_FIELD,
  MONO_FIELD,
  SIZE_DIALOG_FIELD,
  CODE_SIZE_FIELD,
  WEIGHT_FIELD,
  WEIGHT_DIALOG_FIELD,
  CODE_WEIGHT_FIELD,
  LINE_HEIGHT_DIALOG_FIELD,
  CODE_LINE_HEIGHT_FIELD,
  LIGATURES_FIELD,
  FEATURES_FIELD,
  NO_SYNTHETIC_ITALIC_FIELD,
  NO_SYNTHETIC_BOLD_FIELD,
  UI_FOLLOWS_FIELD,
];

/**
 * Axes that are still stored but no longer render: the interface's own size
 * and line-height.
 *
 * DSH 0.1.5-rc.2 publishes no interface size or line-height hook at all (the
 * measurement lives in `buildAxisCss`), so these two fields inject nothing.
 * A document written by 0.1.x still carries them, so they keep their schema
 * entries and stay part of normalization — but they are not value axes: a
 * preset no longer snapshots a dead field, and a light/dark pair that differs
 * only here no longer counts as two sets. The card's "reset every axis" clears
 * them too, so a value nothing shows cannot hide in a document forever.
 */
var RETIRED_FIELDS = [SIZE_FIELD, LINE_HEIGHT_FIELD];

/**
 * Every durable field normalization covers: the live axes, the retired pair, and
 * the scale marker (`WEIGHT_OFFSETS_FIELD`, which is deliberately NOT a value
 * axis — a preset must never carry it, or applying that preset would re-label a
 * document still holding absolute weights).
 */
var DURABLE_FIELDS = VALUE_FIELDS.concat(RETIRED_FIELDS, [
  WEIGHT_OFFSETS_FIELD,
  PANEL_ENABLED_FIELD,
  PANEL_POS_FIELD,
  PANEL_CORNER_FIELD,
  PANEL_SIZE_FIELD,
  SMOOTHING_FIELD,
]);

/**
 * Longest accepted font stack, in characters (mirrored by the host schema).
 */
var MAX_STACK_LENGTH = 200;

/** Longest accepted single family name, in characters. */
var MAX_FAMILY_LENGTH = 64;

/** Longest accepted `font-feature-settings` value, in characters. */
var MAX_FEATURES_LENGTH = 120;

/** Most presets one configuration may hold. */
var MAX_PRESETS = 20;

/** Longest preset name, in characters. */
var MAX_PRESET_NAME = 32;

/* ------------------------------------------------------------------ *
 * sanitizing
 * ------------------------------------------------------------------ */

/**
 * What may survive in a family name.
 *
 * This is an allow-list, not a deny-list: a family name is letters (any
 * script, so CJK and accented Latin pass), digits, spaces and the handful of
 * punctuation marks real families use. Everything else — quotes, braces,
 * semicolons, colons, commas, parentheses, slashes, angle brackets, comment
 * markers — is dropped, which is what makes it impossible for a typed name to
 * end a declaration, open a rule, or reach `url(...)`.
 */
var UNSAFE_CHARS = /[^\p{L}\p{N} .,_-]/gu;

/**
 * Strip everything a family name cannot contain, and collapse whitespace.
 * @param {unknown} value - candidate text.
 * @returns {string} the safe text (possibly empty).
 */
function sanitize(value) {
  if (typeof value !== "string") return "";
  return value.replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
}

/**
 * Sanitize one family name and drop what cannot be one.
 * @param {unknown} value - candidate family name.
 * @returns {string} the safe name, or "" when nothing usable is left.
 */
function sanitizeFamily(value) {
  var name = sanitize(value).slice(0, MAX_FAMILY_LENGTH);
  // A lone comma would split into an empty entry; a lone quote cannot pair.
  if (name === "" || name === ",") return "";
  return name;
}

/**
 * Render one family name the way it must appear inside a CSS list.
 *
 * Generic keywords are passed through; anything else is double-quoted, because
 * unquoted multi-word names are invalid CSS unless every word is an identifier.
 * @param {string} name - a sanitized family name.
 * @returns {string} one CSS list entry.
 */
function quoteFamily(name) {
  var text = sanitizeFamily(name);
  if (text === "") return "";
  if (GENERIC_FAMILIES.indexOf(text.toLowerCase()) >= 0) return text;
  return '"' + text + '"';
}

/**
 * CSS-wide generic family keywords and the two system shorthands.
 */
var GENERIC_FAMILIES = [
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
  "-apple-system",
  "blinkmacsystemfont",
];

/**
 * Sanitize an advanced `font-feature-settings` value.
 *
 * Feature tags are letters and digits; entries may carry on/off/number and are
 * comma separated. The allow-list (letters, digits, quotes, spaces, commas)
 * keeps the value from closing the declaration or opening another one, and a
 * coarse shape test rejects anything that is not a tag-entry list.
 * @param {unknown} value - candidate features value.
 * @returns {string} the sanitized value, or "".
 */
function sanitizeFeatures(value) {
  if (typeof value !== "string") return "";
  var text = value.replace(FEATURES_UNSAFE, "").slice(0, MAX_FEATURES_LENGTH).trim();
  if (text === "") return "";
  if (!/^(?:"?[a-zA-Z0-9]{1,8}"?(?: (?:on|off|-?\d+))?(?:, ?)?)+$/.test(text)) return "";
  return text;
}

/** Characters a `font-feature-settings` value cannot contain. */
var FEATURES_UNSAFE = /[^a-zA-Z0-9"' ,]/g;

/** The widest panel coordinate the position field accepts, in CSS pixels. */
var PANEL_POS_MAX = 5000;

/** The floating panel's default and clamped size, in CSS pixels. */
var PANEL_SIZE_DEFAULT_W = 264;
var PANEL_SIZE_DEFAULT_H = 0;
var PANEL_SIZE_MIN_W = 200;
var PANEL_SIZE_MAX_W = 520;
var PANEL_SIZE_MIN_H = 160;
var PANEL_SIZE_MAX_H = 800;

/** The dot's own diameter, the snap margin, and the click-vs-drag threshold. */
var FLOAT_DOT = 26;
var FLOAT_MARGIN = 16;
var FLOAT_DRAG_THRESHOLD = 6;

/** The window size a page that reports no usable viewport is measured against. */
var FLOAT_VIEWPORT_W = 1024;
var FLOAT_VIEWPORT_H = 768;

/**
 * The smallest rectangle the dot can be snapped inside, in CSS pixels.
 *
 * One snapped dot needs its own diameter PLUS a margin on both sides, so
 * anything smaller is not a region the dot can live in: the candidate is
 * rejected and the next one (the window, last) stands in for it.
 */
var FLOAT_BOUNDS_MIN = FLOAT_DOT + 2 * FLOAT_MARGIN;

/**
 * The air the title keeps beside the round close button, in CSS pixels.
 *
 * The close is out of flow in the card's own top-right corner, so the header
 * carries a plain strip on that side: no per-corner arithmetic, no slot for the
 * dot (the dot is faded out while the card is open, so nothing has to be kept
 * clear for it).
 */
var FLOAT_CLOSE_GAP = 8;

/** The round close button's diameter, in CSS pixels (its stylesheet uses it). */
var FLOAT_CLOSE = 22;

/** How far the close button sits from the card's own corner, in CSS pixels. */
var FLOAT_CLOSE_INSET = 8;

/**
 * The air between the two round buttons in the card's head, in CSS pixels.
 *
 * Both are out of flow and pinned to the card's own top-right corner, so the
 * settings entry sits one diameter plus this gap to the LEFT of the close. It
 * is the same 8px the header already uses between its rows, so the pair reads
 * as one group rather than as two unrelated circles.
 */
var FLOAT_SETTINGS_GAP = 8;

/** The card's own horizontal padding, in CSS pixels (mirrors `.dfp-floatCard`). */
var FLOAT_CARD_PAD = 12;

/** The radius the expanded card rests at, in CSS pixels (`.dfp-floatCard`). */
var FLOAT_CARD_RADIUS = 16;

/* ------------------------------------------------------------------ *
 * reaching the settings screen
 * ------------------------------------------------------------------ */

/**
 * The setting that ships DSH's Plugins screen, as a stable `data-*` attribute.
 *
 * Measured on the shipped builds (0.2.0-rc.2): `ui-settings-plugins` registers
 * its navigation entry with `id: "plugins"` and the settings shell renders each
 * entry as `<button aria-current>`; the alpha line names the same entry
 * `plugins.item` and opens it as a page. The attribute below is the one form a
 * host actually SHIPS, and it is checked first because it is the only one that
 * does not depend on a label's language.
 */
var SETTINGS_NAV_ITEM_ATTR = "data-section";
var SETTINGS_NAV_ITEM_VALUE = "plugins";

/** The attribute the settings shell marks its navigation cells with. */
var SETTINGS_NAV_CURRENT_ATTR = "aria-current";

/** The attribute the sidebar's settings launcher gets: it opens a dialog. */
var SETTINGS_LAUNCHER_HASPOPUP = "dialog";

/** The attribute a plugin's own row ships with, and this plugin's id inside it. */
var PLUGIN_ITEM_ATTR = "data-plugin-item";
var PLUGIN_ITEM_VALUE = "fonttune";

/**
 * Every spelling of this plugin's row, and of the tab that opens its settings.
 *
 * The row is found by its shipped id first (`data-plugin-item="fonttune"`); these
 * labels are the fallback for a host that renders no such attribute, matched
 * case-insensitively by substring so a decorated label still hits.
 */
var PLUGIN_TEXTS = ["字体增强", "font tune", "fonttune"];
var PLUGIN_CONFIG_TEXTS = ["插件配置", "plugin configuration", "plugin config"];

/** What the plugin row and its tab can be, before the predicate narrows it. */
var PLUGIN_ITEM_CANDIDATES = "[data-plugin-item], button, a, li, [role=button], [role=tab], [role=treeitem], [role=option], [role=link]";
var PLUGIN_TAB_CANDIDATES = "button, a, [role=tab], [role=button]";

/**
 * Every spelling of the Plugins navigation entry the supported languages use.
 *
 * A host that names its entry in the DOM ships it as translated text, so the
 * text form is a genuine fallback and not the primary route (see
 * `isSettingsNavItem`). Matched case-insensitively by substring, so a host that
 * decorates the label ("Built-in plugins") still hits.
 */
var SETTINGS_NAV_TEXTS = [
  "插件",
  "Plugins",
  "Plugin",
  "プラグイン",
  "플러그인",
  "Plugins", // de/es/fr/pt all ship "Plugins"; kept explicit for the table's sake
];

/**
 * The names the sidebar's settings launcher answers to, per language.
 *
 * The launcher is the LAST resort: it opens the settings dialog on whichever
 * section was last active, so a caller that lands here still has to be told
 * which cell to pick. It is the only route that cannot fail on a wrong name,
 * because the attribute it is found by (`aria-haspopup="dialog"`) is structural.
 */
var SETTINGS_LAUNCHER_TEXTS = ["设置", "Settings", "設定", "설정", "Einstellungen"];

/**
 * Read an element's own text, tolerating a host without `textContent`.
 * @param {object} node - the candidate element.
 * @returns {string} its text, or "".
 */
function readNodeText(node) {
  if (node === null || node === undefined) return "";
  var text = node.textContent;
  return typeof text === "string" ? text : "";
}

/**
 * Read one attribute, tolerating a host without `getAttribute`.
 * @param {object} node - the candidate element.
 * @param {string} name - the attribute name.
 * @returns {string} its value, or "".
 */
function readNodeAttr(node, name) {
  if (node === null || node === undefined || typeof node.getAttribute !== "function") return "";
  var value = node.getAttribute(name);
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Read an element's classes as a space-separated string.
 * @param {object} node - the candidate element.
 * @returns {string} its classes, or "".
 */
function readNodeClass(node) {
  if (node === null || node === undefined) return "";
  var name = node.className;
  return typeof name === "string" ? name : "";
}

/**
 * Whether one element is a settings navigation cell that opens the Plugins
 * screen.
 *
 * Two host shapes are accepted, in the order they can be trusted:
 *  1. the entry's OWN id, rendered as a `data-section="plugins"` attribute
 *     (the settings shell's list of `settings.section` entries);
 *  2. the entry's translated label, read from a cell the shell marked with
 *     `aria-current` — the same attribute the shell puts on every cell it
 *     renders, so an unrelated button cannot match by accident.
 * @param {object} node - the candidate element.
 * @returns {boolean} whether it is the Plugins cell.
 */
function isSettingsNavItem(node) {
  if (node === null || node === undefined || typeof node !== "object") return false;
  if (readNodeAttr(node, SETTINGS_NAV_ITEM_ATTR) === SETTINGS_NAV_ITEM_VALUE) return true;
  if (readNodeAttr(node, SETTINGS_NAV_CURRENT_ATTR) === "") return false;
  var text = readNodeText(node).trim().toLowerCase();
  if (text === "") return false;
  for (var index = 0; index < SETTINGS_NAV_TEXTS.length; index += 1) {
    if (text.indexOf(SETTINGS_NAV_TEXTS[index].toLowerCase()) >= 0) return true;
  }
  return false;
}

/**
 * Whether one element is THIS plugin's own row in the Plugins list.
 *
 * The shipped id is checked first — `data-plugin-item="fonttune"` is data the host
 * publishes, so it survives a language change; the translated label is the
 * fallback. Only clickable shapes are accepted, so a heading that merely contains
 * the name cannot swallow the click.
 * @param {object} node - the candidate element.
 * @returns {boolean} whether it is the row to open.
 */
function isPluginEntry(node) {
  if (node === null || node === undefined || typeof node !== "object") return false;
  if (readNodeAttr(node, PLUGIN_ITEM_ATTR) === PLUGIN_ITEM_VALUE) return true;
  var tag = typeof node.tagName === "string" ? node.tagName.toLowerCase() : "";
  var role = readNodeAttr(node, "role").toLowerCase();
  // A bare `li` is NOT clickable, so the text fallback must never accept one:
  // a conversation message that merely QUOTES the plugin's name would become
  // "the entry" and swallow the click (seen on a real page, where the report
  // naming this plugin was the only match on screen).
  if (tag !== "button" && tag !== "a" && role !== "button" && role !== "tab" && role !== "treeitem" && role !== "option" && role !== "link") {
    return false;
  }
  var text = readNodeText(node).trim().toLowerCase();
  if (text === "") return false;
  for (var index = 0; index < PLUGIN_TEXTS.length; index += 1) {
    if (text.indexOf(PLUGIN_TEXTS[index].toLowerCase()) >= 0) return true;
  }
  return false;
}

/** The package name the host's own navigation service opens for this plugin. */
var PLUGIN_BUNDLE_NAME = "dsh-fonttune";

/** The main panel id the Plugins page lives in (what `layout.selectPanel` takes). */
var PLUGIN_PANEL_ID = "plugins";

/**
 * Whether a node sits inside this plugin's own floating panel.
 *
 * The panel can carry the plugin's own name, and a lookup that mistakes it for
 * a host entry would click ourselves.
 * @param {object} node - the candidate element.
 * @returns {boolean} true when the node is ours, not the host's.
 */
function isOwnPanelNode(node) {
  if (node === null || node === undefined) return true;
  try {
    return typeof node.closest === "function" && node.closest(".dfp-floatHost") !== null;
  } catch (error) {
    return false;
  }
}

/**
 * THIS plugin's own card on the host's Plugins page, or null.
 *
 * The Plugins page publishes every entry as `data-plugin-item="<id>"` and this
 * plugin's registration id is `fonttune`: the attribute is host-published data,
 * so the lookup survives a language change and can never match a sentence that
 * merely names the plugin.
 * @param {object} doc - the document to search (a stub is fine).
 * @returns {object|null} the card element, or null.
 */
function pluginEntryCard(doc) {
  if (doc === null || doc === undefined || typeof doc.querySelector !== "function") return null;
  var card = null;
  try {
    card = doc.querySelector("[" + PLUGIN_ITEM_ATTR + '="' + PLUGIN_ITEM_VALUE + '"]');
  } catch (error) {
    return null;
  }
  if (card === null || card === undefined) return null;
  return isOwnPanelNode(card) ? null : card;
}

/**
 * The element that actually opens a plugin's page from its entry card.
 *
 * The card itself is a list item with no handler of its own; the host renders
 * the title button inside it as the open gesture, and that button is the first
 * one the card carries. A node that is already the clickable is returned as-is.
 * @param {object} node - the card, or a clickable candidate.
 * @returns {object|null} the element to click, or null.
 */
function pluginClickTarget(node) {
  if (node === null || node === undefined) return null;
  var tag = typeof node.tagName === "string" ? node.tagName.toLowerCase() : "";
  var role = readNodeAttr(node, "role").toLowerCase();
  if (tag === "button" || tag === "a" || role === "button" || role === "tab" || role === "link") return node;
  var buttons = typeof node.querySelectorAll === "function" ? node.querySelectorAll("button") : [];
  return buttons.length > 0 ? buttons[0] : null;
}

/**
 * Whether one element opens this plugin's own configuration page inside its row.
 *
 * Optional by design: a host that shows the configuration inline has no such tab,
 * and the caller treats "not found" as success rather than as a failure.
 * @param {object} node - the candidate element.
 * @returns {boolean} whether it is the configuration tab.
 */
function isPluginConfigTab(node) {
  if (node === null || node === undefined || typeof node !== "object") return false;
  var text = readNodeText(node).trim().toLowerCase();
  if (text === "") return false;
  for (var index = 0; index < PLUGIN_CONFIG_TEXTS.length; index += 1) {
    if (text.indexOf(PLUGIN_CONFIG_TEXTS[index].toLowerCase()) >= 0) return true;
  }
  return false;
}

/**
 * Whether one element is the sidebar's settings launcher.
 *
 * Structural, not textual: DSH's shell renders it as a button whose
 * `aria-haspopup` is `dialog`. Its label only has to CONFIRM the reading, so a
 * host that renames the section list still opens the dialog, and a random
 * `aria-haspopup="dialog"` button (a menu elsewhere on the page) is rejected by
 * the label rather than by position.
 * @param {object} node - the candidate element.
 * @returns {boolean} whether it is the settings launcher.
 */
function isSettingsLauncher(node) {
  if (node === null || node === undefined || typeof node !== "object") return false;
  if (readNodeAttr(node, "aria-haspopup") !== SETTINGS_LAUNCHER_HASPOPUP) return false;
  var label = (readNodeAttr(node, "aria-label") || readNodeAttr(node, "title") || readNodeText(node))
    .trim()
    .toLowerCase();
  if (label === "") return false;
  for (var index = 0; index < SETTINGS_LAUNCHER_TEXTS.length; index += 1) {
    if (label.indexOf(SETTINGS_LAUNCHER_TEXTS[index].toLowerCase()) >= 0) return true;
  }
  return false;
}

/**
 * Hand a synthetic event to a node, reporting whether the host took it.
 *
 * `cancelable` matters: a host may `preventDefault` the event to mark it as
 * consumed, and that is the only acknowledgement available here.
 * @param {object} node - the element to dispatch on.
 * @param {string} type - the event type.
 * @returns {boolean} whether the host ran without throwing.
 */
function dispatchSynthetic(node, type) {
  if (node === null || node === undefined || typeof node.dispatchEvent !== "function") return false;
  var win = typeof globalThis !== "undefined" ? globalThis : null;
  var View = win !== null && win.MouseEvent !== undefined ? win.MouseEvent : null;
  var event = null;
  try {
    event = View !== null
      ? new View(type, { bubbles: true, cancelable: true, view: win })
      : { type: type, bubbles: true, cancelable: true, defaultPrevented: false, preventDefault: function () {} };
  } catch (error) {
    event = { type: type, bubbles: true, cancelable: true, defaultPrevented: false, preventDefault: function () {} };
  }
  try {
    node.dispatchEvent(event);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Resolve the shortest route to DSH's Plugins settings screen — or null.
 *
 * The panel's settings button must not guess at a fragile long selector, and it
 * must not throw when the host is not there at all (the memory scope, a host
 * line this package no longer supports, a page rendered before the shell
 * mounted). So the lookup is a list of NARROWED plans, each with the evidence
 * it rests on, and a `run` that performs the step:
 *
 *  1. `section-attr` — the Plugins cell, found by the entry's own id rendered as
 *     a `data-*` attribute. Stable by construction: it is data the host
 *     publishes, not text it translates.
 *  2. `section-text` — the same cell found by its translated label among the
 *     cells the shell marked `aria-current="true"`. Same click, weaker key; it
 *     is what a host that renders no per-entry attribute needs.
 *  3. `launcher` — no cell yet, so the sidebar's settings launcher is clicked
 *     first and the cell is looked for again on a later frame. The caller hands
 *     the retry in as `retry`, so this function stays pure about the DOM it can
 *     see right now.
 *
 * Every step is a plain `click()`, which is what a user does; nothing here pokes
 * at a framework's internals, and nothing depends on element coordinates.
 *
 * @param {object} doc - the document to search (a stub is fine).
 * @param {{retry?: (select: Function) => boolean}} [options] - retry runner.
 * @returns {{kind: string, why: string, node: object, run: Function}|null} the plan, or null.
 */
function findSettingsEntry(doc, options) {
  if (doc === null || doc === undefined || typeof doc !== "object") return null;
  var settings = options !== null && typeof options === "object" ? options : {};
  var all = function () {
    var found = typeof doc.querySelectorAll === "function" ? doc.querySelectorAll("button") : null;
    return found === null || found === undefined ? [] : found;
  };
  var first = function (predicate) {
    var nodes = all();
    for (var index = 0; index < nodes.length; index += 1) {
      if (predicate(nodes[index])) return nodes[index];
    }
    return null;
  };
  var cellWithAttr = function () {
    return first(function (node) {
      return readNodeAttr(node, SETTINGS_NAV_ITEM_ATTR) === SETTINGS_NAV_ITEM_VALUE;
    });
  };
  var cellByText = function () {
    return first(function (node) {
      return readNodeAttr(node, SETTINGS_NAV_CURRENT_ATTR) !== "" && isSettingsNavItem(node);
    });
  };
  var launcher = function () {
    return first(isSettingsLauncher);
  };
  // The plugin row and its configuration tab are not necessarily `button`s, so the
  // search is by shape instead of by tag alone.
  var firstIn = function (selector, predicate) {
    var nodes = typeof doc.querySelectorAll === "function" ? doc.querySelectorAll(selector) : [];
    for (var index = 0; index < nodes.length; index += 1) {
      if (predicate(nodes[index])) return nodes[index];
    }
    return null;
  };
  var pluginEntry = function () {
    var found = firstIn(PLUGIN_ITEM_CANDIDATES, function (node) {
      // Our own floating panel may carry the plugin's own name; never click ourselves.
      try {
        if (typeof node.closest === "function" && node.closest(".dfp-floatHost") !== null) return false;
      } catch (error) {
        // A node without closest cannot be ours anyway.
      }
      return isPluginEntry(node);
    });
    if (found === null) return null;
    // The entry card is a list item with no handler of its own: the click lands
    // on the title button the host renders inside it.
    return pluginClickTarget(found) || found;
  };
  var pluginConfigTab = function () {
    return firstIn(PLUGIN_TAB_CANDIDATES, isPluginConfigTab);
  };
  // A plan that just clicks the cell it names.
  var sectionPlan = function (kind, why, node) {
    return {
      kind: kind,
      why: why,
      node: node,
      run: function () {
        return dispatchSynthetic(node, "click");
      },
    };
  };
  /**
   * Give a plan the tail every route shares: open the Plugins cell, then THIS
   * plugin's own row inside it, then its configuration tab when the host has one.
   *
   * The row mounts one commit after the cell, so the waiting belongs to the
   * caller's `retry` runner and this function stays pure about what it can see.
   * A host with no separate tab is normal, not a failure: the row click is the
   * answer in that case.
   * @param {object} plan - a plan that opens the Plugins screen.
   * @returns {object} the same plan with the tail attached.
   */
  var withPluginEntry = function (plan) {
    var opened = plan.run;
    plan.run = function () {
      var reached = opened();
      if (typeof settings.retry !== "function") return reached;
      var entry = settings.retry(pluginEntry);
      if (entry === null) return reached;
      return settings.retry(pluginConfigTab) || entry;
    };
    return plan;
  };
  // The plugin's own settings may be its own SIDEBAR entry — a page of its own,
  // not a section of the settings dialog. When the shell publishes one, clicking
  // it opens the configuration directly and there is no settings route to walk.
  // The user's host lists the plugin in the sidebar, and this is that entry.
  var sidebarEntry = pluginEntry();
  if (sidebarEntry !== null) {
    return {
      kind: "sidebar-entry",
      why: "the plugin ships its own entry; it opens the configuration directly",
      node: sidebarEntry,
      run: function () {
        return dispatchSynthetic(sidebarEntry, "click");
      },
    };
  }
  var canonical = cellWithAttr();
  if (canonical !== null) {
    return withPluginEntry(
      sectionPlan("section-attr", "the Plugins entry ships its own id as a data attribute", canonical)
    );
  }
  var byText = cellByText();
  if (byText !== null) {
    return withPluginEntry(
      sectionPlan("section-text", "the Plugins entry was matched by its translated label", byText)
    );
  }
  var opener = launcher();
  if (opener === null) return null;
  return withPluginEntry({
    kind: "launcher",
    why: "only the sidebar's settings launcher is on screen; the entry is picked after it opens",
    node: opener,
    run: function () {
      var reached = dispatchSynthetic(opener, "click");
      if (typeof settings.retry !== "function") return reached;
      return settings.retry(cellWithAttr) || settings.retry(cellByText) || reached;
    },
  });
}

/**
 * Normalize the floating panel's stored position.
 * @param {unknown} value - candidate `"x,y"` text.
 * @returns {string} the normalized `"x,y"` text, or "" when unusable.
 */
function normalizePanelPos(value) {
  if (typeof value !== "string") return "";
  var parts = value.trim().split(",");
  if (parts.length !== 2) return "";
  var x = Math.round(Number(parts[0]));
  var y = Math.round(Number(parts[1]));
  if (!isFinite(x) || !isFinite(y)) return "";
  x = Math.min(PANEL_POS_MAX, Math.max(0, x));
  y = Math.min(PANEL_POS_MAX, Math.max(0, y));
  return x + "," + y;
}

/**
 * Read the floating panel's stored position for placement.
 * @param {unknown} value - candidate `"x,y"` text.
 * @returns {{x: number, y: number}|null} the coordinates, or null when unset.
 */
function parsePanelPos(value) {
  var text = normalizePanelPos(value);
  if (text === "") return null;
  var parts = text.split(",");
  return { x: Number(parts[0]), y: Number(parts[1]) };
}

/**
 * Normalize the floating panel's remembered corner.
 * @param {unknown} value - candidate corner name.
 * @returns {string} one of `PANEL_CORNERS`, or "" when it names none.
 */
function normalizePanelCorner(value) {
  if (typeof value !== "string") return "";
  var text = value.trim().toLowerCase();
  return PANEL_CORNERS.indexOf(text) >= 0 ? text : "";
}

/**
 * Read the floating panel's remembered corner for placement.
 * @param {unknown} value - candidate corner name.
 * @returns {string|null} the corner, or null when the document names none (an
 *   older document, or one nothing has settled yet).
 */
function parsePanelCorner(value) {
  var text = normalizePanelCorner(value);
  return text === "" ? null : text;
}

/**
 * Normalize the floating panel's stored size.
 *
 * A height of 0 means "auto" (the card sizes to its content); any other
 * height clamps into the resizable window, like the width always does.
 * @param {unknown} value - candidate `"w,h"` text.
 * @returns {string} the normalized `"w,h"` text, or "" when unusable.
 */
function normalizePanelSize(value) {
  if (typeof value !== "string") return "";
  var parts = value.trim().split(",");
  if (parts.length !== 2) return "";
  var w = Math.round(Number(parts[0]));
  var h = Math.round(Number(parts[1]));
  if (!isFinite(w) || !isFinite(h)) return "";
  w = Math.min(PANEL_SIZE_MAX_W, Math.max(PANEL_SIZE_MIN_W, w));
  if (h !== 0) h = Math.min(PANEL_SIZE_MAX_H, Math.max(PANEL_SIZE_MIN_H, h));
  return w + "," + h;
}

/**
 * Read the floating panel's stored size for layout.
 * @param {unknown} value - candidate `"w,h"` text.
 * @returns {{w: number, h: number}|null} the size, or null when unset.
 */
function parsePanelSize(value) {
  var text = normalizePanelSize(value);
  if (text === "") return null;
  var parts = text.split(",");
  return { w: Number(parts[0]), h: Number(parts[1]) };
}

/**
 * One rectangle as four finite edges, in viewport coordinates.
 *
 * A DOMRect, a plain box and anything in between is accepted; the width and
 * height are optional, because a DOMRect always carries `right`/`bottom` while a
 * hand-built box usually carries `width`/`height` instead.
 * @param {unknown} rect - the value to read.
 * @returns {{left: number, top: number, right: number, bottom: number}|null} the
 *   box, or null when the value holds no usable rectangle.
 */
function floatBoxOf(rect) {
  if (rect === null || typeof rect !== "object") return null;
  var left = Number(rect.left);
  var top = Number(rect.top);
  var right = rect.right === undefined ? left + Number(rect.width) : Number(rect.right);
  var bottom = rect.bottom === undefined ? top + Number(rect.height) : Number(rect.bottom);
  if (!isFinite(left) || !isFinite(top) || !isFinite(right) || !isFinite(bottom)) return null;
  return { left: left, top: top, right: right, bottom: bottom };
}

/**
 * The rectangle the dot snaps to, drags within and reads its own quadrant from.
 *
 * The dot belongs INSIDE the conversation, not on the chrome around it: with a
 * sidebar on either side and a top bar, the window's four corners sit on bars the
 * user never wanted a control on. The caller therefore hands in its candidates in
 * priority order — the scroll container the conversation lives in first, the
 * prose element itself second — and the first one that is a usable region wins.
 *
 * A candidate is usable when, after being CLIPPED to the viewport, it is at least
 * `FLOAT_BOUNDS_MIN` on both axes: a container that hangs off the screen would
 * otherwise snap the dot to a corner nobody can reach, and one smaller than the
 * dot cannot hold it at all. Nothing usable (a settings page has no conversation
 * at all) falls back to the whole window, which is what the panel did before.
 *
 * The WINNING CANDIDATE is reported alongside the bounds, not only the numbers:
 * "which rectangle is the region" and "which element's size change means the
 * region changed" are one question, and the caller that watches for a region
 * change has to ask it the same way (see `regionElement` in the client half).
 * @param {Array<unknown>} rects - candidate rectangles, best first.
 * @param {{width: number, height: number}} viewport - the window size.
 * @returns {{index: number, bounds: {left: number, top: number, right: number,
 *   bottom: number, width: number, height: number}}} the index of the rectangle
 *   the region was taken from (-1 when the whole window stands in) and the
 *   bounds, in viewport coordinates.
 */
function floatBoundsPick(rects, viewport) {
  var vw = viewport === null || viewport === undefined ? NaN : Number(viewport.width);
  var vh = viewport === null || viewport === undefined ? NaN : Number(viewport.height);
  if (!isFinite(vw) || vw <= 0) vw = FLOAT_VIEWPORT_W;
  if (!isFinite(vh) || vh <= 0) vh = FLOAT_VIEWPORT_H;
  var full = { left: 0, top: 0, right: vw, bottom: vh, width: vw, height: vh };
  var list = Array.isArray(rects) ? rects : [];
  for (var index = 0; index < list.length; index += 1) {
    var box = floatBoxOf(list[index]);
    if (box === null) continue;
    var left = Math.max(0, Math.min(vw, box.left));
    var top = Math.max(0, Math.min(vh, box.top));
    var right = Math.max(0, Math.min(vw, box.right));
    var bottom = Math.max(0, Math.min(vh, box.bottom));
    var width = right - left;
    var height = bottom - top;
    if (width < FLOAT_BOUNDS_MIN || height < FLOAT_BOUNDS_MIN) continue;
    return {
      index: index,
      bounds: { left: left, top: top, right: right, bottom: bottom, width: width, height: height },
    };
  }
  return { index: -1, bounds: full };
}

/**
 * The bounds alone, for every caller that only draws with them.
 * @param {Array<unknown>} rects - candidate rectangles, best first.
 * @param {{width: number, height: number}} viewport - the window size.
 * @returns {{left: number, top: number, right: number, bottom: number,
 *   width: number, height: number}} the bounds, in viewport coordinates.
 */
function floatBoundsFrom(rects, viewport) {
  return floatBoundsPick(rects, viewport).bounds;
}

/**
 * Whether a second reading of the winning rectangle is the same shape as the last.
 *
 * The fallback watcher asks this every tick and nothing else, so it is stated on
 * FOUR numbers — the two edges — and never on anything derived from them. A caller
 * that re-read the region, resolved styles or compared a `width`/`height` pair as
 * well would be doing work the question does not need, twice a second, on a page
 * that is usually not moving at all.
 *
 * A rectangle that could not be read (null, or absent) is never the same shape as
 * anything: an unreadable region is a change, not a confirmation.
 * @param {object|null} a - the rectangle read last time.
 * @param {object|null} b - the rectangle read now.
 * @returns {boolean} true when both readings name one and the same box.
 */
function sameWatchBounds(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

/**
 * Whether every box an observer is holding is still in the document.
 *
 * An observer holds a NODE, and a node the host replaced (a re-render swapping the
 * conversation element, a session switch) is detached: it keeps its size forever
 * and never reports again. So a target list may look unchanged and still be a list
 * that has to be resolved anew — which is the whole reason the body is watched
 * alongside it (see `watchRegion` in the client half).
 * @param {object} doc - the document to ask (`document`, in the client half).
 * @param {Array<object>} targets - the boxes currently observed.
 * @returns {boolean} true when nothing in the list was taken out of the tree.
 */
function floatTargetsConnected(doc, targets) {
  if (doc === null || doc === undefined || typeof doc.contains !== "function") return true;
  if (Array.isArray(targets) === false) return true;
  try {
    for (var index = 0; index < targets.length; index += 1) {
      if (doc.contains(targets[index]) === false) return false;
    }
  } catch (error) {
    return true;
  }
  return true;
}

/**
 * Which quadrant a point sits in, measured inside the bounds it lives in.
 *
 * The bounds matter: the expand direction is decided by the edges the dot is
 * NEAREST, and NEAREST is a question about the conversation — the region's own
 * middle, not the window's. Ties fall left/top.
 * @param {unknown} bounds - the region, as `floatBoundsFrom` returns it.
 * @param {number} x - CSS pixels from the left.
 * @param {number} y - CSS pixels from the top.
 * @returns {string} one of "tl", "tr", "bl", "br".
 */
function floatQuadrantIn(bounds, x, y) {
  var box = floatBoxOf(bounds);
  if (box === null) box = { left: 0, top: 0, right: FLOAT_VIEWPORT_W, bottom: FLOAT_VIEWPORT_H };
  var left = x < (box.left + box.right) / 2;
  var top = y < (box.top + box.bottom) / 2;
  if (left && top) return "tl";
  if (!left && top) return "tr";
  if (left && !top) return "bl";
  return "br";
}

/**
 * Which viewport quadrant a point sits in (ties fall left/top).
 * @param {number} x - CSS pixels from the left.
 * @param {number} y - CSS pixels from the top.
 * @param {number} vw - viewport width.
 * @param {number} vh - viewport height.
 * @returns {string} one of "tl", "tr", "bl", "br".
 */
function floatQuadrant(x, y, vw, vh) {
  return floatQuadrantIn({ left: 0, top: 0, right: vw, bottom: vh }, x, y);
}

/**
 * Where the panel grows from, given the dot's quadrant: always away from
 * the nearest edges, so the card lands inside the viewport.
 * @param {string} quadrant - one of "tl", "tr", "bl", "br".
 * @returns {string} one of "right-down", "left-down", "right-up", "left-up".
 */
function floatExpandDirection(quadrant) {
  if (quadrant === "tl") return "right-down";
  if (quadrant === "tr") return "left-down";
  if (quadrant === "bl") return "right-up";
  return "left-up";
}

/**
 * The expand animation's origin corner, on the dot's side.
 * @param {string} quadrant - one of "tl", "tr", "bl", "br".
 * @returns {string} a CSS `transform-origin` value.
 */
function floatTransformOrigin(quadrant) {
  if (quadrant === "tl") return "0 0";
  if (quadrant === "tr") return "100% 0";
  if (quadrant === "bl") return "0 100%";
  return "100% 100%";
}

/**
 * Which corner of the card lands on the dot, and where the expansion starts.
 *
 * The card's nearest corner COINCIDES with the dot's own corner: the open card
 * is clipped, at the first frame, down to exactly the dot's rectangle, so the
 * panel reads as the dot unfolded rather than as a second object. The shared
 * corner is also the expand animation's origin, so the card grows toward the
 * opposite corner and shrinks back into the dot on the way out.
 * @param {string} quadrant - one of "tl", "tr", "bl", "br".
 * @returns {{h: string, v: string, origin: string}} the anchored edges (CSS
 *   sides, always "0") and the `transform-origin` on that shared corner.
 */
function floatCardAnchor(quadrant) {
  var left = quadrant === "tl" || quadrant === "bl";
  var top = quadrant === "tl" || quadrant === "tr";
  return {
    h: left ? "left" : "right",
    v: top ? "top" : "bottom",
    origin: floatTransformOrigin(quadrant),
  };
}

/**
 * The clip-path the card's expand starts from — and its collapse ends on.
 *
 * The card is anchored on the dot's own corner, so the dot's rectangle inside
 * the card is `dot` by `dot` pixels flush with that corner. Clipping the card
 * down to it gives the "small rounded rectangle" the panel unfolds out of; the
 * animation then carries the same four lengths to zero, which is what makes the
 * panel LOOK like it grows instead of merely fading in. The radius is the dot's
 * own (half its diameter), so the first frame reads as the dot's circle.
 * @param {number} width - the card's border-box width, in CSS pixels.
 * @param {number} height - the card's border-box height, in CSS pixels.
 * @param {string} quadrant - one of "tl", "tr", "bl", "br".
 * @param {number} [dot] - the dot's diameter (defaults to FLOAT_DOT).
 * @returns {string} a CSS `inset()` clip-path.
 */
function floatClipStart(width, height, quadrant, dot) {
  var size = dot === undefined ? FLOAT_DOT : dot;
  var anchor = floatCardAnchor(quadrant);
  var w = Math.max(0, Math.round(width));
  var h = Math.max(0, Math.round(height));
  var far = Math.max(0, w - size);
  var low = Math.max(0, h - size);
  var top = anchor.v === "top" ? 0 : low;
  var right = anchor.h === "left" ? far : 0;
  var bottom = anchor.v === "top" ? low : 0;
  var left = anchor.h === "left" ? 0 : far;
  return (
    "inset(" + top + "px " + right + "px " + bottom + "px " + left +
    "px round " + Math.round(size / 2) + "px)"
  );
}

/**
 * The clip-path the expanded card rests at: its own box, its own radius.
 *
 * The four lengths are zero, so nothing is cut away — but the value has to be a
 * real shape rather than `none`, because `none` does not interpolate and the
 * unfold would snap instead of growing. It is therefore only the shape the
 * animation lands ON: the card drops the clip for good once it has arrived
 * (`isRestClip` is how it knows), because clipping the card's own border box a
 * second time — `border-radius` already did it once — multiplies the
 * anti-aliasing along the rounded corners and cuts the card's own shadow away.
 * @returns {string} a CSS `inset()` clip-path.
 */
function floatClipRest() {
  var round = FLOAT_CARD_RADIUS + "px";
  return "inset(0px 0px 0px 0px round " + round + ")";
}

/**
 * Whether a computed `clip-path` has nothing left to cut away.
 *
 * `none` counts, and so does the resting `inset()` the card animates to: its
 * four lengths are zero, which is the element's own border box. Anything that
 * still hides part of the element — a clip in flight, a clip to the dot's
 * rectangle — does not.
 * @param {unknown} value - a computed `clip-path`.
 * @returns {boolean} true when the clip hides nothing.
 */
function isRestClip(value) {
  if (typeof value !== "string") return false;
  var text = value.trim();
  if (text === "" || text === "none" || text === "auto") return true;
  var shape = /^inset\(([^)]*)\)$/.exec(text);
  if (shape === null) return false;
  var halves = shape[1].split("round");
  var found = halves[0].match(/-?\d+(?:\.\d+)?/g);
  if (found === null) return false;
  var values = found.map(Number);
  if (values.length > 4) return false;
  // CSS repeats the shorter lists: 1 -> all four, 2 -> vertical/horizontal,
  // 3 -> top/horizontal/bottom.
  var four;
  if (values.length === 1) four = [values[0], values[0], values[0], values[0]];
  else if (values.length === 2) four = [values[0], values[1], values[0], values[1]];
  else if (values.length === 3) four = [values[0], values[1], values[2], values[1]];
  else four = values;
  for (var index = 0; index < four.length; index += 1) {
    if (Math.abs(four[index]) > 0.5) return false;
  }
  if (halves.length < 2) return true;
  var round = halves[1].match(/-?\d+(?:\.\d+)?/g);
  if (round === null) return false;
  return Math.abs(Number(round[0]) - FLOAT_CARD_RADIUS) <= 0.5;
}

/**
 * The four snapped corners of a region, as the one box they are laid out in.
 *
 * The margin is inward from the region's own edges and the dot's diameter is
 * held clear of the far ones, so a corner of this box is where a dot of that
 * size REST on that corner of the region. Everything about corners — which one
 * is nearest, and where a named one is — is read from these four numbers, so the
 * two questions can never disagree.
 * @param {unknown} bounds - the region, as `floatBoundsFrom` returns it.
 * @param {number} [dot] - the dot's diameter (defaults to FLOAT_DOT).
 * @param {number} [margin] - the edge margin (defaults to FLOAT_MARGIN).
 * @returns {{left: number, top: number, right: number, bottom: number}} the
 *   four edges a snapped dot's top-left may take.
 */
function floatCornersOf(bounds, dot, margin) {
  var size = dot === undefined ? FLOAT_DOT : dot;
  var gap = margin === undefined ? FLOAT_MARGIN : margin;
  var box = floatBoxOf(bounds);
  if (box === null) box = { left: 0, top: 0, right: FLOAT_VIEWPORT_W, bottom: FLOAT_VIEWPORT_H };
  var left = box.left + Math.max(0, gap);
  var top = box.top + Math.max(0, gap);
  return {
    left: left,
    top: top,
    right: Math.max(left, box.right - gap - size),
    bottom: Math.max(top, box.bottom - gap - size),
  };
}

/**
 * Which of a region's four corners a point is nearest.
 *
 * Measured between the SNAPPED corners, which is the box `floatCornerPoint`
 * places a named corner in: "the nearest corner" and "that corner's position"
 * are then one question with one answer. Ties fall left/top.
 *
 * This is the ONLY way a corner is ever chosen: everywhere else the chosen one
 * is read back from the document (see `PANEL_CORNER_FIELD`), because a region
 * that changed shape must move the dot to its own corner rather than let the
 * old region's coordinates pick a different one.
 * @param {unknown} bounds - the region, as `floatBoundsFrom` returns it.
 * @param {number} x - CSS pixels from the left.
 * @param {number} y - CSS pixels from the top.
 * @param {number} [dot] - the dot's diameter (defaults to FLOAT_DOT).
 * @param {number} [margin] - the edge margin (defaults to FLOAT_MARGIN).
 * @returns {string} one of "tl", "tr", "bl", "br".
 */
function floatNearestCorner(bounds, x, y, dot, margin) {
  var edges = floatCornersOf(bounds, dot, margin);
  var left = x < (edges.left + edges.right) / 2;
  var top = y < (edges.top + edges.bottom) / 2;
  if (left && top) return "tl";
  if (!left && top) return "tr";
  if (left && !top) return "bl";
  return "br";
}

/**
 * The coordinates of one NAMED corner of a region, margin and all.
 *
 * This is where the dot's identity becomes a position, and the one place a
 * region change is answered from: whatever happened to the region, a dot that
 * lives in `br` is put back on the new `br`. A name that is not one of the four
 * falls back to `br`, the corner the panel is parked in before anything at all
 * is stored.
 * @param {unknown} bounds - the region, as `floatBoundsFrom` returns it.
 * @param {string} corner - one of "tl", "tr", "bl", "br".
 * @param {number} [dot] - the dot's diameter (defaults to FLOAT_DOT).
 * @param {number} [margin] - the edge margin (defaults to FLOAT_MARGIN).
 * @returns {{x: number, y: number}} the snapped top-left of the dot.
 */
function floatCornerPoint(bounds, corner, dot, margin) {
  var edges = floatCornersOf(bounds, dot, margin);
  var left = corner === "tl" || corner === "bl";
  var top = corner === "tl" || corner === "tr";
  return {
    x: Math.round(left ? edges.left : edges.right),
    y: Math.round(top ? edges.top : edges.bottom),
  };
}

/**
 * Snap a point to the nearest corner of a region, keeping the margin clear.
 *
 * The candidate corners are the BOUNDS' own, so a dot left on the chrome while
 * a sidebar grew is pulled onto the conversation's nearest corner — the same
 * corner the next expand grows away from.
 *
 * Asked when the USER picks a corner (a drag released, a document that names
 * none): everywhere else the corner is remembered rather than re-derived, or a
 * region change would silently re-pick it (`floatNearestCorner`).
 * @param {unknown} bounds - the region, as `floatBoundsFrom` returns it.
 * @param {number} x - CSS pixels from the left.
 * @param {number} y - CSS pixels from the top.
 * @param {number} [dot] - the dot's diameter (defaults to FLOAT_DOT).
 * @param {number} [margin] - the edge margin (defaults to FLOAT_MARGIN).
 * @returns {{x: number, y: number}} the snapped top-left of the dot.
 */
function floatSnapTo(bounds, x, y, dot, margin) {
  return floatCornerPoint(bounds, floatNearestCorner(bounds, x, y, dot, margin), dot, margin);
}

/**
 * Snap a point to the nearest viewport corner, keeping the margin clear.
 * @param {number} x - CSS pixels from the left.
 * @param {number} y - CSS pixels from the top.
 * @param {number} vw - viewport width.
 * @param {number} vh - viewport height.
 * @param {number} [dot] - the dot's diameter (defaults to FLOAT_DOT).
 * @param {number} [margin] - the edge margin (defaults to FLOAT_MARGIN).
 * @returns {{x: number, y: number}} the snapped top-left of the dot.
 */
function floatSnapCorner(x, y, vw, vh, dot, margin) {
  return floatSnapTo({ left: 0, top: 0, right: vw, bottom: vh }, x, y, dot, margin);
}

/**
 * Whether a pointer travel counts as a drag (past the click threshold).
 * @param {number} dx - horizontal travel in CSS pixels.
 * @param {number} dy - vertical travel in CSS pixels.
 * @param {number} [threshold] - the limit (defaults to FLOAT_DRAG_THRESHOLD).
 * @returns {boolean} true when the travel is a drag, not a click.
 */
function floatDragExceeded(dx, dy, threshold) {
  var limit = threshold === undefined ? FLOAT_DRAG_THRESHOLD : threshold;
  return Math.sqrt(dx * dx + dy * dy) > limit;
}

/* ------------------------------------------------------------------ *
 * configuration normalization
 * ------------------------------------------------------------------ */

/** Clamp/validate one field by name (shared by config and value sets). */
function normalizeField(field, value, relative) {
  switch (field) {
    case SANS_FIELD:
    case STACK_DIALOG_FIELD:
    case MONO_FIELD:
      return sanitize(value).slice(0, MAX_STACK_LENGTH);
    case SIZE_FIELD:
    case SIZE_DIALOG_FIELD:
    case CODE_SIZE_FIELD:
      return clampOffset(value);
    case WEIGHT_FIELD:
    case WEIGHT_DIALOG_FIELD:
    case CODE_WEIGHT_FIELD:
      return clampWeightDelta(value, relative);
    case LINE_HEIGHT_FIELD:
    case LINE_HEIGHT_DIALOG_FIELD:
      return clampRatio(value);
    case CODE_LINE_HEIGHT_FIELD:
      return clampLineOffset(value);
    case LIGATURES_FIELD:
      return clampLigatures(value);
    case WEIGHT_OFFSETS_FIELD:
      // The document's own scale marker: false/absent = the pre-relative scale.
      return toBool(value);
    case FEATURES_FIELD:
      return sanitizeFeatures(value);
    case NO_SYNTHETIC_ITALIC_FIELD:
    case NO_SYNTHETIC_BOLD_FIELD:
      return toBool(value);
    case UI_FOLLOWS_FIELD:
      // Absent means the default: the interface follows the conversation.
      return value === undefined || value === null || value === "" ? true : toBool(value);
    case PANEL_ENABLED_FIELD:
      // Absent means the default: the floating dot is shown.
      return value === undefined || value === null || value === "" ? true : toBool(value);
    case PANEL_POS_FIELD:
      return normalizePanelPos(value);
    case PANEL_CORNER_FIELD:
      return normalizePanelCorner(value);
    case PANEL_SIZE_FIELD:
      return normalizePanelSize(value);
    case SMOOTHING_FIELD:
      return clampSmoothing(value);
    default:
      return undefined;
  }
}

/**
 * Normalize a configuration-shaped object coming from the settings document,
 * a config layer, or a test fixture. Storage fields (`darkValues`,
 * `presets`) are decoded and validated here too, so every consumer sees
 * plain data.
 * @param {unknown} value - candidate configuration.
 * @returns {Record<string, string|number|boolean|object|array>} the normalized config.
 */
function normalizeConfig(value) {
  var source = value !== null && typeof value === "object" ? value : {};
  // The scale marker is read BEFORE the axes: it decides whether a weight inside
  // `300…600` is a legacy absolute value or an offset (see `clampWeightDelta`).
  var relative = toBool(source[WEIGHT_OFFSETS_FIELD]);
  var config = {};
  for (var index = 0; index < DURABLE_FIELDS.length; index += 1) {
    var field = DURABLE_FIELDS[index];
    config[field] = normalizeField(field, source[field], relative);
  }
  config[PER_THEME_FIELD] = toBool(source[PER_THEME_FIELD]);
  config[DARK_VALUES_FIELD] = normalizeDarkValues(source[DARK_VALUES_FIELD], relative);
  config[PRESETS_FIELD] = normalizePresets(source[PRESETS_FIELD], relative);
  config[ACTIVE_PRESET_FIELD] = sanitize(source[ACTIVE_PRESET_FIELD]).slice(0, MAX_PRESET_NAME);
  return config;
}

/** Coerce a settings value to a strict boolean; anything unusable is false. */
function toBool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

/**
 * Clamp one size offset to the allowed range, with 0 for anything unusable.
 * @param {unknown} value - candidate offset in px.
 * @returns {number} the offset the stylesheet may use.
 */
function clampOffset(value) {
  var size = Number(value);
  if (!isFinite(size)) return 0;
  return Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, size)));
}

/**
 * Clamp one weight to the allowed range, keeping 0 as "do not touch".
 * @param {unknown} value - candidate weight.
 * @returns {number} the weight the stylesheet may use.
 */
function clampWeight(value) {
  var weight = Number(value);
  if (!isFinite(weight)) return WEIGHT_UNSET;
  weight = Math.round(weight);
  if (weight === WEIGHT_UNSET) return WEIGHT_UNSET;
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, weight));
}

/**
 * Clamp one RELATIVE weight to its allowed range, migrating an absolute value.
 *
 * A document written before the axes became relative stores an absolute weight
 * (`300…600`, `400` = normal) and has no marker, so a value inside `300…600` is
 * converted to its distance from normal (`400 → 0`, `560 → +160`, `300 → −100`).
 * A marked document is on the offset scale already and is never converted — that
 * is what lets an offset grow past `+200` without being mistaken for one of those
 * absolute values (the two windows overlap; see `WEIGHT_OFFSETS_FIELD`).
 *
 * @param {unknown} value - candidate offset, or a pre-0.2.8 absolute weight.
 * @param {boolean} [relative] - true when the document carries the offset marker.
 * @returns {number} the offset the stylesheet may use.
 */
function clampWeightDelta(value, relative) {
  var delta = Number(value);
  if (!isFinite(delta)) return WEIGHT_UNSET;
  delta = Math.round(delta);
  if (relative !== true && delta >= WEIGHT_MIN && delta <= WEIGHT_MAX) delta -= WEIGHT_BASE;
  // The slider's own range comes from the font (see `weightProfileFrom`) and can
  // reach further than the nominal one, so the hard bounds are the widest range
  // any font-derived slider may use.
  if (delta > WEIGHT_DELTA_CEIL) return WEIGHT_DELTA_CEIL;
  if (delta < WEIGHT_DELTA_FLOOR) return WEIGHT_DELTA_FLOOR;
  return delta;
}

/**
 * Clamp one line-height ratio to the allowed percent range.
 * @param {unknown} value - candidate ratio in percent.
 * @returns {number} the integer ratio (100 when unusable).
 */
function clampRatio(value) {
  var ratio = Math.round(Number(value));
  if (!isFinite(ratio)) return LINE_HEIGHT_MIN;
  return Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, ratio));
}

/**
 * Clamp one code line-height offset to the allowed px range.
 * @param {unknown} value - candidate offset in px.
 * @returns {number} the integer offset (0 when unusable).
 */
function clampLineOffset(value) {
  var offset = Math.round(Number(value));
  if (!isFinite(offset) || offset === 0) return 0;
  return Math.min(CODE_LINE_HEIGHT_MAX, Math.max(CODE_LINE_HEIGHT_MIN, offset));
}

/**
 * Clamp one ligature mode to the three known values.
 * @param {unknown} value - candidate mode.
 * @returns {number} 0, 1 or 2.
 */
function clampLigatures(value) {
  var mode = Math.round(Number(value));
  if (!isFinite(mode) || mode <= 0) return LIGATURES_DEFAULT;
  return mode >= LIGATURES_OFF ? LIGATURES_OFF : LIGATURES_ON;
}

/**
 * Clamp one text-rendering preference to the three known values.
 * @param {unknown} value - candidate mode.
 * @returns {string} "auto", "sharp" or "smooth".
 */
function clampSmoothing(value) {
  return typeof value === "string" && SMOOTHING_VALUES.indexOf(value) >= 0 ? value : SMOOTHING_AUTO;
}

/**
 * The stroke-rendering rule one preference asks for, or "".
 *
 * `sharp` keeps the system's crisp subpixel rendering explicit and `smooth`
 * asks for the soft grayscale kind: the same face reads firmer under one and
 * softer under the other. `auto` — and anything unusable — installs no rule at
 * all, so installing this plugin still changes nothing by default.
 * @param {unknown} value - the stored preference.
 * @returns {string} one rule, or "".
 */
function smoothingRule(value) {
  var mode = clampSmoothing(value);
  if (mode === SMOOTHING_SHARP) {
    return "body{-webkit-font-smoothing:subpixel-antialiased !important;-moz-osx-font-smoothing:auto !important}";
  }
  if (mode === SMOOTHING_SMOOTH) {
    return "body{-webkit-font-smoothing:antialiased !important;-moz-osx-font-smoothing:grayscale !important}";
  }
  return "";
}

/**
 * Validate and normalize one sparse axis-value map (dark overrides, presets).
 * Only known axis fields survive, each clamped.
 * @param {unknown} values - candidate map.
 * @returns {Record<string, string|number|boolean>} the safe subset.
 */
function normalizeValueSet(values, relative) {
  var out = {};
  if (values === null || typeof values !== "object" || Array.isArray(values)) return out;
  for (var index = 0; index < VALUE_FIELDS.length; index += 1) {
    var field = VALUE_FIELDS[index];
    if (!Object.prototype.hasOwnProperty.call(values, field)) continue;
    out[field] = normalizeField(field, values[field], relative);
  }
  return out;
}

/**
 * Parse and validate the durable `darkValues` JSON string.
 * @param {unknown} value - candidate JSON text or object.
 * @returns {Record<string, string|number|boolean>} the sparse override map.
 */
function normalizeDarkValues(value, relative) {
  if (typeof value === "string") {
    if (value.trim() === "") return {};
    try {
      value = JSON.parse(value);
    } catch (error) {
      return {};
    }
  }
  return normalizeValueSet(value, relative);
}

/** The three axes that share the weight scale (and its marker). */
var WEIGHT_FIELDS = [WEIGHT_FIELD, WEIGHT_DIALOG_FIELD, CODE_WEIGHT_FIELD];

/**
 * Convert the weight fields of saved preset snapshots to offsets.
 *
 * Runs exactly once per document, right before the card sets
 * `WEIGHT_OFFSETS_FIELD`: a snapshot saved before 0.2.8 holds an absolute weight,
 * and once the document is marked a stored weight is an offset, so applying that
 * snapshot later would read `450` as +450 instead of +50. Converting the snapshots
 * in the same breath as the document keeps the two on one scale.
 *
 * Only values inside the legacy absolute window are touched, so a snapshot that
 * already holds offsets (any 0.3.x one) comes back unchanged and `changed` stays
 * false — the caller then writes nothing.
 *
 * @param {unknown} presets - normalized presets, or anything shaped like them.
 * @returns {{presets: object[], changed: boolean}} the converted list.
 */
function migratePresetWeights(presets) {
  if (!Array.isArray(presets)) return { presets: [], changed: false };
  var changed = false;
  var out = [];
  for (var index = 0; index < presets.length; index += 1) {
    var entry = presets[index];
    if (entry === null || typeof entry !== "object" || entry.values === null) {
      out.push(entry);
      continue;
    }
    var values = entry.values;
    if (typeof values !== "object") {
      out.push(entry);
      continue;
    }
    var converted = null;
    for (var axis = 0; axis < WEIGHT_FIELDS.length; axis += 1) {
      var field = WEIGHT_FIELDS[axis];
      if (!Object.prototype.hasOwnProperty.call(values, field)) continue;
      var stored = Number(values[field]);
      if (!isFinite(stored) || stored < WEIGHT_MIN || stored > WEIGHT_MAX) continue;
      if (converted === null) {
        converted = {};
        for (var key in values) {
          if (Object.prototype.hasOwnProperty.call(values, key)) converted[key] = values[key];
        }
      }
      converted[field] = stored - WEIGHT_BASE;
    }
    if (converted === null) {
      out.push(entry);
      continue;
    }
    changed = true;
    var copy = {};
    for (var name in entry) {
      if (Object.prototype.hasOwnProperty.call(entry, name)) copy[name] = entry[name];
    }
    copy.values = converted;
    out.push(copy);
  }
  return { presets: out, changed: changed };
}

/** The two shapes one locally painted move takes. */
var PENDING_SET = "set";
var PENDING_UNSET = "unset";

/**
 * The preset snapshot op a single axis write implies, as one op — or null.
 *
 * The auto-save contract (an edit with a preset selected IS that preset from
 * now on) belongs to every writer, not just the card: the floating panel
 * confirms through this instead of reimplementing it. A write
 * that would only move `savedAt` builds nothing, for the same reason the
 * card's own path skips it — a whole-document rewrite for a timestamp is a
 * write nobody asked for.
 * @param {object[]} presetList - the stored preset entries.
 * @param {string} activeName - the selected preset's name.
 * @param {Record<string, unknown>} changes - field to value (`undefined`
 *   unsets); only value-axis fields survive.
 * @returns {{op: string, path: string[], value: string}|null} the op, if due.
 */
function mirrorPresetSnapshot(presetList, activeName, changes) {
  if (!Array.isArray(presetList) || typeof activeName !== "string" || activeName === "") return null;
  var entry = null;
  for (var index = 0; index < presetList.length; index += 1) {
    if (presetList[index] !== null && typeof presetList[index] === "object" && presetList[index].name === activeName) {
      entry = presetList[index];
      break;
    }
  }
  if (entry === null) return null;
  var base = entry.values !== null && typeof entry.values === "object" && !Array.isArray(entry.values)
    ? entry.values
    : {};
  var values = {};
  for (var key in base) {
    if (Object.prototype.hasOwnProperty.call(base, key)) values[key] = base[key];
  }
  var changed = false;
  for (var field in changes) {
    if (!Object.prototype.hasOwnProperty.call(changes, field)) continue;
    if (VALUE_FIELDS.indexOf(field) < 0) continue;
    var next = changes[field];
    if (next === undefined) {
      if (Object.prototype.hasOwnProperty.call(values, field)) {
        delete values[field];
        changed = true;
      }
      continue;
    }
    if (values[field] !== next) {
      values[field] = next;
      changed = true;
    }
  }
  if (!changed) return null;
  var list = [];
  for (var at = 0; at < presetList.length; at += 1) {
    if (presetList[at] !== null && typeof presetList[at] === "object" && presetList[at].name === activeName) {
      list.push({ name: activeName, values: values, savedAt: Date.now() });
    } else {
      list.push(presetList[at]);
    }
  }
  return { op: PENDING_SET, path: [PRESETS_FIELD], value: JSON.stringify(list) };
}

/**
 * Merge the values the card painted locally over the document's own values.
 *
 * The card paints a move the moment the user lets go, while the settings document
 * only echoes it after the host's debounced write. Painting the DOCUMENT's value
 * in the meantime would show the previous one again — and an echo of an older move
 * arriving after a newer one would visibly step the page backwards. So the local
 * values win until the document catches up (`reconcilePendingValues` decides when
 * that is).
 *
 * @param {unknown} document - the raw settings value.
 * @param {Record<string, {op: string, value: unknown}>} pending - local moves.
 * @returns {Record<string, unknown>} the values to render with.
 */
function overlayPendingValues(document, pending) {
  var source = document !== null && typeof document === "object" ? document : {};
  var merged = {};
  for (var key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) merged[key] = source[key];
  }
  var local = pending !== null && typeof pending === "object" ? pending : {};
  for (var field in local) {
    if (!Object.prototype.hasOwnProperty.call(local, field)) continue;
    if (local[field].op === PENDING_UNSET) delete merged[field];
    else merged[field] = local[field].value;
  }
  return merged;
}

/**
 * Keep only the local moves that are still worth painting.
 *
 * A paint is deliberately NOT retired when the document agrees with it: the host
 * debounces its writes, so a patch built EARLIER can land after a newer one and
 * drag the document back to an older value. Retiring on agreement made exactly
 * that echo visible — the page jumped back and forth and only ended up right at
 * the end. The card corrects the document instead (its re-assert), and the paint
 * stays until the patience runs out. A refused write is retired by the caller,
 * which learns about it before this rule sees the document again.
 *
 * @param {Record<string, {op: string, value: unknown, at: number}>} pending - local moves.
 * @param {unknown} document - the raw settings value (kept for the caller's shape).
 * @param {number} now - current time in ms.
 * @param {number} patienceMs - how long to keep an unconfirmed move.
 * @returns {Record<string, object>} the entries still worth painting.
 */
function reconcilePendingValues(pending, document, now, patienceMs) {
  var local = pending !== null && typeof pending === "object" ? pending : {};
  var kept = {};
  for (var field in local) {
    if (!Object.prototype.hasOwnProperty.call(local, field)) continue;
    var entry = local[field];
    var stale = typeof entry.at === "number" && now - entry.at > patienceMs;
    if (stale) continue;
    kept[field] = entry;
  }
  return kept;
}

/**
 * Parse and validate the durable `presets` JSON string.
 * @param {unknown} value - candidate JSON text or array.
 * @returns {{name: string, values: object, savedAt: number}[]}
 */
function normalizePresets(value, relative) {
  var list = value;
  if (typeof value === "string") {
    if (value.trim() === "") return [];
    try {
      list = JSON.parse(value);
    } catch (error) {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var index = 0; index < list.length && out.length < MAX_PRESETS; index += 1) {
    var entry = list[index];
    if (entry === null || typeof entry !== "object") continue;
    var name = sanitize(entry.name).slice(0, MAX_PRESET_NAME);
    if (name === "") continue;
    var stamp = Math.round(Number(entry.savedAt));
    out.push({
      name: name,
      values: normalizeValueSet(entry.values, relative),
      savedAt: isFinite(stamp) && stamp > 0 ? stamp : 0,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * stacks
 * ------------------------------------------------------------------ */

/**
 * Format a family list as a CSS font-family value.
 * @param {readonly string[]} families - family names in precedence order.
 * @returns {string} the CSS list, or "" when nothing usable remains.
 */
function formatStack(families) {
  var parts = [];
  for (var index = 0; index < families.length; index += 1) {
    var entry = quoteFamily(families[index]);
    if (entry !== "") parts.push(entry);
  }
  return parts.join(", ");
}

/**
 * Split a CSS font-family value back into family names.
 *
 * Tolerates both quoting styles, missing spaces after commas, and stray
 * whitespace — the value may have been typed by hand or written by an earlier
 * version of the picker.
 * @param {unknown} value - a CSS font-family value.
 * @returns {string[]} the family names, in order, without quotes.
 */
function parseStack(value) {
  if (typeof value !== "string" || value.trim() === "") return [];
  var out = [];
  var current = "";
  var quote = "";
  for (var index = 0; index < value.length; index += 1) {
    var char = value.charAt(index);
    if (quote !== "") {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ",") {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  var families = [];
  for (var index2 = 0; index2 < out.length; index2 += 1) {
    var name = sanitizeFamily(out[index2]);
    if (name === "") continue;
    // A generic keyword quoted by hand ("monospace") is normalized back.
    families.push(name);
  }
  return families;
}

/**
 * Keyword-only family names: they match every script, so they are neither a
 * western nor a CJK slot value.
 * @param {string} name - a family name.
 * @returns {boolean} true for generic keywords.
 */
function isGenericFamilyName(name) {
  var lower = name.toLowerCase();
  return (
    lower === "system-ui" ||
    lower === "sans-serif" ||
    lower === "serif" ||
    lower === "monospace" ||
    lower === "cursive" ||
    lower === "fantasy" ||
    lower === "math" ||
    lower === "emoji" ||
    lower === "fangsong" ||
    lower === "ui-monospace" ||
    lower === "ui-sans-serif" ||
    lower === "ui-serif" ||
    lower === "ui-rounded"
  );
}

/**
 * Name-shaped CJK recognition, used only when the browser cannot measure a
 * family's actual glyph coverage. Deliberately generous: a false "east" on a
 * western font merely means the simple mode shows it in the CJK slot, while a
 * miss would put a CJK family into the western slot where it hurts.
 * @param {string} name - a family name.
 * @returns {boolean} true when the name looks like a CJK family.
 */
function isCJKFamilyName(name) {
  var lower = name.toLowerCase();
  if (
    /(?:yahei|jhenghei|pingfang|hiragino|simsun|simhei|nsimsun|kaiti|fangsong|meiryo|yu ?goth|yu ?minch|ms ?p?(?:gothic|mincho)|noto (?:sans|serif) (?:sc|tc|cjk|jp|kr|hk)|source han|sourcehansc|sourcehanserifc|sarasa|misans|harmonyos|wenquanyi|lxgw|unifont|dengxian)/.test(
      lower
    )
  ) {
    return true;
  }
  return /[\u4e00-\u9fff]/.test(name);
}

/**
 * Set the western slot of a stack: the first entry a classifier counts as
 * non-east. Simple mode binds this to the front of the stack, so a tuned
 * order beyond the two slots is never rearranged.
 * @param {readonly string[]} families - the current stack, in precedence order.
 * @param {string} family - the family to place in the slot.
 * @param {(name: string) => boolean} isEast - CJK classifier.
 * @returns {string[]} the new stack.
 */
function setWestEntry(families, family, isEast) {
  var next = [];
  for (var index = 0; index < families.length; index += 1) {
    if (families[index].toLowerCase() !== family.toLowerCase()) next.push(families[index]);
  }
  for (var index2 = 0; index2 < next.length; index2 += 1) {
    if (!isEast(next[index2])) {
      next[index2] = family;
      return next;
    }
  }
  next.unshift(family);
  return next;
}

/**
 * Set the CJK slot of a stack: the first entry the classifier counts as east,
 * or a new entry right after the western slot — the position CSS semantics
 * need for `western, cjk, ...` to actually route glyphs.
 * @param {readonly string[]} families - the current stack, in precedence order.
 * @param {string} family - the family to place in the slot.
 * @param {(name: string) => boolean} isEast - CJK classifier.
 * @returns {string[]} the new stack.
 */
function setEastEntry(families, family, isEast) {
  var next = [];
  for (var index = 0; index < families.length; index += 1) {
    if (families[index].toLowerCase() !== family.toLowerCase()) next.push(families[index]);
  }
  for (var index2 = 0; index2 < next.length; index2 += 1) {
    if (isEast(next[index2])) {
      next[index2] = family;
      return next;
    }
  }
  var insertAt = 0;
  for (var index3 = 0; index3 < next.length; index3 += 1) {
    if (!isEast(next[index3])) {
      // Right after the western slot: a generic catch-all later in the stack
      // must not shadow the CJK entry.
      insertAt = index3 + 1;
      break;
    }
  }
  next.splice(insertAt, 0, family);
  return next;
}

/**
 * Remove one family wherever it sits in the stack.
 * @param {readonly string[]} families - the current stack.
 * @param {string} family - the family to remove.
 * @returns {string[]} the new stack.
 */
function removeStackEntry(families, family) {
  var next = [];
  for (var index = 0; index < families.length; index += 1) {
    if (families[index].toLowerCase() !== family.toLowerCase()) next.push(families[index]);
  }
  return next;
}

/* ------------------------------------------------------------------ *
 * scaling helpers
 * ------------------------------------------------------------------ */

/**
 * Compute the uniform scale a pixel offset produces over DSH's 16px base.
 *
 * Scaling by one ratio is what keeps a size change proportional: every design
 * token that carries a size or a line height rides the same factor, so nothing
 * compounds through nesting and no element ends up with a size its own line
 * height does not expect.
 * @param {number} sizeOffset - offset in px.
 * @param {number} [base=16] - the px size the ratio is taken against.
 * @returns {number} the scale factor (1 when the offset is 0).
 */
function scaleFor(sizeOffset, base) {
  var offset = Number(sizeOffset);
  if (!isFinite(offset) || offset === 0) return 1;
  var reference = typeof base === "number" && base > 0 ? base : 16;
  var scale = (reference + offset) / reference;
  return scale < 0.5 ? 0.5 : scale > 2 ? 2 : scale;
}

/**
 * Round to a fixed number of decimals so generated CSS stays readable.
 * @param {number} value - the number.
 * @param {number} digits - decimals to keep.
 * @returns {number} the rounded number.
 */
function round(value, digits) {
  var factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

/**
 * Values a ratio may multiply: a number with a unit, a bare number, or an
 * expression. A keyword (`unset`, `inherit`) or an unrecognized shape is left
 * alone instead of being wrapped into an invalid `calc()`.
 */
var SCALABLE_VALUE = /^(?:[+-]?(?:\d|\.\d)|calc\(|var\(|min\(|max\(|clamp\()/;

/**
 * Whether one token value can be multiplied by a scale factor.
 * @param {string} value - the token's untouched value.
 * @returns {boolean} true when `calc((value) * scale)` is meaningful.
 */
function isScalableValue(value) {
  return typeof value === "string" && SCALABLE_VALUE.test(value.trim());
}

/**
 * Scale one set of SIZE tokens by one ratio.
 *
 * A base that itself references another token via var() derives from it:
 * scaling the var target already scales this one, so re-scaling here would
 * compound (markdown-base = var(--dsh-content-font-size) would take the ratio
 * twice). DSH's chain does the work instead.
 *
 * `!important` is required: the theme writes `--dsh-content-font-size` INLINE
 * on body, and an inline declaration outranks a plain stylesheet one —
 * without the flag body itself would keep DSH's own size while every
 * descendant scales, splitting the page in two.
 *
 * @param {string[]} names - token names to re-declare.
 * @param {Record<string, string>} baseTokens - token name to untouched value.
 * @param {number} scale - the ratio to apply.
 * @returns {string[]} declarations.
 */
function scaleTokens(names, baseTokens, scale) {
  var out = [];
  for (var index = 0; index < names.length; index += 1) {
    var name = names[index];
    var base = baseTokens[name];
    if (typeof base !== "string" || base === "") continue;
    if (base.indexOf("var(") !== -1) continue;
    if (!isScalableValue(base)) continue;
    out.push(name + ":calc((" + base + ") * " + scale + ") !important");
  }
  return out;
}

/**
 * Scale one set of LINE-HEIGHT tokens by one factor.
 *
 * Unlike sizes, a line height never chains through another line height in
 * DSH's theme (heights are literals or `calc(Npx + size-delta)`), so var()
 * values are wrapped rather than skipped — the wrap keeps the var chain
 * resolving at use time and cannot compound.
 * @param {string[]} names - token names to re-declare.
 * @param {Record<string, string>} baseTokens - token name to untouched value.
 * @param {number} factor - the ratio to apply.
 * @returns {string[]} declarations.
 */
function scaleLineTokens(names, baseTokens, factor) {
  var out = [];
  for (var index = 0; index < names.length; index += 1) {
    var name = names[index];
    var base = baseTokens[name];
    if (typeof base !== "string" || base === "") continue;
    if (!isScalableValue(base)) continue;
    out.push(name + ":calc((" + base + ") * " + factor + ") !important");
  }
  return out;
}

/**
 * Shift one set of tokens by an additive px amount.
 * @param {string[]} names - token names to re-declare.
 * @param {Record<string, string>} baseTokens - token name to untouched value.
 * @param {number} offset - the px amount to add.
 * @returns {string[]} declarations.
 */
function shiftTokens(names, baseTokens, offset) {
  var out = [];
  // Zero is the neutral value of every additive axis: emitting `calc((14px) + 0px)`
  // would be a real declaration that disagrees with `isDormant` and with an
  // otherwise identical configuration, so the guard lives here too, not only at
  // the call sites.
  if (offset === 0) return out;
  for (var index = 0; index < names.length; index += 1) {
    var name = names[index];
    var base = baseTokens[name];
    if (typeof base !== "string" || base === "") continue;
    if (!isScalableValue(base)) continue;
    out.push(name + ":calc((" + base + ") + " + offset + "px) !important");
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * `font` shorthand parsing
 * ------------------------------------------------------------------ */

/**
 * The family reference every DSH `font` shorthand ends with. Markdown tokens
 * chain to the sans variable, code tokens to the code variable.
 */
var FAMILY_REFS = ["var(--dsw-font-family)", "var(--ds-font-family-code)"];

/**
 * Parse one `font` shorthand into its parts.
 *
 * DSH's shorthands come in four shapes, all ending in a family var():
 * `11px/19px var(--ds-font-family-code)` (code),
 * `var(--dsh-content-font-size,14px) / calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)` (base),
 * `700 calc(21px + var(...)) / calc(30px + var(...)) var(--dsw-font-family)` (h1),
 * `italic 600 var(...) / calc(...) var(--dsw-font-family)` (strong-italic).
 *
 * Because the size expression may itself contain `var(...)`, the split keys
 * off the family reference (found from the right) and the `/`, never off
 * whitespace inside `calc()`.
 * @param {string} value - a `font` shorthand value.
 * @returns {{lead: string, size: string, height: string, family: string}|null} the parts, or null when the shape differs.
 */
function parseShorthand(value) {
  if (typeof value !== "string") return null;
  var familyAt = -1;
  for (var index = 0; index < FAMILY_REFS.length; index += 1) {
    var at = value.lastIndexOf(FAMILY_REFS[index]);
    if (at > familyAt) familyAt = at;
  }
  if (familyAt <= 0) return null;
  var family = value.slice(familyAt).trim();
  if (family === "") return null;
  var head = value.slice(0, familyAt).trim();
  var slash = head.lastIndexOf("/");
  if (slash <= 0) return null;
  var sizeChunk = head.slice(0, slash).trim();
  var height = head.slice(slash + 1).trim();
  if (sizeChunk === "" || height === "") return null;
  var chunks = splitTopLevel(sizeChunk);
  var size = chunks.pop();
  var lead = chunks.join(" ");
  if (!isScalableValue(size) || !isScalableValue(height)) return null;
  return { lead: lead, size: size, height: height, family: family };
}

/**
 * Split a value on whitespace that sits OUTSIDE any parentheses, so a leading
 * `700 calc(21px + var(…))` yields `["700", "calc(21px + var(...))"]`.
 * @param {string} value - the chunk to split.
 * @returns {string[]} the top-level chunks.
 */
function splitTopLevel(value) {
  var out = [];
  var current = "";
  var depth = 0;
  for (var index = 0; index < value.length; index += 1) {
    var char = value.charAt(index);
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth === 0 && /\s/.test(char)) {
      if (current !== "") {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current !== "") out.push(current);
  return out;
}

/**
 * Rebuild one `font` shorthand from parsed parts.
 * @param {{lead: string, size: string, height: string, family: string}} parts - parsed parts.
 * @returns {string} the shorthand value (without `!important`).
 */
function rebuildShorthand(parts) {
  var out = "";
  if (parts.lead !== "") out += parts.lead + " ";
  return out + parts.size + " / " + parts.height + " " + parts.family;
}

/* ------------------------------------------------------------------ *
 * token classification
 * ------------------------------------------------------------------ */

/**
 * Match DSH's typography PART tokens: the design system's sizes plus the
 * content size the theme plugin writes on `body` (whose secondary variant
 * carries a suffix of its own). Line heights scale with sizes so a token's
 * shorthand never disagrees with its parts.
 *
 * Deliberately a shape test rather than an enumeration: DSH generates these
 * tokens at runtime, so whatever a future release names them, a token that
 * ends in a size or a line height is one that must scale.
 */
var TOKEN_PATTERN = /^--(?:dsw-font-[a-z0-9-]*|dsh-content-font)-(?:font-size|line-height)(?:-secondary)?$|^--dsh-content-font-(?:size|line-height)(?:-secondary)?$/;

/**
 * The content-size DELTA tokens the theme derives on `body`; the dialog size
 * offset shifts these additively, which is what moves every delta-derived
 * markdown size by exactly the offset.
 */
var DELTA_PATTERN = /^--dsh-content-font-delta(?:-secondary)?$/;

/** The whole official content-size chain (size / line height / delta). */
var CONTENT_PATTERN = /^--dsh-content-font-(?:size|line-height|delta)(?:-secondary)?$/;

/**
 * The one property the conversation size offset is added to: the official
 * "对话字号" source, which the app writes INLINE on `body`.
 *
 * Every other markdown size is derived from it (through
 * `--dsh-content-font-delta` and the markdown shorthands), and custom properties
 * resolve where they are DECLARED — so the offset has to land here, once, or a
 * deeper override would leave the derived tokens at their body-computed values.
 */
var CONTENT_SIZE_SOURCE = "--dsh-content-font-size";

/**
 * Whether one declared value is a plain literal this plugin may wrap in
 * `calc(… + Npx)`. A `var()` reference is NOT: it is either derived from a
 * property this plugin already shifted, or it belongs to another axis.
 * @param {unknown} value - a declared custom-property value.
 * @returns {boolean}
 */
function isLiteralTokenValue(value) {
  return typeof value === "string" && value !== "" && value.indexOf("var(") === -1;
}

/**
 * The PART-token suffixes DSH appends for single-axis consumers.
 */
var PART_SUFFIXES = ["-font-size", "-line-height", "-font-family", "-font-weight", "-font-style"];

/**
 * The bare family variables, which are NOT `font` shorthands.
 */
var FAMILY_VARS = { "--dsw-font-family": true, "--dsw-font-mono": true, "--ds-font-family-code": true };

/**
 * Ever since every global declaration moved to the root rule (see
 * `buildAxisCss`), no rule needs a `body, body *` reach for a TOKEN, and only
 * the interface weight keeps it — because a weight is the one property whose
 * per-element declarations cannot be reached by inheritance. Nothing else may
 * reintroduce a blanket: on DSH 0.1.5-rc.3 a single one costs 1892
 * selector-element matches on every style recalculation, and dragging a sidebar
 * handle recalculates once per frame.
 */

/**
 * Whether one name belongs to the official CONTENT-size chain the conversation
 * owns: `--dsh-content-font-size` / `-line-height` (the official "对话字号"
 * setting writes the former) and the delta tokens derived from it.
 *
 * The interface axis must never scale these. Doing so was the real reason an
 * interface size change moved the conversation: the markdown ladder consumes
 * this chain directly, so scaling it is a conversation edit no matter which
 * slider caused it.
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean}
 */
function isContentToken(name) {
  return typeof name === "string" && CONTENT_PATTERN.test(name);
}

/**
 * Whether one custom-property name is a PART token this plugin scales.
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean} true when the token carries a size or a line height.
 */
function isFontToken(name) {
  return typeof name === "string" && TOKEN_PATTERN.test(name);
}

/**
 * Whether one name is a content-size delta token.
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean}
 */
function isDeltaToken(name) {
  return typeof name === "string" && DELTA_PATTERN.test(name);
}

/**
 * Whether one name is a markdown CODE token: its own sizing axis.
 *
 * The theme declares these as literals the content-size chain never reaches
 * (`--dsw-font-markdown-code:12px/19px …`, `-code-block:11px/19px …`,
 * `-code-block-small:11px/16px …`), and the shipped stylesheets consume them
 * through the `font` shorthand.
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean} true when the token sizes code.
 */
function isCodeToken(name) {
  return typeof name === "string" && name.indexOf("--dsw-font-markdown-code") === 0;
}

/**
 * Whether one name is a markdown (dialog) token that is NOT code: the token
 * family the dialog axes own.
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean}
 */
function isMarkdownToken(name) {
  return typeof name === "string" && name.indexOf("--dsw-font-markdown-") === 0 && !isCodeToken(name);
}

/**
 * The one markdown family whose sizes are LITERALS instead of following the
 * official content-size chain: the `small` series (`12px/20px`, measured on
 * 0.1.7-rc.2).
 *
 * Every other markdown size derives from `--dsh-content-font-size` through
 * `--dsh-content-font-delta`, so shifting them as well applies the offset a
 * second time. The value cannot tell the families apart: the page also carries
 * `--dsw-font-markdown-h1` with its var() already substituted
 * (`700 calc(21px + -2px)/…`), which reads exactly like a literal and made
 * H1/H2 shrink while H3 stayed right (the asymmetric report that started this).
 * The NAME is the only reliable discriminator, so this is a whitelist.
 */
var MARKDOWN_LITERAL_PREFIX = "--dsw-font-markdown-small";

/**
 * Whether a token belongs to the literal (non-derived) markdown family.
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean}
 */
function isMarkdownLiteralToken(name) {
  return typeof name === "string" && name.indexOf(MARKDOWN_LITERAL_PREFIX) === 0;
}

/**
 * Whether one NAME looks like a `font` shorthand token (a bare
 * `--dsw-font-…` name that is not a PART token or a family variable).
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean}
 */
function isShorthandName(name) {
  if (typeof name !== "string" || name.indexOf("--dsw-font-") !== 0) return false;
  if (FAMILY_VARS[name] === true) return false;
  for (var index = 0; index < PART_SUFFIXES.length; index += 1) {
    var suffix = PART_SUFFIXES[index];
    if (name.length > suffix.length && name.slice(-suffix.length) === suffix) return false;
  }
  return true;
}

/**
 * Whether a token is one this plugin reads and re-declares at all.
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean} true for part tokens, code tokens, shorthand names and
 *   the content-size deltas.
 */
function isScaledToken(name) {
  return isFontToken(name) || isCodeToken(name) || isShorthandName(name) || isDeltaToken(name);
}

/**
 * Ordered PART-token names present in a base map, sizes before line heights
 * so a reader of the stylesheet sees each size next to its height.
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {string[]} the names.
 */
function tokenNames(baseTokens) {
  if (baseTokens === null || typeof baseTokens !== "object") return [];
  var names = Object.keys(baseTokens).filter(function (name) {
    return isFontToken(name) || isCodeToken(name) || isDeltaToken(name);
  });
  names.sort(function (left, right) {
    if (left.length !== right.length) return left.length - right.length;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return names;
}

/**
 * The markdown (dialog) PART tokens: sizes and line heights of the markdown
 * family, excluding code.
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {string[]}
 */
function markdownTokenNames(baseTokens) {
  return tokenNames(baseTokens).filter(isMarkdownToken);
}

/**
 * Every `font` shorthand token in a base map that parses, sorted by name
 * length (families before variants, mirroring the part-token order).
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {{name: string, parts: object}[]}
 */
function shorthandTokens(baseTokens) {
  if (baseTokens === null || typeof baseTokens !== "object") return [];
  var out = [];
  var names = Object.keys(baseTokens).filter(isShorthandName);
  names.sort(function (left, right) {
    if (left.length !== right.length) return left.length - right.length;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  for (var index = 0; index < names.length; index += 1) {
    var parts = parseShorthand(baseTokens[names[index]]);
    if (parts !== null) out.push({ name: names[index], parts: parts });
  }
  return out;
}

/**
 * The markdown (dialog) `font` shorthand tokens, excluding code.
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {{name: string, parts: object}[]}
 */
function markdownShorthandTokens(baseTokens) {
  return shorthandTokens(baseTokens).filter(function (entry) {
    return isMarkdownToken(entry.name);
  });
}

/**
 * The code `font` shorthand tokens.
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {{name: string, parts: object}[]}
 */
function codeShorthandTokens(baseTokens) {
  return shorthandTokens(baseTokens).filter(function (entry) {
    return isCodeToken(entry.name);
  });
}

/* ------------------------------------------------------------------ *
 * selectors
 * ------------------------------------------------------------------ */

/**
 * Build one exclusion that keeps a surface out of a rule.
 *
 * The whole list goes into a single `:not(…)`. The long form —
 * `:not(pre):not(pre *)…` — repeats `:not(` and `)` per argument, and that
 * chain is copied into both dialog alternatives and the interface rule, so the
 * compact form saves roughly 120 bytes per copy.
 *
 * The trade is specificity: `:not(a):not(b)` SUMS its arguments while
 * `:not(a, b)` takes the most specific one. Nothing here depends on that sum.
 * Every rule below carries `!important`, which already beats the theme's
 * non-important class rules whatever the specificity; the shipped DSH 0.1.5
 * assets hold exactly one `!important` typography declaration
 * (`font-size` on inline markdown code, and no size declaration is ever
 * emitted from here); and the rules that could collide with each other are
 * held apart by these very exclusions rather than by their weight. Verified
 * against the shipped bundle and every installed plugin: no other
 * `!important` `font-weight`/`font-family` rule exists to lose to.
 *
 * @param {string[]} selectors - the selectors to exclude.
 * @returns {string} one `:not(…)` carrying the whole list.
 */
function excludeAll(selectors) {
  return ":not(" + selectors.join(",") + ")";
}

/**
 * A code surface, and its descendants: a highlight `<span>` inside a `<pre>`
 * is not a `pre`, so an exclusion has to reach through ancestry.
 */
var CODE_SURFACE_SELECTORS = [
  "pre",
  "pre *",
  "code",
  "code *",
  "kbd",
  "kbd *",
  "samp",
  "samp *",
  "var",
  "var *",
  "tt",
  "tt *",
  "textarea",
  "textarea *",
  '[class*="code" i]',
  '[class*="code" i] *',
  '[class*="terminal" i]',
  '[class*="terminal" i] *',
];

/**
 * Everything a code surface must be excluded from a DIALOG-scoped rule: the
 * code elements themselves AND their descendants (a highlight `<span>` inside
 * a `<pre>` is not a `pre`, so the exclusion has to reach through ancestry
 * with a complex `:not()` argument — supported by the Chromium line DSH
 * targets).
 */
var CODE_EXCLUDES = excludeAll(CODE_SURFACE_SELECTORS);

/**
 * What counts as code text for the code axes.
 *
 * There is no token to hook here (no shipped rule reads a `-font-weight`
 * token — measured, zero `font-weight: var(--dsw-font-…)` in rc.2), so the
 * code axes have to name the elements. Two layers, both measured against
 * rc.2:
 *
 * 1. The tags DSH's own stylesheets size with a code token: markdown `pre` /
 *    inline `code`, the tool card's `:where(pre)` block, form controls, and
 *    CodeMirror-like editors. Their descendants are listed too, because the
 *    blanket body rule matches EVERY element — a `<span>` inside a
 *    highlighted block would otherwise be pulled back to the body weight.
 * 2. Containers that only a class name identifies: the terminal and tool-code
 *    bodies are plain `div`s (`…_terminal`, `…_codeBody`, `md-code-block`).
 *
 * The `i` flag keeps a casing change in a future DSH from silently dropping
 * the rule, and an unmatched token/class simply means that surface follows
 * the interface axis — the same degradation as an unknown token name.
 */
/** The default code selector list: the substring form, for callers with no page. */
var CODE_SELECTOR;

/**
 * The code surfaces that never need a substring match.
 *
 * Everything here is either a semantic element or a class this plugin owns, so
 * the browser can match it with a tag or a class-token test. The containers
 * that only a hashed class identifies (`…_codeBody`, `…_terminal`) used to be
 * spelled `[class*="code" i]` / `[class*="terminal" i]` — measured on
 * 0.1.5-rc.3, those two substring selectors cost an attribute scan on every one
 * of the page's ~1900 elements on every rule that carries them, and a drag
 * recalculates styles once per frame. The browser half now HARVESTS the real
 * class tokens from the live page and passes them in as exact class selectors
 * (see `buildFontCss`), falling back to the substring form whenever it cannot.
 */
var CODE_SURFACE_SELECTORS_CHEAP = [
  "pre",
  "code",
  "kbd",
  "samp",
  "var",
  "tt",
  "textarea",
  ".cm-editor",
  ".dfp-previewCode",
];

/**
 * The code surfaces for one build.
 *
 * The two substring hooks ride along on purpose. A class token the page has
 * not rendered yet (`…_codeBody`, `…_terminalBody` appear only once a tool card
 * or a terminal pane exists) cannot be named by a harvested class, and an
 * unknown surface must still get the code axes — the same "an unmatched token
 * simply follows the interface" degradation the token axes have. The hooks cost
 * an attribute scan per element per rule that carries them, which is why the
 * rest of this module spent its effort removing the OTHER wide selectors (see
 * `rootRule` / `weightRule` / `dialogSelector`); measured on 0.1.5-rc.3 that is
 * the difference between 1.87 s and ~0.9 s of style recalculation per drag.
 */
function codeSurfaceList() {
  return CODE_SURFACE_SELECTORS_CHEAP.concat([
    '[class*="code" i]',
    '[class*="terminal" i]',
  ]);
}

/**
 * The code selector list for one build.
 *
 * Surfaces only — no `… *` descendants. Everything inside a code surface
 * inherits its family and weight, so descendants are unnecessary, and they are
 * not free: an ancestor-walking selector costs about 0.03 s per 50-step drag on
 * 0.1.5-rc.3 (measured: stripping the ` *` forms from these two rules took the
 * drag from 0.89 s to 0.52 s of style recalculation). The weight family keeps
 * the code subtree right through `--dfp-wdelta` instead — see `weightRule`.
 *
 * @param {{code?: string[], terminal?: string[]}|null} [hints] - unused; kept so
 *   the browser half can keep passing one harvest object to `buildFontCss`.
 * @returns {string} the comma-separated list of code surfaces.
 */
function codeSelector(hints) {
  return codeSurfaceList().join(",");
}

CODE_SELECTOR = codeSelector(null);

/**
 * The dialog surface: DSH renders the conversation markdown in a CSS-module
 * container whose class hashes per release (`_markdown_<hash>_…`), wrapped in a
 * stable `[data-dss-prose]` container (measured on 0.1.5-rc.3: every markdown
 * container on the page sits inside one). A class-substring match degrades
 * safely — no match means the dialog follows the interface axis, the same
 * behavior as an unknown token name — but it costs an attribute scan per
 * element per rule, so the browser half prefers the stable wrapper when it can
 * see one and falls back to the substring form otherwise.
 */
var MARKDOWN_SELECTOR =
  '[class*="_markdown_" i]' +
  CODE_EXCLUDES +
  ',[class*="_markdown_" i] *' +
  CODE_EXCLUDES;

/**
 * The dialog selector for one build, given the harvested wrapper.
 * @param {{markdown?: string}|null} [hints] - the harvested wrapper selector.
 * @returns {string} the markdown-scoped selector list.
 */
function dialogSelector(hints) {
  if (hints !== undefined && hints !== null && typeof hints.markdown === "string" && hints.markdown !== "") {
    // The wrapper is not markdown content itself, so only its subtree is
    // scoped; the code exclusion still rides along so inline code keeps the
    // code family. This is the rule the harvest earns its keep on: the same
    // `:not(…)` over the stable wrapper trials ~37 elements instead of the
    // ~1800 the class-substring container selector used to hand it.
    return hints.markdown + " *" + CODE_EXCLUDES;
  }
  return MARKDOWN_SELECTOR;
}

/** The dark-theme attribute DSH's ThemePresenter writes on body. */
var DARK_ATTR = "body[data-ds-dark-theme]";

/**
 * What the INTERFACE weight rule stays out of when the conversation has no
 * weight of its own.
 *
 * The weight is still the one property that needs a `body, body *` reach: DSH
 * pins weights on elements that do not inherit (`button` / `span` / `div`
 * class rules — measured on 0.1.5-rc.3: 19 buttons, 13 spans and 1 div in the
 * chrome declare their own weight; the markdown side's 7 `strong` and 2 `th`
 * declare theirs). But the 26-argument `:not(…)` that used to ride along cost
 * a selector trial per argument on ~1800 elements EVERY recalculation, and a
 * drag recalculates once per frame — measured 1.87 s of style recalculation
 * for a 50-step drag versus 0.47 s with this plugin removed.
 *
 * Two narrowings removed that:
 *
 * 1. Code surfaces no longer appear here at all. The code rules are emitted
 *    after this one and win on their own: class hooks by specificity, element
 *    selectors by order at equal specificity. Their descendants inherit from
 *    them (`font-weight` and `font-family` are inherited), so the blanket
 *    cannot reach a highlight `<span>` inside a `<pre>` either.
 * 2. What remains — the conversation markdown subtree and the card's own
 *    conversation preview — rides `:where(…)`, which contributes NO
 *    specificity: the rule stays at (0,0,1), exactly like the plain
 *    `body,body *` form, so the dialog rule (class-scoped) and the code rules
 *    keep out-ranking it no matter which order they land in.
 *
 * When the conversation DOES carry a weight the guard is dropped entirely (see
 * `weightRule`): the dialog rule is class-scoped, so it overrides everything
 * this rule does inside markdown anyway, and the rule collapses to the bare
 * `body,body *` pair. Measured with the axis at 560: all 141 interface text
 * elements on the page took 560 and no markdown element moved — the same
 * coverage the 26-argument form had.
 */
var WEIGHT_MARKDOWN_GUARD =
  ":not(:where(" +
  [
    '[class*="_markdown_" i]',
    '[class*="_markdown_" i] *',
    ".dfp-previewDialog",
    ".dfp-previewDialog *",
  ].join(",") +
  "))";

/**
 * The elements that carry a weight of their own in the INTERFACE (the chrome).
 *
 * The weight is the one property that cannot ride inheritance alone: an element
 * whose own rule declares a weight ignores the value it would inherit, whatever
 * that value's importance. Measured on 0.1.5-rc.3, the chrome's pinned elements
 * are `button` / `span` / `div`; the rest of the list is the inline markup that
 * could plausibly join them. This replaces the old `body,body *` reach, which
 * matched 1892 elements on every recalculation — the whole point of the table is
 * that it matches a fraction of that while still covering every pinned element.
 *
 * The CONVERSATION is not covered here: it has its own ladder with per-element
 * bases (`DIALOG_WEIGHT_GROUPS`), because one flat weight cannot preserve a
 * heading hierarchy.
 */
var WEIGHT_ELEMENT_TABLE = [
  "button",
  "span",
  "div",
  "strong",
  "b",
  "em",
  "i",
  "a",
  "label",
  "small",
  "p",
  "li",
  "td",
  "th",
  "dt",
  "dd",
  "summary",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
].join(",");

/**
 * Split a selector list on its top-level commas only.
 *
 * The exclusions hold a selector LIST inside `:not(…)`, so a plain
 * `split(",")` would cut a selector in half — and the per-theme rules prefix
 * every selector in the list.
 * @param {string} selectorList - a comma-separated selector list.
 * @returns {string[]} the top-level parts, verbatim.
 */
function splitSelectorList(selectorList) {
  var parts = [];
  var current = "";
  var depth = 0;
  var quote = "";
  for (var index = 0; index < selectorList.length; index += 1) {
    var character = selectorList[index];
    if (quote !== "") {
      current += character;
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

/**
 * Prefix every selector in a comma list, for the per-theme rules.
 * @param {string} selectorList - a comma-separated selector list.
 * @param {string} prefix - the prefix to prepend to each selector.
 * @returns {string} the prefixed list.
 */
function prefixSelector(selectorList, prefix) {
  var parts = splitSelectorList(selectorList);
  var out = [];
  for (var index = 0; index < parts.length; index += 1) {
    out.push(prefix + " " + parts[index]);
  }
  return out.join(",");
}

/* ------------------------------------------------------------------ *
 * per-theme resolution
 * ------------------------------------------------------------------ */

/**
 * Expand the FOLLOW semantics over one normalized configuration.
 *
 * The conversation owns every axis. Follow — the default — makes the interface
 * take the conversation's family and weight, keeping its own value only for an
 * axis the conversation leaves unset. Follow off leaves both of the interface's
 * axes standing on their own; the conversation is never touched either way,
 * because the interface's rules exclude the markdown subtree.
 *
 * The interface's size and line-height axes are retired and render nothing, so
 * nothing follows for them (see `buildAxisCss` for the measurement).
 *
 * @param {Record<string, unknown>} raw - a normalized configuration.
 * @returns {Record<string, unknown>} the set with the follow rule applied.
 */
function expandFollow(raw) {
  var out = {};
  for (var field in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) out[field] = raw[field];
  }
  // Migration bridge, not a live rule: a document written before 0.2.0 carries
  // the family on the interface only, so an empty conversation family takes it.
  // The card never describes an empty field as "follows the interface".
  out[STACK_DIALOG_FIELD] =
    raw[STACK_DIALOG_FIELD] !== "" ? raw[STACK_DIALOG_FIELD] : raw[SANS_FIELD];
  out[WEIGHT_DIALOG_FIELD] = raw[WEIGHT_DIALOG_FIELD];
  if (raw[UI_FOLLOWS_FIELD] !== false) {
    out[SANS_FIELD] = out[STACK_DIALOG_FIELD];
    out[WEIGHT_FIELD] =
      raw[WEIGHT_DIALOG_FIELD] !== WEIGHT_UNSET ? raw[WEIGHT_DIALOG_FIELD] : raw[WEIGHT_FIELD];
  }
  return out;
}

/**
 * Resolve the effective light and dark axis sets of one configuration.
 *
 * With `perTheme` off the dark set IS the light set; with it on, the sparse
 * `darkValues` map is applied over the single set first and follow-expansion
 * runs on the result, so a dark dialog value still tracks the dark interface
 * value when the interface itself is overridden per theme.
 * @param {unknown} config - candidate configuration.
 * @returns {{light: object, dark: object}} the two axis sets.
 */
function resolveAxes(config) {
  var raw = normalizeConfig(config);
  var light = expandFollow(raw);
  if (raw[PER_THEME_FIELD] !== true) return { light: light, dark: light };
  // The dark overrides are applied to the RAW values and only then expanded: an
  // already-expanded set has the follow-borrowed values baked in, so expanding
  // it again would let a borrowed value shadow the dark override.
  var merged = {};
  for (var field in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) merged[field] = raw[field];
  }
  var overrides = raw[DARK_VALUES_FIELD];
  for (var key in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) merged[key] = overrides[key];
  }
  return { light: light, dark: expandFollow(merged) };
}

/* ------------------------------------------------------------------ *
 * the stylesheet builder
 * ------------------------------------------------------------------ */

/**
 * The steps a weight slider may use, finest first.
 *
 * A family ships a fixed set of faces and the browser rounds any requested
 * weight to the nearest one, so a slider that runs in single units spends long
 * stretches on one face. The control is therefore built from what the family can
 * actually render: its range runs from the lightest face it has to the heaviest,
 * and its notch is the family's own granularity.
 */
var WEIGHT_STEP_CANDIDATES = [1, 5, 10, 25, 50, 100, 200, 300];

/**
 * How many positions a slider must still offer before a coarser step is refused.
 *
 * Coarseness is the point (see `weightProfileFrom`), but a control with two
 * positions is not a slider. Four is the smallest count that still lets a reader
 * go one notch either side of the neutral position and one further up — and on
 * the measured seven-face family it lands on a 200-weight step, where one notch is
 * a +30% change in ink, against +16% at 100 (which is why 100 was not enough).
 */
var WEIGHT_MIN_POSITIONS = 4;

/** The weight grid the profile is measured on. */
var WEIGHT_PROBE_LOW = 100;
var WEIGHT_PROBE_HIGH = 900;
var WEIGHT_PROBE_STEP = 10;

/** Round down/up to a multiple of `step`. */
function floorTo(value, step) {
  return Math.floor(value / step) * step;
}
function ceilTo(value, step) {
  return Math.ceil(value / step) * step;
}

/**
 * Does every position of `[min..max]` in `step` increments render differently?
 *
 * Checked at every base the offset is added to: a step that is fine for body text
 * can be a no-op one layer up, where the faces are further apart.
 * @param {(weight: number) => string|number} sample - probe.
 * @param {number[]} bases - the weights the offsets are added to.
 * @param {number} min - first offset.
 * @param {number} max - last offset.
 * @param {number} step - offset increment.
 * @returns {boolean} true when no two neighbours render the same at any base.
 */
function everyPositionDiffers(sample, bases, min, max, step) {
  for (var index = 0; index < bases.length; index += 1) {
    var base = bases[index];
    var previous = null;
    for (var position = min; position <= max; position += step) {
      var signature = sample(base + position);
      if (previous !== null && signature === previous) return false;
      previous = signature;
    }
  }
  return true;
}

/**
 * The slider a family deserves: how far it can go, and by how much.
 *
 * A font can be made lighter or heavier only as far as its faces reach, and only
 * in jumps between them. Measured on a weight grid:
 *  - the downward reach is the highest weight that still renders as light as the
 *    family can (asking for less cannot change anything);
 *  - the upward reach is the LOWEST weight at or above body text that already
 *    renders as heavy as the family can, so the range ends where the text a reader
 *    is reading stops changing (see `WEIGHT_DELTA_UP_LIMIT` for the ceiling);
 *  - the step is the COARSEST candidate that still leaves `WEIGHT_MIN_POSITIONS`
 *    positions with body text changing at every one of them. Coarse is the point:
 *    a finer step splits one face into several positions that all render the same,
 *    so the control feels dead (measured on Noto Serif SC, whose faces are
 *    100-250 / 300 / 400 / 500 / 600 / 700 / 800-900: one 100-weight step is a
 *    +16% change in ink, one 200-weight step +30%).
 *
 * Bold text and headings are deliberately NOT required to change at every
 * position: the heaviest ladder layer sits at 600 and reaches the ceiling at +300,
 * so no range can move it further. Body text is what a reader reads, so it carries
 * the requirement, and a heading already at its boldest face stays there.
 *
 * Every position is a whole number of steps from 0, so the card's step counts map
 * back onto exactly the offsets the document stores.
 *
 * @param {(weight: number) => string|number} sample - renders a probe at one
 *   weight and returns a signature; equal signatures mean identical rendering.
 * @param {{candidates?: number[], floor?: number, ceil?: number, top?: number}}
 *   [options] overrides for the candidates, the widest allowed range and the
 *   heaviest base the offset is added to (the ladder's, or the axis's own).
 * @returns {{min: number, max: number, step: number}} the slider's shape; the
 *   range always contains 0, which is the "leave DSH alone" position.
 */
function weightProfileFrom(sample, options) {
  var settings = options || {};
  var candidates =
    Array.isArray(settings.candidates) && settings.candidates.length > 0
      ? settings.candidates
      : WEIGHT_STEP_CANDIDATES;
  var floor = typeof settings.floor === "number" ? settings.floor : WEIGHT_DELTA_FLOOR;
  var ceil = typeof settings.ceil === "number" ? settings.ceil : WEIGHT_DELTA_CEIL;
  var top = typeof settings.top === "number" ? settings.top : WEIGHT_LADDER_STRONG;
  var topSignature = sample(WEIGHT_PROBE_HIGH);
  var bottomSignature = sample(WEIGHT_PROBE_LOW);
  var heaviest = WEIGHT_PROBE_HIGH;
  for (var weight = WEIGHT_PROBE_LOW; weight <= WEIGHT_PROBE_HIGH; weight += WEIGHT_PROBE_STEP) {
    if (sample(weight) === topSignature) {
      heaviest = weight;
      break;
    }
  }
  var lightest = WEIGHT_PROBE_LOW;
  for (var back = WEIGHT_PROBE_HIGH; back >= WEIGHT_PROBE_LOW; back -= WEIGHT_PROBE_STEP) {
    if (sample(back) === bottomSignature) {
      lightest = back;
      break;
    }
  }
  // How far the offset can go before NO layer that must move can move any more:
  // the widest horizon among those bases, since a layer that could still change
  // must not be cut off by one that already sits at its heaviest face.
  var headroom = Math.max(0, heaviest - WEIGHT_BASE);
  if (top !== WEIGHT_BASE) {
    for (var up = top; up <= WEIGHT_PROBE_HIGH; up += WEIGHT_PROBE_STEP) {
      if (sample(up) === topSignature) {
        headroom = Math.max(headroom, up - top);
        break;
      }
    }
  }
  var reachUp = Math.min(ceil, WEIGHT_DELTA_UP_LIMIT, headroom);
  var reachDown = Math.max(floor, Math.min(0, lightest - WEIGHT_BASE));
  var cap = Math.min(reachUp, WEIGHT_DELTA_UP_LIMIT);
  /**
   * The shape one candidate step describes.
   *
   * Every position is a whole number of steps from 0, so the card's step counts
   * multiply back into exactly the offsets the document stores. The reach is
   * snapped to that grid without ever passing the hard floor or the ceiling —
   * rounding the top UP (which the first version did) put a position past the
   * widest allowed offset, and rounding the bottom DOWN could pass the floor.
   */
  var shapeAt = function (step) {
    var down = Math.min(ceilTo(-reachDown, step), floorTo(-floor, step));
    return { min: -down, max: floorTo(cap, step), step: step };
  };
  var best = null;
  var bestCount = 0;
  // Coarsest candidate first: the coarsest step that still leaves enough visible
  // positions is the one a reader can actually work with.
  for (var index = candidates.length - 1; index >= 0; index -= 1) {
    var step = candidates[index];
    if (!(step > 0)) continue;
    var shape = shapeAt(step);
    if (shape.max < shape.min) continue;
    if (!everyPositionDiffers(sample, [WEIGHT_BASE], shape.min, shape.max, step)) continue;
    var count = (shape.max - shape.min) / step + 1;
    if (count >= WEIGHT_MIN_POSITIONS) return shape;
    if (count > bestCount) {
      best = shape;
      bestCount = count;
    }
  }
  if (best !== null) {
    // Fewer positions than asked for is still usable; one position is the whole
    // range, and any step describes it, so use the finest and keep the unit small.
    if (best.max === best.min) return { min: best.min, max: best.max, step: 1 };
    return best;
  }
  // No step kept body text alive: the coarsest one that still fits is the honest
  // answer, never a step the control cannot reach.
  var coarsest = candidates[candidates.length - 1];
  var plain = shapeAt(coarsest);
  var span = plain.max - plain.min;
  return { min: plain.min, max: plain.max, step: span > 0 ? Math.min(coarsest, span) : 1 };
}

/**
 * Turn a measured profile into the slider the card shows.
 *
 * The document keeps storing a weight offset (so nothing written before has to be
 * migrated), but the CONTROL counts the family's own steps: a six-face family
 * offers "-2 … +4" instead of "-200 … +400", which is what a reader can actually
 * see. `unit` is how many weight units one step is worth.
 * @param {{min: number, max: number, step: number}} profile - measured shape.
 * @param {number} value - the stored offset, in weight units.
 * @returns {{min: number, max: number, unit: number, value: number}} the slider
 *   in step counts; a stored value outside the measured range widens it, so it is
 *   never unreachable.
 */
function weightStepRange(profile, value) {
  var unit = profile && profile.step > 0 ? profile.step : 1;
  var count = Math.round(Number(value) / unit);
  if (!isFinite(count)) count = 0;
  var min = Math.floor(profile.min / unit);
  var max = Math.ceil(profile.max / unit);
  if (count < min) min = count;
  if (count > max) max = count;
  return { min: min, max: max, unit: unit, value: count };
}

/**
 * What a slider's local (unconfirmed) value should do when a value arrives from
 * the settings document.
 *
 * A slider keeps the value the user released until the document echoes it back;
 * dropping it immediately would show the old number for a frame (the "bounce
 * back, then settle" flicker). Two cases must NOT drop it:
 *  - a confirmation for the PREVIOUS commit arriving after the user already
 *    started a new drag — the document write is debounced and can land seconds
 *    later (measured on 0.1.7-rc.2: 0.7–5 s), and clearing there snapped the
 *    thumb back to the old value mid-drag;
 *  - any unrelated outside value (another page, a reset) arriving mid-drag.
 *
 * @param {{pending: number|null, awaiting: number|null, confirmed: number}} state
 *   the local value, the value a commit is waiting for (null when idle), and the
 *   value the document currently reports.
 * @returns {{pending: number|null, awaiting: number|null}} the state to keep.
 */
function reconcileSliderValue(state) {
  var pending = state.pending;
  var awaiting = state.awaiting;
  var confirmed = state.confirmed;
  if (awaiting !== null && confirmed === awaiting) {
    awaiting = null;
    if (pending === confirmed) pending = null;
    return { pending: pending, awaiting: awaiting };
  }
  if (awaiting === null && pending !== null && pending === confirmed) pending = null;
  return { pending: pending, awaiting: awaiting };
}

/**
 * Whether a normalized configuration asks for any change at all.
 * @param {unknown} config - candidate configuration.
 * @returns {boolean} true when nothing should be injected.
 */
function isDormant(config) {
  var axis = config !== null && typeof config === "object" ? config : {};
  if (axis[PER_THEME_FIELD] === true) {
    var dark = axis[DARK_VALUES_FIELD];
    if (dark !== null && typeof dark === "object") {
      for (var field in dark) {
        if (Object.prototype.hasOwnProperty.call(dark, field)) return false;
      }
    }
  }
  return (
    // The retired interface size and line-height axes are deliberately absent:
    // a configuration that only sets them renders nothing, so it is dormant like
    // an empty one. The interface WEIGHT is not retired — it renders a blanket
    // rule — so it counts.
    sanitize(axis[SANS_FIELD]) === "" &&
    sanitize(axis[STACK_DIALOG_FIELD]) === "" &&
    sanitize(axis[MONO_FIELD]) === "" &&
    clampOffset(axis[SIZE_DIALOG_FIELD]) === 0 &&
    clampOffset(axis[CODE_SIZE_FIELD]) === 0 &&
    // These arrive normalized, so they are offsets already: converting them again
    // would rescale an offset that legitimately sits inside `300…600`.
    clampWeightDelta(axis[WEIGHT_FIELD], true) === WEIGHT_UNSET &&
    clampWeightDelta(axis[WEIGHT_DIALOG_FIELD], true) === WEIGHT_UNSET &&
    clampWeightDelta(axis[CODE_WEIGHT_FIELD], true) === WEIGHT_UNSET &&
    clampRatio(axis[LINE_HEIGHT_DIALOG_FIELD]) === LINE_HEIGHT_MIN &&
    clampLineOffset(axis[CODE_LINE_HEIGHT_FIELD]) === 0 &&
    clampLigatures(axis[LIGATURES_FIELD]) === LIGATURES_DEFAULT &&
    sanitizeFeatures(axis[FEATURES_FIELD]) === "" &&
    toBool(axis[NO_SYNTHETIC_ITALIC_FIELD]) === false &&
    toBool(axis[NO_SYNTHETIC_BOLD_FIELD]) === false
  );
}

/**
 * Build the stylesheet one THEME VALUE SET applies.
 *
 * The dialog axes reach the conversation markdown through a scope rule keyed
 * on the markdown container (class-substring match) rather than through the
 * design tokens: the tokens' `font` shorthands inline their parts, so a
 * token-level dialog override would need a full shorthand rebuild, while a
 * scoped `!important` rule wins over every non-important declaration the
 * theme ships and degrades to "follows the interface" when nothing matches.
 * Code surfaces are excluded from the dialog scope by construction (see
 * `CODE_EXCLUDES`), so inline code inside a serif conversation stays mono.
 *
 * @param {Record<string, unknown>} axis - an expanded (follow-applied) value set.
 * @param {Record<string, string>} baseTokens - token name to untouched value.
 * @param {boolean} isDark - prefix every rule with the dark-theme attribute.
 * @returns {string} declarations for one `<style>` element.
 */
function buildAxisCss(axis, baseTokens, isDark, hints) {
  var sans = formatStack(parseStack(axis[SANS_FIELD]));
  var mono = formatStack(parseStack(axis[MONO_FIELD]));
  var dialog = formatStack(parseStack(axis[STACK_DIALOG_FIELD]));
  // Normalised once: an expanded axis always carries a number, but a caller
  // handing in a raw object may leave the field out, and "absent" has to mean
  // "unset" rather than "write the string undefined". The conversation's value
  // is an OFFSET (see `clampWeightDelta`), not a weight.
  var dialogDelta = typeof axis[WEIGHT_DIALOG_FIELD] === "number" ? axis[WEIGHT_DIALOG_FIELD] : WEIGHT_UNSET;
  var codeSurfaces = codeSelector(hints);
  var dialogSurfaces = dialogSelector(hints);
  var declarations = [];

  /**
   * A rule for INHERITED state: custom properties and the inherited `font-*`
   * properties. `:root, body` is two elements, `body` alone is one, and every
   * descendant picks the value up by inheritance — including the values DSH
   * itself writes (measured on 0.1.5-rc.3: the host declares these tokens at
   * `:root` and on `body`, and the only inline copy is on `body` itself, where
   * an `!important` stylesheet declaration still wins).
   *
   * This used to be `body, body *`, which matched 1892 elements on EVERY style
   * recalculation. A drag writes `style` once per frame, so that reach alone
   * was most of the measured cost: 1.87 s of style recalculation for a 50-step
   * sidebar drag (0.47 s with the plugin removed) and 49 frames over 25 ms.
   */
  function rootRule(declarations) {
    return (isDark ? DARK_ATTR : ":root,body") + "{" + declarations + "}";
  }
  function bodyRule(declarations) {
    return (isDark ? DARK_ATTR : "body") + "{" + declarations + "}";
  }
  function codeRule(declarations) {
    var selector = isDark ? prefixSelector(codeSurfaces, DARK_ATTR) : codeSurfaces;
    return selector + "{" + declarations + "}";
  }
  function dialogRule(declarations) {
    var selector = isDark ? prefixSelector(dialogSurfaces, DARK_ATTR) : dialogSurfaces;
    return selector + "{" + declarations + "}";
  }
  /**
   * The interface weight, in two reaches: `body` for everything that inherits,
   * plus an element table for the tags DSH pins a weight on of their own (see
   * `WEIGHT_ELEMENT_TABLE`).
   *
   * The offset rides a custom property (`--dfp-wdelta`, declared on
   * `:root,body` by the caller) rather than a literal. That is what keeps the
   * code subtree right without a descendant selector: a highlight `<span>`
   * inside a `<pre>` IS matched by this rule's table, but it resolves the
   * variable its code ancestor set (see the code weight rules), so it takes the
   * code offset instead of the interface one. Naming `pre *` and friends here
   * or in the code rules instead cost 0.03 s per selector per drag.
   *
   * The markdown guard only rides along when the conversation has NO offset of
   * its own — with one set, the class-scoped conversation ladder out-ranks this
   * rule inside markdown anyway.
   */
  function weightRule(declarations) {
    var base = isDark ? DARK_ATTR : "body";
    var selector = base + "," + base + " :where(" + WEIGHT_ELEMENT_TABLE + ")";
    if (dialogDelta === WEIGHT_UNSET) selector += WEIGHT_MARKDOWN_GUARD;
    return selector + "{" + declarations + "}";
  }
  /**
   * The weight one element group resolves to: its own base plus the offset that
   * is in force where the element sits, clamped to the legal CSS range so an
   * extreme offset cannot leave it (a weight below 100 is invalid, above 900 is
   * ignored by the font).
   * @param {number} base - the weight DSH gives this group.
   * @returns {string} the `font-weight` value.
   */
  function ladderWeight(base) {
    return (
      "clamp(" + WEIGHT_CSS_MIN + ",calc(" + base + " + var(--dfp-wdelta,0))," + WEIGHT_CSS_MAX + ")"
    );
  }
  /**
   * The scope the conversation WEIGHT rules hang on: the cheap markdown wrapper
   * (the harvested hint when the page has one, the substring form otherwise).
   *
   * Not the family rule's `dialogSurfaces` list: that one has to reach every
   * descendant because it overrides an inherited family, while the ladder names
   * its own elements — and reusing that list would multiply its ancestor-walking
   * `… *` selectors by five groups, which is exactly the cost the element table
   * was introduced to remove. Code surfaces need no exclusion here either: the
   * code rules pin `--dfp-wdelta` on themselves, so an element inside one adds
   * the offset in force THERE (the code's), which is the value it should get.
   * @returns {string} one selector.
   */
  function weightScopeSelector() {
    return hints !== null && typeof hints === "object" && typeof hints.markdown === "string"
      ? hints.markdown
      : '[class*="_markdown_" i]';
  }
  /**
   * A rule for the conversation scope itself, so text sitting directly in the
   * container moves with the axis (and so `--dfp-wdelta` is pinned for the
   * ladder below before any child resolves it).
   * @param {string} declarations - the declarations to write.
   * @returns {string} the rule.
   */
  function weightScopeRule(declarations) {
    var scope = weightScopeSelector();
    return (isDark ? DARK_ATTR + " " : "") + scope + "{" + declarations + "}";
  }
  /**
   * The conversation ladder: one rule per group in `DIALOG_WEIGHT_GROUPS`, each
   * scoped under the conversation.
   * @param {string} surfaceList - a comma-separated selector list.
   * @returns {string[]} one rule per group.
   */
  function weightLadderRules(surfaceList) {
    var rules = [];
    var surfaces = splitSelectorList(surfaceList);
    for (var groupIndex = 0; groupIndex < DIALOG_WEIGHT_GROUPS.length; groupIndex += 1) {
      var group = DIALOG_WEIGHT_GROUPS[groupIndex];
      var scoped = [];
      for (var surfaceIndex = 0; surfaceIndex < surfaces.length; surfaceIndex += 1) {
        var one = surfaces[surfaceIndex] + " :is(" + group.elements + ")";
        scoped.push(isDark ? DARK_ATTR + " " + one : one);
      }
      rules.push(scoped.join(",") + "{font-weight:" + ladderWeight(group.base) + " !important}");
    }
    return rules;
  }
  /**
   * Re-assert the code family inside the dialog: scoped under the markdown
   * container, after the dialog rule and above it in specificity, so a
   * serif conversation keeps monospaced code.
   */
  function pushScopedCodeFamily() {
    var scopedCode = [];
    var surfaces = splitSelectorList(codeSurfaces);
    for (var cIndex = 0; cIndex < surfaces.length; cIndex += 1) {
      var scoped = '[class*="_markdown_" i] ' + surfaces[cIndex];
      // The dark variant has to carry the theme attribute like every other
      // rule here, or a per-theme set would re-assert the LIGHT code family
      // inside the dark dialog.
      scopedCode.push(isDark ? DARK_ATTR + " " + scoped : scoped);
    }
    declarations.push(scopedCode.join(",") + "{font-family:" + mono + " !important}");
  }

  // ---- families ----
  if (sans !== "") {
    declarations.push(
      (isDark ? DARK_ATTR : ":root,body") + "{--dsw-font-family:" + sans + " !important}"
    );
    declarations.push((isDark ? DARK_ATTR : "body") + "{font-family:" + sans + " !important}");
  }
  if (mono !== "") {
    // The theme's code tokens chain to `--ds-font-family-code`; the other name
    // is what dsh-ui-font historically wrote and costs nothing to cover.
    declarations.push(
      (isDark ? DARK_ATTR : ":root,body") +
        "{--dsw-font-mono:" +
        mono +
        " !important;--ds-font-family-code:" +
        mono +
        " !important}"
    );
    // Written after the interface family rule: equal specificity on a code
    // element means the later declaration wins, so code keeps its own family.
    declarations.push(codeRule("font-family:" + mono + " !important"));
  }

  // ---- interface size / line height: RETIRED, and deliberately so ----
  // Verified against DSH 0.1.5-rc.2: the official settings expose exactly one
  // size hook, the CONVERSATION font size (`--dsh-content-font-size`). The
  // interface ladder tokens (`--dsw-font-xs-13`, `--dsw-font-s-14`, …) are
  // consumed only by conversation-area widgets (tool cards, trajectory,
  // attachment chips — 6 client-ui packages), while the settings sheet, the
  // left workspace/sidebar and the right sidebar declare their text sizes as
  // literals inside their own CSS modules. There is therefore no interface
  // size or line-height hook: scaling the ladder from these fields moved
  // nothing a user could recognise as "interface", and scaling the content
  // chain from them moved the conversation. The durable fields stay in the
  // schema (old documents keep parsing, presets keep round-tripping) but inject
  // nothing at all. The interface axis that DOES work is the family (a
  // page-wide `font-family` on body plus the theme variable) and the weight
  // (below).

  // ---- interface weight (a relative offset) ----
  // A `body{font-weight}` rule only reaches the elements that INHERIT their
  // weight; the chrome's `button` / `span` / `div` class rules pin their own
  // (measured on 0.1.5-rc.3), which is why the second reach exists. The
  // conversation is held apart by `weightRule`'s guard (or by the class-scoped
  // conversation ladder when the conversation has an offset of its own).
  //
  // The value is an OFFSET on the element's own weight, never a replacement, so
  // raising the interface weight cannot flatten anything that shipped heavier
  // than the base. The offset rides `--dfp-wdelta` so the code rules can pin it
  // back to zero (or to the code offset) on their surfaces without any
  // descendant selector.
  var interfaceDelta = typeof axis[WEIGHT_FIELD] === "number" ? axis[WEIGHT_FIELD] : WEIGHT_UNSET;
  var codeWeight = typeof axis[CODE_WEIGHT_FIELD] === "number" ? axis[CODE_WEIGHT_FIELD] : WEIGHT_UNSET;
  if (interfaceDelta !== WEIGHT_UNSET) {
    declarations.push(
      (isDark ? DARK_ATTR : ":root,body") + "{--dfp-wdelta:" + interfaceDelta + "}"
    );
    declarations.push(weightRule("font-weight:" + ladderWeight(WEIGHT_BASE) + " !important"));
    if (codeWeight === WEIGHT_UNSET) {
      // The code rules come after this one and win on their own (class hooks by
      // specificity, element selectors by order), so code surfaces — which
      // inherit nothing but start from the body weight — are reset here.
      // `normal` is what DSH computes for them (the code `font` shorthands
      // carry no weight), so an unset code weight keeps code exactly as DSH
      // shipped it. The offset is pinned to zero alongside so an element INSIDE
      // a code surface (which the interface table matches) lands on `normal`
      // too.
      declarations.push(codeRule("font-weight:normal !important;--dfp-wdelta:0"));
    }
  }

  // ---- dialog family (scoped; skipped when it equals the interface) ----
  if (dialog !== "" && dialog !== sans) {
    declarations.push(dialogRule("font-family:" + dialog + " !important"));
    if (mono !== "") {
      // Keep the code family inside the dialog.
      pushScopedCodeFamily();
    }
  }

  // ---- dialog weight (a relative offset, applied element by element) ----
  // The conversation cannot take one flat weight: DSH gives h1..h3 700,
  // h4..h6/strong 600, th 500 and the rest 400, all inside `font` shorthands, so
  // a single `font-weight: <value> !important` on the markdown scope replaced
  // every one of them with that value — setting the axis at all flattened the
  // headings (measured on 0.1.7-rc.2: `##` came out at the body weight). The
  // ladder below re-states each group's own base PLUS the offset, so the
  // hierarchy survives any offset, in both directions, and `d = 0` injects
  // nothing at all.
  if (dialogDelta === WEIGHT_UNSET && interfaceDelta !== WEIGHT_UNSET) {
    // The conversation has NO offset of its own — which is exactly why it has to
    // say so. The interface axis declares `--dfp-wdelta` on `:root,body`, so an
    // unset conversation INHERITED it: with the interface at +80 the card showed 0
    // for the conversation while the page rendered +80, and the first notch above
    // it only added 20 units — a step nobody can see (measured on 0.1.7-rc.2:
    // `delta` read 80 at the "0" position and 100 at "+1"). Pinning zero keeps
    // "0 = leave DSH alone" true no matter what the other axes are set to.
    declarations.push(weightScopeRule("--dfp-wdelta:0"));
  }
  if (dialogDelta !== WEIGHT_UNSET) {
    // Every ladder rule reads `--dfp-wdelta`, so the conversation pins it to its
    // own offset: the interface's value must not leak in, and an element inside
    // a code surface inside the conversation still resolves the code offset that
    // the code rules pin on their own surfaces. The scope itself takes the base
    // group's weight, so text sitting directly in the container moves with the
    // axis exactly as it did when the axis was absolute.
    declarations.push(
      weightScopeRule(
        "--dfp-wdelta:" + dialogDelta + ";font-weight:" + ladderWeight(WEIGHT_BASE) + " !important"
      )
    );
    var dialogLadder = weightLadderRules(weightScopeSelector());
    for (var ladderIndex = 0; ladderIndex < dialogLadder.length; ladderIndex += 1) {
      declarations.push(dialogLadder[ladderIndex]);
    }
    // The card's conversation preview simulates this surface, so it takes the
    // same ladder (and is excluded from the interface rule above).
    declarations.push(
      (isDark ? DARK_ATTR + " " : "") +
        ".dfp-previewDialog{--dfp-wdelta:" +
        dialogDelta +
        ";font-weight:" +
        ladderWeight(WEIGHT_BASE) +
        " !important}"
    );
    var previewLadder = weightLadderRules(".dfp-previewDialog");
    for (var previewIndex = 0; previewIndex < previewLadder.length; previewIndex += 1) {
      declarations.push(previewLadder[previewIndex]);
    }
  }

  // ---- dialog size offset (additive, on the official content-size source) ----
  // Every markdown size derives from the official content-size chain, and that
  // chain is COMPUTED ON BODY: custom properties resolve where they are
  // declared, so overriding the size deeper down would leave the derived tokens
  // (secondary size, both deltas, delta-based heading sizes, heights) at their
  // body-computed values. The offset is therefore added once, at the source —
  // `--dsh-content-font-size` becomes "official base + offset" — and the whole
  // ladder follows by derivation, with nothing counted twice. The retired
  // interface size axis never touches this chain at all, so the conversation
  // moves only when this axis says so, and a dialog that FOLLOWS the interface
  // follows it through this value.
  var dialogOffsetValue = axis[SIZE_DIALOG_FIELD];
  if (dialogOffsetValue !== 0) {
    var contentSources = tokenNames(baseTokens).filter(function (name) {
      // The source property, by NAME: `--dsh-content-font-size`. The derived
      // members of the chain (`-delta`, `-size-secondary`, the markdown
      // shorthands) all read it, so shifting them as well would count the offset
      // twice.
      if (name !== CONTENT_SIZE_SOURCE) return false;
      return isLiteralTokenValue(baseTokens[name]);
    });
    var contentShift = shiftTokens(contentSources, baseTokens, dialogOffsetValue);
    if (contentShift.length > 0) declarations.push(rootRule(contentShift.join(";")));
    // The `small` series is the only markdown family with literal sizes: it does
    // not derive from the chain, so its parts and shorthands shift here — and
    // ONLY it, by name. A value test cannot stand in for the name: the page also
    // carries `--dsw-font-markdown-h1` with its var() already substituted, which
    // looks like a literal and used to take the offset a second time (H1/H2
    // shrank, H3 did not).
    var literals = markdownTokenNames(baseTokens).filter(function (name) {
      return (
        isMarkdownLiteralToken(name) &&
        name.indexOf("-font-size") >= 0 &&
        isLiteralTokenValue(baseTokens[name])
      );
    });
    var literalShift = shiftTokens(literals, baseTokens, dialogOffsetValue);
    if (literalShift.length > 0) declarations.push(rootRule(literalShift.join(";")));
    var sizeShifted = [];
    var markdownEntries = shorthandTokens(baseTokens).filter(function (entry) {
      return isMarkdownLiteralToken(entry.name) && isLiteralTokenValue(entry.parts.size);
    });
    for (var mIndex = 0; mIndex < markdownEntries.length; mIndex += 1) {
      var mEntry = markdownEntries[mIndex];
      var mSize =
        "calc((" + mEntry.parts.size + ") + " + dialogOffsetValue + "px)";
      sizeShifted.push(
        mEntry.name + ":" + rebuildShorthand({ lead: mEntry.parts.lead, size: mSize, height: mEntry.parts.height, family: mEntry.parts.family }) + " !important"
      );
    }
    if (sizeShifted.length > 0) declarations.push(rootRule(sizeShifted.join(";")));
  }

  // ---- dialog line height (ratio, through the shorthand heights) ----
  var dialogLine = axis[LINE_HEIGHT_DIALOG_FIELD];
  if (dialogLine !== LINE_HEIGHT_MIN) {
    var dialogFactor = round(dialogLine / LINE_HEIGHT_MIN, 6);
    var markdownLines = markdownTokenNames(baseTokens).filter(function (name) {
      return name.indexOf("-line-height") >= 0;
    });
    var dialogLineDecls = scaleLineTokens(markdownLines, baseTokens, dialogFactor);
    if (dialogLineDecls.length > 0) declarations.push(rootRule(dialogLineDecls.join(";")));
    var dialogShorthandList = markdownShorthandTokens(baseTokens);
    var dialogShorthandShifted = [];
    for (var dIndex = 0; dIndex < dialogShorthandList.length; dIndex += 1) {
      var dEntry = dialogShorthandList[dIndex];
      dialogShorthandShifted.push(
        dEntry.name +
          ":" +
          rebuildShorthand({
            lead: dEntry.parts.lead,
            size: dEntry.parts.size,
            height: "calc((" + dEntry.parts.height + ") * " + dialogFactor + ")",
            family: dEntry.parts.family,
          }) +
          " !important"
      );
    }
    if (dialogShorthandShifted.length > 0) {
      declarations.push(rootRule(dialogShorthandShifted.join(";")));
    }
  }

  // ---- code axes ----
  var codeSize = axis[CODE_SIZE_FIELD];
  var codeLine = axis[CODE_LINE_HEIGHT_FIELD];
  if (codeSize !== 0 || codeLine !== 0) {
    var codeScaled = scaleCodeTokens(
      baseTokens,
      round(scaleFor(codeSize), 6),
      codeLine
    );
    if (codeScaled.length > 0) declarations.push(rootRule(codeScaled.join(";")));
  }
  if (codeWeight !== WEIGHT_UNSET) {
    // The code axis is a relative offset too (all three weight axes share one
    // scale, so the card shows one kind of control). Pinning the offset here
    // instead of writing a flat `font-weight` keeps whatever weight a code
    // surface ships with AND is what makes the elements INSIDE a code surface —
    // which the interface table and the conversation ladder both match — resolve
    // the code offset rather than the surrounding one, without any `… *`
    // selector. `WEIGHT_BASE` is what DSH's code `font` shorthands carry.
    declarations.push(
      codeRule(
        "font-weight:" + ladderWeight(WEIGHT_BASE) + " !important;--dfp-wdelta:" + codeWeight
      )
    );
  }
  var ligatures = axis[LIGATURES_FIELD];
  if (ligatures === LIGATURES_ON) {
    declarations.push(codeRule("font-variant-ligatures:contextual !important"));
  } else if (ligatures === LIGATURES_OFF) {
    declarations.push(codeRule("font-variant-ligatures:none !important"));
  }
  var features = axis[FEATURES_FIELD];
  if (features !== "") {
    declarations.push(codeRule("font-feature-settings:" + features + " !important"));
  }

  // ---- synthesis (faux italic / faux bold) ----
  var noItalic = axis[NO_SYNTHETIC_ITALIC_FIELD] === true;
  var noBold = axis[NO_SYNTHETIC_BOLD_FIELD] === true;
  if (noItalic && noBold) {
    declarations.push(bodyRule("font-synthesis:none !important"));
  } else {
    if (noItalic) declarations.push(bodyRule("font-synthesis-style:none !important"));
    if (noBold) declarations.push(bodyRule("font-synthesis-weight:none !important"));
  }

  return declarations.join("\n");
}

/**
 * Re-declare the markdown code tokens at their own ratio and line offset.
 *
 * Two shapes exist and both must be covered, because the shipped stylesheets
 * consume the shorthand (`font: var(--dsw-font-markdown-code-block-small)`)
 * while the split tokens exist for anything that asks for a single part:
 * `11px/19px <family>` and a bare `11px`. The shorthand's height rides BOTH
 * the ratio and the additive offset; the size rides the ratio only.
 *
 * @param {Record<string, string>} baseTokens - token name to untouched value.
 * @param {number} scale - the size ratio to apply.
 * @param {number} [lineOffset=0] - additive px on the height.
 * @returns {string[]} declarations.
 */
function scaleCodeTokens(baseTokens, scale, lineOffset) {
  var shift = typeof lineOffset === "number" && lineOffset !== 0 ? lineOffset : 0;
  // The code axis covers every `--dsw-font-markdown-code*` token exactly once:
  // a value that parses as a shorthand rides the shorthand path, everything
  // else the part path.
  var entries = [];
  var seen = {};
  var all = tokenNames(baseTokens).filter(isCodeToken);
  for (var aIndex = 0; aIndex < all.length; aIndex += 1) {
    seen[all[aIndex]] = true;
    entries.push({ name: all[aIndex], value: baseTokens[all[aIndex]] });
  }
  var shorthands = shorthandTokens(baseTokens);
  for (var sIndex = 0; sIndex < shorthands.length; sIndex += 1) {
    var entry = shorthands[sIndex];
    if (!isCodeToken(entry.name) || seen[entry.name] === true) continue;
    seen[entry.name] = true;
    entries.push({ name: entry.name, value: baseTokens[entry.name] });
  }
  var out = [];
  for (var index = 0; index < entries.length; index += 1) {
    var name = entries[index].name;
    var base = entries[index].value;
    if (typeof base !== "string" || base === "") continue;
    var parsed = parseShorthand(base);
    if (parsed !== null) {
      var size = scale === 1 ? parsed.size : "calc((" + parsed.size + ") * " + scale + ")";
      var height = "calc((" + parsed.height + ") * " + scale + ")";
      if (shift !== 0) height = "calc(" + height + " + " + shift + "px)";
      out.push(
        name +
          ":" +
          rebuildShorthand({ lead: parsed.lead, size: size, height: height, family: parsed.family }) +
          " !important"
      );
      continue;
    }
    // A part token that derives from another token follows that token's own
    // scaling; re-declaring it here would compound the ratio — except the
    // line-height parts, which must additionally carry the offset.
    if (base.indexOf("var(") !== -1 && !(name.indexOf("-line-height") >= 0 && shift !== 0)) continue;
    if (!isScalableValue(base)) continue;
    if (name.indexOf("-line-height") >= 0 && shift !== 0) {
      out.push(
        name +
          ":calc(((" + base + ") * " + scale + ") + " + shift + "px) !important"
      );
    } else {
      out.push(name + ":calc((" + base + ") * " + scale + ") !important");
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * entry point
 * ------------------------------------------------------------------ */

/**
 * Build the stylesheet one configuration applies.
 *
 * The configuration resolves into a light set and — when `perTheme` is on — a
 * dark set; the light rules are emitted unprefixed and the dark rules carry
 * the dark-theme attribute, so the dark set wins by specificity exactly while
 * that theme is active. When `perTheme` is off, or the dark set equals the
 * light set, no prefixed rules are emitted at all.
 *
 * @param {unknown} config - normalized or raw configuration.
 * @param {Record<string, string>} [baseTokens] - token name to untouched value.
 * @param {{markdown?: string, code?: string[], terminal?: string[]}} [hints] - what
 *   the page harvested: the stable markdown wrapper, and the real class tokens
 *   behind the code/terminal hooks. Absent means "match by substring", which is
 *   correct everywhere and costs an attribute scan per element per rule.
 * @returns {string} declarations for one `<style>` element ("" when dormant).
 */
function buildFontCss(config, baseTokens, hints) {
  var tokens = baseTokens === undefined || baseTokens === null ? FALLBACK_TOKENS : baseTokens;
  var sets = resolveAxes(config);
  // The rendering preference is NOT an axis: it must paint even when every
  // axis is dormant — "the strokes are drawn the other way" is exactly its own
  // use case with everything else untouched.
  var smoothing = smoothingRule(config !== null && typeof config === "object" ? config[SMOOTHING_FIELD] : "");
  if (isDormant(sets.light) && isDormant(sets.dark)) return smoothing;
  var light = buildAxisCss(sets.light, tokens, false, hints);
  if (sameValueSet(sets.light, sets.dark)) {
    return smoothing === "" ? light : light === "" ? smoothing : light + "\n" + smoothing;
  }
  var dark = buildAxisCss(sets.dark, tokens, true, hints);
  var parts = [];
  if (light !== "") parts.push(light);
  if (dark !== "") parts.push(dark);
  if (smoothing !== "") parts.push(smoothing);
  return parts.join("\n");
}

/**
 * Whether two axis sets produce the same declarations, compared over the
 * visual fields only (the storage fields — presets, the dark map itself —
 * never render).
 * @param {Record<string, unknown>} left - an expanded axis set.
 * @param {Record<string, unknown>} right - another expanded axis set.
 * @returns {boolean}
 */
function sameValueSet(left, right) {
  for (var index = 0; index < VALUE_FIELDS.length; index += 1) {
    var field = VALUE_FIELDS[index];
    if (left[field] !== right[field]) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * embedded fallback map
 * ------------------------------------------------------------------ */

/**
 * Embedded fallback for the tokens the theme plugin defines at runtime.
 *
 * The live document is always preferred; this map only covers the window
 * before those declarations exist (and any token a future release renames
 * away from the pattern). Values are read byte for byte from the theme's own
 * stylesheet in DSH 0.1.5-rc.2.
 */
var FALLBACK_TOKENS = {
  // interface ladder shorthands
  "--dsw-font-xxxs-11": "11px/14px var(--dsw-font-family)",
  "--dsw-font-xxxs-strong-11": "500 11px/14px var(--dsw-font-family)",
  "--dsw-font-xxs-12": "12px/18px var(--dsw-font-family)",
  "--dsw-font-xxs-strong-12": "500 12px/18px var(--dsw-font-family)",
  "--dsw-font-xs-13": "13px/20px var(--dsw-font-family)",
  "--dsw-font-xs-strong-13": "500 13px/20px var(--dsw-font-family)",
  "--dsw-font-s-14": "14px/22px var(--dsw-font-family)",
  "--dsw-font-s-strong-14": "500 14px/22px var(--dsw-font-family)",
  "--dsw-font-base-16": "16px/24px var(--dsw-font-family)",
  "--dsw-font-base-strong-16": "500 16px/24px var(--dsw-font-family)",
  "--dsw-font-m-18": "500 16px/28px var(--dsw-font-family)",
  "--dsw-font-l-20": "500 20px/28px var(--dsw-font-family)",
  "--dsw-font-xl-24": "600 24px/32px var(--dsw-font-family)",
  // interface ladder parts
  "--dsw-font-xxxs-11-font-size": "11px",
  "--dsw-font-xxxs-11-line-height": "14px",
  "--dsw-font-xxxs-strong-11-font-size": "11px",
  "--dsw-font-xxxs-strong-11-line-height": "14px",
  "--dsw-font-xxs-12-font-size": "12px",
  "--dsw-font-xxs-12-line-height": "18px",
  "--dsw-font-xxs-strong-12-font-size": "12px",
  "--dsw-font-xxs-strong-12-line-height": "18px",
  "--dsw-font-xs-13-font-size": "13px",
  "--dsw-font-xs-13-line-height": "20px",
  "--dsw-font-xs-strong-13-font-size": "13px",
  "--dsw-font-xs-strong-13-line-height": "20px",
  "--dsw-font-s-14-font-size": "14px",
  "--dsw-font-s-14-line-height": "22px",
  "--dsw-font-s-strong-14-font-size": "14px",
  "--dsw-font-s-strong-14-line-height": "22px",
  "--dsw-font-base-16-font-size": "16px",
  "--dsw-font-base-16-line-height": "24px",
  "--dsw-font-base-strong-16-font-size": "16px",
  "--dsw-font-base-strong-16-line-height": "24px",
  "--dsw-font-m-18-font-size": "16px",
  "--dsw-font-m-18-line-height": "28px",
  "--dsw-font-l-20-font-size": "20px",
  "--dsw-font-l-20-line-height": "28px",
  "--dsw-font-xl-24-font-size": "24px",
  "--dsw-font-xl-24-line-height": "32px",
  // markdown (dialog) shorthands
  "--dsw-font-markdown-h1": "700 calc(21px + var(--dsh-content-font-delta)) / calc(30px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
  "--dsw-font-markdown-h2": "700 calc(19px + var(--dsh-content-font-delta)) / calc(28px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
  "--dsw-font-markdown-h3": "700 calc(18px + var(--dsh-content-font-delta)) / calc(26px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
  "--dsw-font-markdown-h4": "600 var(--dsh-content-font-size,14px) / calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
  "--dsw-font-markdown-base": "var(--dsh-content-font-size,14px) / calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
  "--dsw-font-markdown-base-strong": "600 var(--dsh-content-font-size,14px) / calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
  "--dsw-font-markdown-base-italic": "italic var(--dsh-content-font-size,14px) / calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
  "--dsw-font-markdown-base-strong-italic": "italic 600 var(--dsh-content-font-size,14px) / calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
  "--dsw-font-markdown-table": "var(--dsh-content-font-size-secondary,13px)/calc(22px + var(--dsh-content-font-delta-secondary,0px)) var(--dsw-font-family)",
  "--dsw-font-markdown-table-head": "500 var(--dsh-content-font-size-secondary,13px)/calc(22px + var(--dsh-content-font-delta-secondary,0px)) var(--dsw-font-family)",
  "--dsw-font-markdown-small": "12px/20px var(--dsw-font-family)",
  "--dsw-font-markdown-small-strong": "600 12px/20px var(--dsw-font-family)",
  "--dsw-font-markdown-small-italic": "italic 12px/20px var(--dsw-font-family)",
  "--dsw-font-markdown-small-strong-italic": "italic 600 12px/20px var(--dsw-font-family)",
  // markdown small-series literals (the additive dialog offset rewrites these)
  "--dsw-font-markdown-small-font-size": "12px",
  "--dsw-font-markdown-small-line-height": "20px",
  "--dsw-font-markdown-small-strong-font-size": "12px",
  "--dsw-font-markdown-small-strong-line-height": "20px",
  "--dsw-font-markdown-small-italic-font-size": "12px",
  "--dsw-font-markdown-small-italic-line-height": "20px",
  "--dsw-font-markdown-small-strong-italic-font-size": "12px",
  "--dsw-font-markdown-small-strong-italic-line-height": "20px",
  // markdown part tokens (the dialog line-height ratio scales their heights;
  // their var-derived sizes ride the delta tokens, never the ratio)
  "--dsw-font-markdown-base-font-size": "var(--dsh-content-font-size,14px)",
  "--dsw-font-markdown-base-line-height": "calc(24px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-base-strong-font-size": "var(--dsh-content-font-size,14px)",
  "--dsw-font-markdown-base-strong-line-height": "calc(24px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-base-italic-font-size": "var(--dsh-content-font-size,14px)",
  "--dsw-font-markdown-base-italic-line-height": "calc(24px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-base-strong-italic-font-size": "var(--dsh-content-font-size,14px)",
  "--dsw-font-markdown-base-strong-italic-line-height": "calc(24px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-h1-font-size": "calc(21px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-h1-line-height": "calc(30px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-h2-font-size": "calc(19px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-h2-line-height": "calc(28px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-h3-font-size": "calc(18px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-h3-line-height": "calc(26px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-h4-font-size": "var(--dsh-content-font-size,14px)",
  "--dsw-font-markdown-h4-line-height": "calc(24px + var(--dsh-content-font-delta))",
  "--dsw-font-markdown-table-font-size": "var(--dsh-content-font-size-secondary,13px)",
  "--dsw-font-markdown-table-line-height": "calc(22px + var(--dsh-content-font-delta-secondary,0px))",
  "--dsw-font-markdown-table-head-font-size": "var(--dsh-content-font-size-secondary,13px)",
  "--dsw-font-markdown-table-head-line-height": "calc(22px + var(--dsh-content-font-delta-secondary,0px))",
  // markdown delta tokens (the dialog offset shifts these additively)
  "--dsh-content-font-delta": "calc(var(--dsh-content-font-size,14px) - 14px)",
  "--dsh-content-font-delta-secondary": "calc(var(--dsh-content-font-size-secondary) - 13px)",
  // the code family: shorthand + parts, at rc.2's values
  "--dsw-font-markdown-code": "12px/19px var(--ds-font-family-code)",
  "--dsw-font-markdown-code-font-size": "12px",
  "--dsw-font-markdown-code-line-height": "19px",
  "--dsw-font-markdown-code-block": "11px/19px var(--ds-font-family-code)",
  "--dsw-font-markdown-code-block-font-size": "11px",
  "--dsw-font-markdown-code-block-line-height": "19px",
  "--dsw-font-markdown-code-block-small": "11px/16px var(--ds-font-family-code)",
  "--dsw-font-markdown-code-block-small-font-size": "11px",
  "--dsw-font-markdown-code-block-small-line-height": "16px",
  // content size (the interface chain's anchor, written inline by the theme)
  "--dsh-content-font-size": "14px",
  "--dsh-content-font-size-secondary": "13px",
};

/* ------------------------------------------------------------------ *
 * curated family lists
 * ------------------------------------------------------------------ */

/**
 * Curated families offered when the browser cannot enumerate local fonts —
 * and offered first even when it can, because a working CJK stack is the
 * common case and scrolling a thousand families is not.
 */
var PRESETS = {
  mono: [
    "JetBrains Mono",
    "Cascadia Code",
    "Cascadia Mono",
    "Fira Code",
    "Source Code Pro",
    "IBM Plex Mono",
    "Roboto Mono",
    "SF Mono",
    "Menlo",
    "Consolas",
    "DejaVu Sans Mono",
    "Sarasa Mono SC",
    "Sarasa Mono HC",
    "Noto Sans Mono CJK SC",
    "Microsoft YaHei Mono",
    "monospace",
  ],
  cjk: [
    "Microsoft YaHei",
    "Microsoft YaHei UI",
    "微软雅黑",
    "PingFang SC",
    "Hiragino Sans GB",
    "Source Han Sans SC",
    "Noto Sans SC",
    "Noto Sans CJK SC",
    "Sarasa Gothic SC",
    "SimSun",
    "宋体",
    "NSimSun",
    "SimHei",
    "黑体",
    "KaiTi",
    "楷体",
    "FangSong",
    "仿宋",
    "Microsoft JhengHei",
    "DengXian",
    "HarmonyOS Sans SC",
    "Alibaba PuHuiTi 3",
  ],
  latin: [
    "Inter",
    "Segoe UI",
    "Segoe UI Variable",
    "Helvetica Neue",
    "Arial",
    "Calibri",
    "Tahoma",
    "Verdana",
    "Georgia",
    "Times New Roman",
    "Cambria",
  ],
  generic: ["system-ui", "sans-serif", "serif"],
};

/**
 * The curated groups, in the order the picker lists them.
 */
var PRESET_GROUPS = [
  { label: "stack.groupMono", families: PRESETS.mono },
  { label: "stack.groupCjk", families: PRESETS.cjk },
  { label: "stack.groupLatin", families: PRESETS.latin },
  { label: "stack.groupGeneric", families: PRESETS.generic },
];

/**
 * How many enumerated families the "installed on this machine" group shows.
 * The curated groups are the short list; this one is the complete one, so the
 * cap is only a guard against a machine with an absurd number of families.
 */
var MAX_LOCAL_FONTS = 240;

/**
 * Build the family picker's groups.
 *
 * The curated groups are ALWAYS listed: whether or not the browser enumerated
 * local fonts, and whether or not a search is running. The old shape skipped
 * them whenever a working catalog met a non-empty query, so a curated family
 * this machine has not installed could not be found by name at all. Every
 * family is listed in exactly one group — the local enumeration gives way to
 * the curated headings rather than repeating what they already offer.
 *
 * @param {object} input - the picker's state.
 * @param {string[]} [input.stack] - the families the stored value names.
 * @param {boolean} [input.single] - single-pick mode (a West/CJK slot).
 * @param {string} [input.query] - the search text.
 * @param {{status: string, families: string[]}} [input.catalog] - enumeration.
 * @param {number} [input.maxLocal] - cap on the local group's rows.
 * @returns {Array<{label: string, families: string[]}>} the groups, in the
 *   order the picker displays them.
 */
function pickerGroups(input) {
  var stack = Array.isArray(input.stack) ? input.stack : [];
  var single = input.single === true;
  var query = typeof input.query === "string" ? input.query : "";
  var catalog =
    input.catalog && typeof input.catalog === "object"
      ? input.catalog
      : { status: "loading", families: [] };
  var maxLocal = typeof input.maxLocal === "number" ? input.maxLocal : MAX_LOCAL_FONTS;
  var needle = query.trim().toLowerCase();
  var index;
  var matches = function (name) {
    return needle === "" || String(name).toLowerCase().indexOf(needle) >= 0;
  };

  // Which families the stack already names. In single mode the stack IS the
  // one pick, and it stays visible in the curated groups (with its check mark)
  // so the reader can see where it sits among its own kind.
  var inStack = {};
  if (!single) {
    for (index = 0; index < stack.length; index += 1) {
      inStack[String(stack[index]).toLowerCase()] = true;
    }
  }

  // The curated groups are built FIRST, and the local list gives way to them:
  // they are the short list the reader scans, and on a real Windows machine
  // most of the Latin group is installed, so letting the local list win would
  // empty the curated headings. Everything lands in exactly one group.
  var curatedLower = {};
  var curatedGroups = [];
  for (index = 0; index < PRESET_GROUPS.length; index += 1) {
    var curated = PRESET_GROUPS[index];
    var rows = [];
    for (var nameIndex = 0; nameIndex < curated.families.length; nameIndex += 1) {
      var name = sanitizeFamily(curated.families[nameIndex]);
      if (name === "" || !matches(name)) continue;
      var key = name.toLowerCase();
      if (inStack[key] === true || curatedLower[key] === true) continue;
      curatedLower[key] = true;
      rows.push(name);
    }
    if (rows.length > 0) curatedGroups.push({ label: curated.label, families: rows });
  }

  // Then the enumeration: the complete list, minus everything already offered
  // by a heading above it.
  var localRows = [];
  if (catalog.status === "ready") {
    var locals = Array.isArray(catalog.families) ? catalog.families : [];
    for (index = 0; index < locals.length; index += 1) {
      var localName = sanitizeFamily(locals[index]);
      if (localName === "" || !matches(localName)) continue;
      var localKey = localName.toLowerCase();
      if (inStack[localKey] === true || curatedLower[localKey] === true) continue;
      curatedLower[localKey] = true;
      localRows.push(localName);
      if (localRows.length >= maxLocal) break;
    }
  }

  var groups = [];
  var selectedRows = [];
  for (index = 0; index < stack.length; index += 1) {
    if (matches(stack[index])) selectedRows.push(stack[index]);
  }
  if (selectedRows.length > 0) {
    groups.push({ label: "stack.groupSelected", families: selectedRows });
  }
  for (index = 0; index < curatedGroups.length; index += 1) {
    groups.push(curatedGroups[index]);
  }
  if (localRows.length > 0) {
    groups.push({ label: "stack.groupLocal", families: localRows });
  }
  return groups;
}

/**
 * Whether a cached font-enumeration verdict may be asked for again.
 *
 * A working enumeration is final for the session, and a browser that has no
 * such API at all will never grow one — but a refusal is not: the user can
 * grant the font permission from the browser's prompt or its site settings.
 * Retrying is cheap, because a still-blocked permission is rejected instantly
 * instead of prompting again.
 *
 * @param {{status?: string, at?: number, permanent?: boolean}|null} cache - the cached verdict.
 * @param {number} now - the current time, in milliseconds.
 * @param {number} retryMs - how long a refusal is trusted.
 * @returns {boolean} true when the enumeration should run again.
 */
function catalogRefreshDue(cache, now, retryMs) {
  if (cache === null || cache === undefined) return true;
  if (cache.permanent === true || cache.status === "ready") return false;
  return now - (cache.at || 0) >= retryMs;
}

var shared = {
  NAMESPACE: NAMESPACE,
  SANS_FIELD: SANS_FIELD,
  STACK_DIALOG_FIELD: STACK_DIALOG_FIELD,
  MONO_FIELD: MONO_FIELD,
  SIZE_FIELD: SIZE_FIELD,
  SIZE_DIALOG_FIELD: SIZE_DIALOG_FIELD,
  CODE_SIZE_FIELD: CODE_SIZE_FIELD,
  WEIGHT_FIELD: WEIGHT_FIELD,
  WEIGHT_DIALOG_FIELD: WEIGHT_DIALOG_FIELD,
  CODE_WEIGHT_FIELD: CODE_WEIGHT_FIELD,
  WEIGHT_OFFSETS_FIELD: WEIGHT_OFFSETS_FIELD,
  WEIGHT_FIELDS: WEIGHT_FIELDS,
  PENDING_SET: PENDING_SET,
  PENDING_UNSET: PENDING_UNSET,
  overlayPendingValues: overlayPendingValues,
  reconcilePendingValues: reconcilePendingValues,
  migratePresetWeights: migratePresetWeights,
  LINE_HEIGHT_FIELD: LINE_HEIGHT_FIELD,
  LINE_HEIGHT_DIALOG_FIELD: LINE_HEIGHT_DIALOG_FIELD,
  CODE_LINE_HEIGHT_FIELD: CODE_LINE_HEIGHT_FIELD,
  LIGATURES_FIELD: LIGATURES_FIELD,
  FEATURES_FIELD: FEATURES_FIELD,
  NO_SYNTHETIC_ITALIC_FIELD: NO_SYNTHETIC_ITALIC_FIELD,
  NO_SYNTHETIC_BOLD_FIELD: NO_SYNTHETIC_BOLD_FIELD,
  PER_THEME_FIELD: PER_THEME_FIELD,
  DARK_VALUES_FIELD: DARK_VALUES_FIELD,
  PRESETS_FIELD: PRESETS_FIELD,
  ACTIVE_PRESET_FIELD: ACTIVE_PRESET_FIELD,
  UI_FOLLOWS_FIELD: UI_FOLLOWS_FIELD,
  PANEL_ENABLED_FIELD: PANEL_ENABLED_FIELD,
  PANEL_POS_FIELD: PANEL_POS_FIELD,
  PANEL_CORNER_FIELD: PANEL_CORNER_FIELD,
  PANEL_SIZE_FIELD: PANEL_SIZE_FIELD,
  PANEL_SIZE_DEFAULT_W: PANEL_SIZE_DEFAULT_W,
  PANEL_SIZE_DEFAULT_H: PANEL_SIZE_DEFAULT_H,
  PANEL_SIZE_MIN_W: PANEL_SIZE_MIN_W,
  PANEL_SIZE_MAX_W: PANEL_SIZE_MAX_W,
  PANEL_SIZE_MIN_H: PANEL_SIZE_MIN_H,
  PANEL_SIZE_MAX_H: PANEL_SIZE_MAX_H,
  FLOAT_DOT: FLOAT_DOT,
  FLOAT_MARGIN: FLOAT_MARGIN,
  FLOAT_DRAG_THRESHOLD: FLOAT_DRAG_THRESHOLD,
  FLOAT_VIEWPORT_W: FLOAT_VIEWPORT_W,
  FLOAT_VIEWPORT_H: FLOAT_VIEWPORT_H,
  FLOAT_BOUNDS_MIN: FLOAT_BOUNDS_MIN,
  FLOAT_CLOSE_GAP: FLOAT_CLOSE_GAP,
  FLOAT_CLOSE: FLOAT_CLOSE,
  FLOAT_CLOSE_INSET: FLOAT_CLOSE_INSET,
  FLOAT_SETTINGS_GAP: FLOAT_SETTINGS_GAP,
  FLOAT_CARD_PAD: FLOAT_CARD_PAD,
  FLOAT_CARD_RADIUS: FLOAT_CARD_RADIUS,
  floatBoxOf: floatBoxOf,
  floatBoundsPick: floatBoundsPick,
  floatBoundsFrom: floatBoundsFrom,
  sameWatchBounds: sameWatchBounds,
  floatTargetsConnected: floatTargetsConnected,
  floatQuadrantIn: floatQuadrantIn,
  floatQuadrant: floatQuadrant,
  floatExpandDirection: floatExpandDirection,
  floatTransformOrigin: floatTransformOrigin,
  floatCardAnchor: floatCardAnchor,
  floatClipStart: floatClipStart,
  floatClipRest: floatClipRest,
  isRestClip: isRestClip,
  floatSnapTo: floatSnapTo,
  floatSnapCorner: floatSnapCorner,
  floatNearestCorner: floatNearestCorner,
  floatCornerPoint: floatCornerPoint,
  floatDragExceeded: floatDragExceeded,
  normalizePanelSize: normalizePanelSize,
  parsePanelSize: parsePanelSize,
  PANEL_POS_MAX: PANEL_POS_MAX,
  normalizePanelPos: normalizePanelPos,
  parsePanelPos: parsePanelPos,
  PANEL_CORNERS: PANEL_CORNERS,
  normalizePanelCorner: normalizePanelCorner,
  parsePanelCorner: parsePanelCorner,
  SETTINGS_NAV_ITEM_ATTR: SETTINGS_NAV_ITEM_ATTR,
  SETTINGS_NAV_ITEM_VALUE: SETTINGS_NAV_ITEM_VALUE,
  SETTINGS_NAV_CURRENT_ATTR: SETTINGS_NAV_CURRENT_ATTR,
  SETTINGS_NAV_TEXTS: SETTINGS_NAV_TEXTS,
  SETTINGS_LAUNCHER_TEXTS: SETTINGS_LAUNCHER_TEXTS,
  isSettingsNavItem: isSettingsNavItem,
  isSettingsLauncher: isSettingsLauncher,
  findSettingsEntry: findSettingsEntry,
  PLUGIN_ITEM_ATTR: PLUGIN_ITEM_ATTR,
  PLUGIN_ITEM_VALUE: PLUGIN_ITEM_VALUE,
  PLUGIN_BUNDLE_NAME: PLUGIN_BUNDLE_NAME,
  PLUGIN_PANEL_ID: PLUGIN_PANEL_ID,
  pluginEntryCard: pluginEntryCard,
  pluginClickTarget: pluginClickTarget,
  // The client's own click step needs this: the bundle keeps this module's scope
  // separate from the client's, so a bare name here is a ReferenceError there.
  dispatchSynthetic: dispatchSynthetic,
  mirrorPresetSnapshot: mirrorPresetSnapshot,
  VALUE_FIELDS: VALUE_FIELDS,
  RETIRED_FIELDS: RETIRED_FIELDS,
  DURABLE_FIELDS: DURABLE_FIELDS,
  SIZE_MIN: SIZE_MIN,
  SIZE_MAX: SIZE_MAX,
  WEIGHT_MIN: WEIGHT_MIN,
  WEIGHT_MAX: WEIGHT_MAX,
  WEIGHT_UNSET: WEIGHT_UNSET,
  LINE_HEIGHT_MIN: LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX: LINE_HEIGHT_MAX,
  CODE_LINE_HEIGHT_MIN: CODE_LINE_HEIGHT_MIN,
  CODE_LINE_HEIGHT_MAX: CODE_LINE_HEIGHT_MAX,
  LIGATURES_DEFAULT: LIGATURES_DEFAULT,
  SMOOTHING_FIELD: SMOOTHING_FIELD,
  SMOOTHING_AUTO: SMOOTHING_AUTO,
  SMOOTHING_SHARP: SMOOTHING_SHARP,
  SMOOTHING_SMOOTH: SMOOTHING_SMOOTH,
  SMOOTHING_VALUES: SMOOTHING_VALUES,
  clampSmoothing: clampSmoothing,
  LIGATURES_ON: LIGATURES_ON,
  LIGATURES_OFF: LIGATURES_OFF,
  STYLE_TAG: STYLE_TAG,
  CARD_STYLE_TAG: CARD_STYLE_TAG,
  DEFAULTS: DEFAULTS,
  MAX_STACK_LENGTH: MAX_STACK_LENGTH,
  MAX_FAMILY_LENGTH: MAX_FAMILY_LENGTH,
  MAX_FEATURES_LENGTH: MAX_FEATURES_LENGTH,
  MAX_PRESETS: MAX_PRESETS,
  MAX_PRESET_NAME: MAX_PRESET_NAME,
  FALLBACK_TOKENS: FALLBACK_TOKENS,
  PRESETS: PRESETS,
  PRESET_GROUPS: PRESET_GROUPS,
  MAX_LOCAL_FONTS: MAX_LOCAL_FONTS,
  pickerGroups: pickerGroups,
  catalogRefreshDue: catalogRefreshDue,
  MARKDOWN_SELECTOR: MARKDOWN_SELECTOR,
  codeSelector: codeSelector,
  dialogSelector: dialogSelector,
  CODE_SURFACE_SELECTORS_CHEAP: CODE_SURFACE_SELECTORS_CHEAP,
  CODE_SURFACE_SELECTORS: CODE_SURFACE_SELECTORS,
  CODE_EXCLUDES: CODE_EXCLUDES,
  WEIGHT_MARKDOWN_GUARD: WEIGHT_MARKDOWN_GUARD,
  WEIGHT_ELEMENT_TABLE: WEIGHT_ELEMENT_TABLE,
  excludeAll: excludeAll,
  splitSelectorList: splitSelectorList,
  prefixSelector: prefixSelector,
  DARK_ATTR: DARK_ATTR,
  sanitize: sanitize,
  sanitizeFamily: sanitizeFamily,
  sanitizeFeatures: sanitizeFeatures,
  quoteFamily: quoteFamily,
  normalizeConfig: normalizeConfig,
  normalizeDarkValues: normalizeDarkValues,
  normalizePresets: normalizePresets,
  normalizeValueSet: normalizeValueSet,
  clampOffset: clampOffset,
  clampWeight: clampWeight,
  clampRatio: clampRatio,
  clampLineOffset: clampLineOffset,
  clampLigatures: clampLigatures,
  CODE_SELECTOR: CODE_SELECTOR,
  formatStack: formatStack,
  parseStack: parseStack,
  parseShorthand: parseShorthand,
  rebuildShorthand: rebuildShorthand,
  scaleFor: scaleFor,
  isDormant: isDormant,
  buildAxisCss: buildAxisCss,
  buildFontCss: buildFontCss,
  resolveAxes: resolveAxes,
  expandFollow: expandFollow,
  isFontToken: isFontToken,
  isCodeToken: isCodeToken,
  isMarkdownToken: isMarkdownToken,
  isMarkdownLiteralToken: isMarkdownLiteralToken,
  MARKDOWN_LITERAL_PREFIX: MARKDOWN_LITERAL_PREFIX,
  CONTENT_SIZE_SOURCE: CONTENT_SIZE_SOURCE,
  isLiteralTokenValue: isLiteralTokenValue,
  clampWeightDelta: clampWeightDelta,
  WEIGHT_DELTA_MIN: WEIGHT_DELTA_MIN,
  WEIGHT_DELTA_MAX: WEIGHT_DELTA_MAX,
  WEIGHT_BASE: WEIGHT_BASE,
  DIALOG_WEIGHT_GROUPS: DIALOG_WEIGHT_GROUPS,
  isDeltaToken: isDeltaToken,
  reconcileSliderValue: reconcileSliderValue,
  WEIGHT_STEP_CANDIDATES: WEIGHT_STEP_CANDIDATES,
  WEIGHT_DELTA_FLOOR: WEIGHT_DELTA_FLOOR,
  WEIGHT_DELTA_CEIL: WEIGHT_DELTA_CEIL,
  WEIGHT_MIN_POSITIONS: WEIGHT_MIN_POSITIONS,
  WEIGHT_LADDER_TOP: WEIGHT_LADDER_TOP,
  WEIGHT_LADDER_STRONG: WEIGHT_LADDER_STRONG,
  WEIGHT_DELTA_UP_LIMIT: WEIGHT_DELTA_UP_LIMIT,
  WEIGHT_CSS_MIN: WEIGHT_CSS_MIN,
  WEIGHT_CSS_MAX: WEIGHT_CSS_MAX,
  weightProfileFrom: weightProfileFrom,
  weightStepRange: weightStepRange,
  isShorthandName: isShorthandName,
  isScaledToken: isScaledToken,
  tokenNames: tokenNames,
  markdownTokenNames: markdownTokenNames,
  shorthandTokens: shorthandTokens,
  markdownShorthandTokens: markdownShorthandTokens,
  codeShorthandTokens: codeShorthandTokens,
  isGenericFamilyName: isGenericFamilyName,
  isCJKFamilyName: isCJKFamilyName,
  setWestEntry: setWestEntry,
  setEastEntry: setEastEntry,
  removeStackEntry: removeStackEntry,
};

if (typeof module !== "undefined" && module.exports) module.exports = shared;

	return module.exports;
})();
		// ---- src/client.js ----
/**
 * dsh-fonttune — browser half.
 *
 * Runs inside the DSH web client as a lazy-CJS module bundle (see `build.mjs`).
 * It owns one card in Settings -> Plugins -> Plugin configuration, keyed by the
 * settings namespace the host half registers, and it applies the saved
 * configuration by rewriting a single `<style>` element plus the official
 * `theme.overrideTokens` layer for the family variables.
 *
 * 0.2.x shape: the card is an accordion — four sections (conversation /
 * interface / code / global fine-tuning), each collapsed to a title plus a
 * summary of the current values, at most one open at a time; an expanded
 * section ends with an inline preview of just that part. The preset bar sits
 * under the edit mode: a dropdown of the presets plus rename/import/export, and
 * with a preset selected every edit auto-saves into it. The conversation owns
 * every axis; the interface's section leads with the follow switch — on (the
 * default) it takes the conversation's family and weight and shows no controls
 * of its own, off reveals its own family and weight. Light and dark themes share
 * one value set; the per-theme editor ships in a later release.
 *
 * Module scope stays side-effect free: the loader materializes the factory
 * only when the plugin is first used, and everything that touches the document
 * lives inside `apply`.
 *
 * @module dsh-fonttune/client
 */

var React = require("react");
var createPortal = require("react-dom").createPortal;

var h = React.createElement;
var useCallback = React.useCallback;
var useEffect = React.useEffect;
var useMemo = React.useMemo;
var useRef = React.useRef;
var useState = React.useState;
var useSyncExternalStore = React.useSyncExternalStore;

var shared = __dfpShared;
var NAMESPACE = shared.NAMESPACE;
var SANS_FIELD = shared.SANS_FIELD;
var STACK_DIALOG_FIELD = shared.STACK_DIALOG_FIELD;
var MONO_FIELD = shared.MONO_FIELD;
var SIZE_DIALOG_FIELD = shared.SIZE_DIALOG_FIELD;
var CODE_SIZE_FIELD = shared.CODE_SIZE_FIELD;
var WEIGHT_FIELD = shared.WEIGHT_FIELD;
var WEIGHT_DIALOG_FIELD = shared.WEIGHT_DIALOG_FIELD;
var CODE_WEIGHT_FIELD = shared.CODE_WEIGHT_FIELD;
var LINE_HEIGHT_DIALOG_FIELD = shared.LINE_HEIGHT_DIALOG_FIELD;
var CODE_LINE_HEIGHT_FIELD = shared.CODE_LINE_HEIGHT_FIELD;
var LIGATURES_FIELD = shared.LIGATURES_FIELD;
var FEATURES_FIELD = shared.FEATURES_FIELD;
var NO_SYNTHETIC_ITALIC_FIELD = shared.NO_SYNTHETIC_ITALIC_FIELD;
var NO_SYNTHETIC_BOLD_FIELD = shared.NO_SYNTHETIC_BOLD_FIELD;
var PER_THEME_FIELD = shared.PER_THEME_FIELD;
var DARK_VALUES_FIELD = shared.DARK_VALUES_FIELD;
var PRESETS_FIELD = shared.PRESETS_FIELD;
var WEIGHT_OFFSETS_FIELD = shared.WEIGHT_OFFSETS_FIELD;
var ACTIVE_PRESET_FIELD = shared.ACTIVE_PRESET_FIELD;
var UI_FOLLOWS_FIELD = shared.UI_FOLLOWS_FIELD;
var VALUE_FIELDS = shared.VALUE_FIELDS;
var RETIRED_FIELDS = shared.RETIRED_FIELDS;
var PANEL_ENABLED_FIELD = shared.PANEL_ENABLED_FIELD;
var PANEL_POS_FIELD = shared.PANEL_POS_FIELD;
var PANEL_CORNER_FIELD = shared.PANEL_CORNER_FIELD;
var PANEL_SIZE_FIELD = shared.PANEL_SIZE_FIELD;
var SMOOTHING_FIELD = shared.SMOOTHING_FIELD;
var SMOOTHING_AUTO = shared.SMOOTHING_AUTO;
var SMOOTHING_SHARP = shared.SMOOTHING_SHARP;
var SMOOTHING_SMOOTH = shared.SMOOTHING_SMOOTH;
var SIZE_MIN = shared.SIZE_MIN;
var SIZE_MAX = shared.SIZE_MAX;
var WEIGHT_MIN = shared.WEIGHT_MIN;
var WEIGHT_MAX = shared.WEIGHT_MAX;
var WEIGHT_UNSET = shared.WEIGHT_UNSET;
var WEIGHT_DELTA_MIN = shared.WEIGHT_DELTA_MIN;
var WEIGHT_DELTA_MAX = shared.WEIGHT_DELTA_MAX;
var LINE_HEIGHT_MIN = shared.LINE_HEIGHT_MIN;
var LINE_HEIGHT_MAX = shared.LINE_HEIGHT_MAX;
var CODE_LINE_HEIGHT_MIN = shared.CODE_LINE_HEIGHT_MIN;
var CODE_LINE_HEIGHT_MAX = shared.CODE_LINE_HEIGHT_MAX;
var LIGATURES_DEFAULT = shared.LIGATURES_DEFAULT;
var LIGATURES_ON = shared.LIGATURES_ON;
var LIGATURES_OFF = shared.LIGATURES_OFF;
var CARD_STYLE_TAG = shared.CARD_STYLE_TAG;
var STYLE_TAG = shared.STYLE_TAG;
var FALLBACK_TOKENS = shared.FALLBACK_TOKENS;
var PRESETS = shared.PRESETS;
var DEFAULTS = shared.DEFAULTS;
var buildFontCss = shared.buildFontCss;
var formatStack = shared.formatStack;
var isFontToken = shared.isFontToken;
var isScaledToken = shared.isScaledToken;
var normalizeConfig = shared.normalizeConfig;
var normalizeDarkValues = shared.normalizeDarkValues;
var normalizePresets = shared.normalizePresets;
var normalizeValueSet = shared.normalizeValueSet;
var parseStack = shared.parseStack;
var quoteFamily = shared.quoteFamily;
var reconcileSliderValue = shared.reconcileSliderValue;
var weightProfileFrom = shared.weightProfileFrom;
var weightStepRange = shared.weightStepRange;
var resolveAxes = shared.resolveAxes;
var sanitizeFamily = shared.sanitizeFamily;
var isGenericFamilyName = shared.isGenericFamilyName;
var isCJKFamilyName = shared.isCJKFamilyName;
var setWestEntry = shared.setWestEntry;
var setEastEntry = shared.setEastEntry;
var removeStackEntry = shared.removeStackEntry;

/**
 * Services this bundle waits for before it applies.
 *
 * `settingsScope` is deliberately absent: a host that does not provide a
 * declared service parks the whole package until it appears, and DSH
 * 0.1.7-alpha.x replaced that service with `configForms` — a plugin asking for
 * it never activates there. Both settings dialects are looked up at apply time
 * with `ctx.get` instead (see `pickSettingsScope`).
 */
var inject = ["slots", "locale"];

/**
 * The settings scope and translator `apply` bound, for the seat that renders
 * the card without handing it either: the alpha line's bundle page renders the
 * registered component with its own props, so the card falls back to these.
 */
var cardScope = null;
var cardT = null;

/**
 * The neutral value of the two RELATIVE weight axes: an offset of zero, which
 * means "leave every element at its own weight" and is what the slider's middle
 * position and the "unset" state share.
 */
var NEUTRAL_WEIGHT = 0;

/**
 * Print a weight offset the way the slider reads it: a signed number, so `+60`
 * and `-40` are distinguishable at a glance (plain `String(0)` for neutral).
 * @param {number} value - the offset.
 * @returns {string}
 */
function weightOffsetText(value) {
  return value > 0 ? "+" + value : String(value);
}

/** Panel width, kept in one place because positioning reads it too. */
var PANEL_WIDTH = 320;

/**
 * The host PluginCard's chevron, copied byte for byte from DSH's own frontend
 * bundle (dsh-quick-toc extracted it first and verified the match on the page;
 * their copy is archived in Temp\dqt-chevron-path.txt). A `⌄` character is the
 * wrong icon twice over: at text weight it is thinner than every other card's
 * arrow, and rotating the text span turns it around the text box centre — the
 * glyph sits off-centre on its baseline — so the rotation swings it sideways.
 * An `<svg>` rotates around its own box centre.
 */
var CHEVRON_PATH =
  "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785" +
  "C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602" +
  "C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137" +
  "L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623" +
  "C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047" +
  "C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273" +
  "L10.5762 5.07617L11 4.65137L11.8486 5.5Z";

/** Panel height cap, used to decide whether it opens up or down. */
var PANEL_HEIGHT = 380;

/**
 * The translator the card falls back to when the host hands it no `t`: the
 * built-in English table says something useful where the key alone would not.
 * @param {string} key - dictionary key.
 * @param {Record<string, string>} [params] - `{name}` substitutions.
 * @returns {string} the text.
 */
function fallbackTranslate(key, params) {
  return translate("en", key, params);
}

/**
 * The settings seat a host without any settings service leaves the card: every
 * control renders disabled over an empty document, exactly like a read-only
 * deployment. It keeps the card — and therefore the whole configuration page —
 * from failing to render on a composition this plugin does not know.
 */
var MEMORY_SCOPE = {
  getSnapshot: function () {
    return {
      status: "ready",
      value: {},
      base: {},
      user: {},
      revision: 0,
      writable: false,
      mode: "memory",
    };
  },
  subscribe: function () {
    return function () {};
  },
  set: function () {
    return Promise.reject(new Error("settings are not available in this deployment"));
  },
  unset: function () {
    return Promise.reject(new Error("settings are not available in this deployment"));
  },
};

/* ------------------------------------------------------------------ *
 * inline icons
 * ------------------------------------------------------------------ */

/**
 * The 16px "plus" glyph of the "add a font" button.
 *
 * Drawn here rather than taken from `@deepseek-ai/dsh-client-ui-primitives`
 * because that module's icon names are not stable across the host lines this
 * plugin supports: up to 0.1.5-rc.x the shell exports `IconPlusOutline16`,
 * while 0.1.7-alpha.x ships the same artwork as `IconPlusOutlineRegular` /
 * `IconPlusOutlineMedium` — and requiring a name the shell does not have turns
 * the whole card into a render error. The path is the shipped one, byte for
 * byte, so the button looks identical on both.
 * @returns {object} the svg element.
 */
function plusIcon() {
  return h(
    "svg",
    {
      width: 16,
      height: 16,
      viewBox: "0 0 16 16",
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      "aria-hidden": "true",
    },
    h("path", {
      d: "M8.64453 1.5V7.34961H14.5V8.65039H8.64453V14.5H7.34473V8.65039H1.5V7.34961H7.34473V1.5H8.64453Z",
      fill: "currentColor",
    })
  );
}

/* ------------------------------------------------------------------ *
 * copy
 * ------------------------------------------------------------------ */

var DICTS = {
  en: {
    "card.title": "Font tune",
    "card.description":
      "Interface and conversation fonts, a size, a weight and a line height for each, code extras and presets",
    "card.expand": "Expand",
    "card.collapse": "Collapse",
    "card.resetAll": "Reset all",
    "card.readOnly": "This deployment keeps settings in memory only.",

    "common.overridden": "Changed",
    "common.reset": "Reset",
    "common.on": "On",
    "common.off": "Off",

    "sans.label": "Interface font",
    "sans.hint":
      "Each family is tried in order: put a Latin face first and CJK faces after it. Empty leaves DSH's own stack.",
    "mono.label": "Code font",
    "mono.hint":
      "Applies to code blocks, inline code and monospaced text. Empty leaves DSH's own stack.",

    "stack.empty": "No family selected",
    "stack.add": "Add family",
    "stack.search": "Search families",
    "stack.loading": "Reading the families installed on this machine…",
    "stack.denied":
      "Font access was refused, so the built-in list is shown; any name can still be typed.",
    "stack.unsupported":
      "This browser cannot list installed fonts, so the built-in list is shown; any name can still be typed.",
    "stack.custom": "Use “{name}”",
    "stack.remove": "Remove {name}",
    "stack.drag": "Drag {name} to reorder",
    "stack.earlier": "Move {name} earlier",
    "stack.later": "Move {name} later",
    "stack.done": "Done",
    "stack.groupSelected": "Selected",
    "stack.groupMono": "Monospace",
    "stack.groupCjk": "Chinese (CJK)",
    "stack.groupLatin": "Latin",
    "stack.groupGeneric": "Generic",
    "stack.groupLocal": "Installed on this machine",
    "stack.hintOrder": "Earlier entries win; the first installed family is the one used.",

    "mode.label": "Edit mode",
    "mode.simple": "Basic",
    "mode.advanced": "Advanced",
    "mode.simpleHint":
      "Manages only the front two slots of the stack — Western, then CJK. Everything you ordered in Advanced stays untouched.",
    "sansWest.label": "Interface · Western",
    "sansEast.label": "Interface · CJK",
    "monoWest.label": "Code · Western",
    "monoEast.label": "Code · CJK",
    "split.pick": "Choose…",
    "split.remove": "Remove {name}",
    "split.rest": "Other fallbacks (reorder them in Advanced): {names}",

    "size.dialogLabel": "Conversation font size offset",
    "size.dialogHint":
      "Adds {offset} to the conversation text sizes, on top of DSH's own font-size setting. 0 keeps DSH's sizes.",
    "size.codeLabel": "Code font size offset",
    "size.codeHint":
      "Adds {offset} to code blocks and inline code only; the interface offset does not reach them. 0 keeps DSH's sizes.",
    "size.unit": "px",

    "weight.uiLabel": "Interface font-weight offset",
    "weight.uiHint":
      "Adds to the weight of the whole interface (sidebars, settings, buttons, headings): a positive value is bolder, a negative one lighter. The conversation keeps its own. The slider is divided into the weights the current font can actually render, so the readout counts STEPS (0 = leave DSH alone); every notch swaps in a different face for body text and headings alike, and another font offers a different number of steps. The step is measured for the current font, and its smallest step is the one that looks weakest.",
    "weight.dialogLabel": "Conversation font-weight offset",
    "weight.dialogHint":
      "Adds to the weight of each conversation element, so headings stay bolder than body text and bold text stays bold. Unset keeps DSH's own weights. The slider is divided into the weights the current font can actually render, so the readout counts STEPS (0 = leave DSH alone); every notch swaps in a different face for body text and headings alike, and another font offers a different number of steps. The step is measured for the current font, and its smallest step is the one that looks weakest.",
    "weight.codeLabel": "Code font-weight offset",
    "weight.codeHint":
      "Adds to the weight of each code surface (code blocks, inline code, terminal output); 0 or unset keeps DSH's own weight. The slider is divided into the weights the current font can actually render, so the readout counts STEPS (0 = leave DSH alone); every notch swaps in a different face for body text and headings alike, and another font offers a different number of steps. The step is measured for the current font, and its smallest step is the one that looks weakest.",

    "line.dialogLabel": "Conversation line height",
    "line.dialogHint":
      "Scales every conversation line height by {ratio}. 100% keeps DSH's own line heights.",
    "line.codeLabel": "Code line height",
    "line.codeHint":
      "Adds {offset} to code line heights only; 0 keeps DSH's own line heights.",
    "line.unit": "%",

    "lig.label": "Code ligatures",
    "lig.hint":
      "Programming ligatures render multiple characters as one glyph (=> as an arrow, != as ≠). Browsers enable them by default.",
    "lig.default": "Default",
    "lig.on": "On",
    "lig.off": "Off",
    "feat.label": "Feature settings",
    "feat.hint":
      "Advanced font-feature-settings value, e.g. \"ss01\" on, \"cv01\" 1. Invalid values are ignored.",
    "feat.placeholder": "\"ss01\" on",

    "synth.italic": "No faux italic",
    "synth.italicHint":
      "CJK faces have no italic, so the browser tilts them. On keeps marked text upright. (Same as faux bold: one extra step at most.)",
    "synth.bold": "No faux bold",
    "synth.boldHint":
      "For faces without a real bold: bold text stops being thickened artificially. (Disabling it lets the browser fake a bold face, which adds one extra step for a font that ships none — it cannot invent the middle ones.)",
    "synth.simple": "No faux italic / faux bold",
    "smoothing.label": "Text rendering",
    "smoothing.hint": "How the strokes are drawn: sharp is crisp and firm, smooth is soft and even.",
    "smoothing.auto": "Follow the system",
    "smoothing.sharp": "Sharp",
    "smoothing.smooth": "Smooth",
    "synth.simpleHint":
      "Stops synthetic italic and synthetic bold everywhere; switch to Advanced to set them apart. (Both switches: one extra step at most, no middle ones.)",

    "section.ui": "Interface",
    "section.dialog": "Conversation",
    "section.code": "Code",
    "section.open": "Expand {name}",
    "section.close": "Collapse {name}",

    "ui.follow": "Follows the conversation",
    "ui.followHint": "Font and weight. While this is on, the interface section's own values are ignored.",
    "write.reverted": "The setting did not reach the document, so it fell back to what the document holds.",
    "ui.own": "Own values",
    "dialog.default": "DSH defaults",


    "dialog.label": "Conversation font",
    "dialog.hint":
      "Applies to the conversation markdown (paragraphs, tables, headings); code surfaces keep the code font.",
    "dialogWest.label": "Conversation · Western",
    "dialogEast.label": "Conversation · CJK",

    "preset.export": "Export",
    "preset.import": "Import",
    "preset.importPlaceholder": "Paste an exported preset JSON here",
    "preset.label": "Presets",
    "preset.select": "Choose a preset",
    "preset.rename": "Rename",
    "preset.renamePlaceholder": "New name",
    "preset.renamed": "Renamed to “{name}”.",
    "preset.autoSave": "With a preset selected, every change saves into it automatically.",
    "preset.nameUsed": "That name is already taken.",
    "preset.applied": "Applied “{name}”.",
    "preset.exported": "Presets copied to the clipboard.",
    "preset.imported": "Imported {count} preset(s).",
    "preset.importBad": "That text is not a valid preset export.",
    "preset.exportManual": "Clipboard unavailable — press Ctrl+C to copy the selected text.",
    "preset.writeFailed": "The setting was not saved: {message}",

    "preview.sansCaption": "Interface",
    "preview.dialogCaption": "Conversation",
    "preview.monoCaption": "Code",
    "preview.sample":
      "The quick brown fox jumps over the lazy dog — 中文排版预览，标点符号，数字 0123456789。",
    "preview.code": "const greet = (name) => `hello ${name}`; // => != >= -> 代码预览",

    "panel.dot": "Tuning panel",
    "panel.title": "Quick tune",
    "panel.masterLabel": "Floating panel",
    "panel.masterHint":
      "A dot in the page corner opens quick controls for the conversation's size, line spacing and weight. Off hides the dot everywhere.",
    "panel.moved": "Panel position saved.",
    "panel.resized": "Panel size saved.",
    "panel.close": "Close",
    "panel.settings": "Open the plugin settings",
    "panel.settingsMissing": "This deployment exposes no settings screen for the plugin.",
    "panel.writeFailed": "The panel change was not saved: {message}",

  },
  zh: {
    "card.title": "字体增强",
    "card.description":
      "界面与对话字体、各自的字号/字重/行高，代码增强与预设方案",
    "card.expand": "展开",
    "card.collapse": "收起",
    "card.resetAll": "全部重置",
    "card.readOnly": "当前部署只在内存里保存设置。",

    "common.overridden": "已修改",
    "common.reset": "重置",
    "common.on": "开启",
    "common.off": "关闭",

    "sans.label": "界面字体",
    "sans.hint":
      "按顺序回退：拉丁字体放前面、中文字体放后面；留空表示沿用 DSH 的字体栈。",
    "mono.label": "代码字体",
    "mono.hint": "作用于代码块、行内代码和等宽文本；留空表示沿用 DSH 的字体栈。",

    "stack.empty": "尚未选择字体",
    "stack.add": "添加字体",
    "stack.search": "搜索字体",
    "stack.loading": "正在读取本机已安装的字体…",
    "stack.denied": "未获得字体访问权限，显示内置列表；仍可手动输入任意字体名。",
    "stack.unsupported":
      "此浏览器无法列出已安装字体，显示内置列表；仍可手动输入任意字体名。",
    "stack.custom": "使用“{name}”",
    "stack.remove": "移除 {name}",
    "stack.drag": "拖动 {name} 调整顺序",
    "stack.earlier": "将 {name} 前移",
    "stack.later": "将 {name} 后移",
    "stack.done": "完成",
    "stack.groupSelected": "已选",
    "stack.groupMono": "等宽",
    "stack.groupCjk": "中文（CJK）",
    "stack.groupLatin": "拉丁",
    "stack.groupGeneric": "通用",
    "stack.groupLocal": "本机已安装",
    "stack.hintOrder": "顺序靠前的优先命中，取第一个已安装的字体。",

    "mode.label": "编辑模式",
    "mode.simple": "简单",
    "mode.advanced": "高级",
    "mode.simpleHint":
      "只管理栈最前面的西文/中文两项；你在高级模式里排好的其余回退原样保留。",
    "sansWest.label": "界面 · 西文字体",
    "sansEast.label": "界面 · 中文字体",
    "monoWest.label": "代码 · 西文字体",
    "monoEast.label": "代码 · 中文字体",
    "split.pick": "选择…",
    "split.remove": "移除 {name}",
    "split.rest": "其余回退项（在高级模式中排序）：{names}",

    "size.dialogLabel": "对话字号偏移",
    "size.dialogHint":
      "给对话文字统一加 {offset}，与设置里的「字号大小」叠加；0 表示保持 DSH 原样。",
    "size.codeLabel": "代码字号偏移",
    "size.codeHint":
      "只作用于代码块与行内代码，与界面字号互不影响；0 表示保持原样。",
    "size.unit": "px",

    "weight.uiLabel": "界面字重偏移",
    "weight.uiHint":
      "在整个界面自身的字重上叠加（侧栏、设置、按钮、标题）：正数更粗、负数更细；对话 Markdown 不受影响。滑块按当前字体实际能渲染的粗细分档，读数是档数（0 = 保持 DSH 原样）：每挪一格，正文与标题都会换一张字形；换个字体，档数也会跟着变。档距按当前字体实测，其中幅度最小的一档看起来最弱。",
    "weight.dialogLabel": "对话字重偏移",
    "weight.dialogHint":
      "在每个元素自身的字重上叠加，所以标题依旧比正文粗、加粗文字依旧加粗；未设置时保持 DSH 原本的粗细。滑块按当前字体实际能渲染的粗细分档，读数是档数（0 = 保持 DSH 原样）：每挪一格，正文与标题都会换一张字形；换个字体，档数也会跟着变。档距按当前字体实测，其中幅度最小的一档看起来最弱。",
    "weight.codeLabel": "代码字重偏移",
    "weight.codeHint":
      "在每个代码面自身的字重上叠加（代码块、行内代码、终端输出）；0 或未设置表示保持 DSH 原样。滑块按当前字体实际能渲染的粗细分档，读数是档数（0 = 保持 DSH 原样）：每挪一格，正文与标题都会换一张字形；换个字体，档数也会跟着变。档距按当前字体实测，其中幅度最小的一档看起来最弱。",

    "line.dialogLabel": "对话行高",
    "line.dialogHint": "把对话行高整体缩放为 {ratio}；100% 表示保持 DSH 原样。",
    "line.codeLabel": "代码行高",
    "line.codeHint": "只给代码行高加 {offset}px；0 表示保持原样。",
    "line.unit": "%",

    "lig.label": "代码连字",
    "lig.hint":
      "把多个字符连成一个字形（如 => 变箭头、!= 变 ≠）。浏览器默认就是开启的。",
    "lig.default": "默认",
    "lig.on": "开启",
    "lig.off": "关闭",
    "feat.label": "特性设置",
    "feat.hint":
      "高级的 font-feature-settings 值，例如 ss01 on、cv01 1；非法值会被忽略。",
    "feat.placeholder": "\"ss01\" on",

    "synth.italic": "禁用伪斜体",
    "synth.italicHint":
      "中文字体没有斜体，浏览器会把标记文本硬掰歪；开启后保持直立。（与伪粗体同理：最多多出一档。）",
    "synth.bold": "禁用伪粗体",
    "synth.boldHint": "没有真实粗体的字体不再被人为加粗。（关掉它，浏览器会为没有粗体字形的字体自己造粗体：能多出一档，但变不出中间档。）",
    "synth.simple": "禁用伪斜体/伪粗体",
    "smoothing.label": "文字渲染质感",
    "smoothing.hint": "同一字体下笔画的渲染方式：锐利更清晰硬朗，圆润更柔和均匀。",
    "smoothing.auto": "跟随系统",
    "smoothing.sharp": "锐利",
    "smoothing.smooth": "圆润",
    "synth.simpleHint":
      "整页停用合成斜体与合成粗体；切到高级模式可分开设置。（两项一起关：最多多出一档，变不出中间档。）",

    "section.ui": "界面",
    "section.dialog": "对话",
    "section.code": "代码",
    "section.open": "展开{name}",
    "section.close": "收起{name}",


    "ui.follow": "跟随对话设置",
    "ui.followHint": "字体与字重跟随开启时，界面分区自己的取值会被忽略。",
    "write.reverted": "设置没写进文档，已恢复为文档里的值。",
    "ui.own": "独立数值",
    "dialog.default": "DSH 默认",

    "dialog.label": "对话字体",
    "dialog.hint":
      "作用于会话里的 Markdown（段落、表格、标题）；代码表面仍用代码字体。",
    "dialogWest.label": "对话 · 西文字体",
    "dialogEast.label": "对话 · 中文字体",

    "preset.export": "导出",
    "preset.import": "导入",
    "preset.importPlaceholder": "粘贴导出的方案内容",
    "preset.label": "预设方案",
    "preset.select": "选择方案",
    "preset.rename": "改名",
    "preset.renamePlaceholder": "新名字",
    "preset.renamed": "已改名为“{name}”。",
    "preset.autoSave": "选中方案后，所有改动自动存入该方案。",
    "preset.nameUsed": "这个名字已被占用。",
    "preset.applied": "已应用“{name}”。",
    "preset.exported": "方案已复制到剪贴板。",
    "preset.imported": "已导入 {count} 个方案。",
    "preset.importBad": "这段内容不是有效的方案导出。",
    "preset.exportManual": "剪贴板不可用，按 Ctrl+C 复制下方已选中的内容。",
    "preset.writeFailed": "设置没有保存成功：{message}",

    "preview.sansCaption": "界面",
    "preview.dialogCaption": "对话",
    "preview.monoCaption": "代码",
    "preview.sample":
      "The quick brown fox jumps over the lazy dog —— 中文排版预览，标点符号，数字 0123456789。",
    "preview.code": "const greet = (name) => `hello ${name}`; // => != >= -> 代码预览",

    "panel.dot": "调参面板",
    "panel.title": "快速调参",
    "panel.masterLabel": "悬浮面板",
    "panel.masterHint":
      "页面角落的小圆点打开对话字号、行距与字重的快捷调节。关闭后小圆点彻底隐藏。",
    "panel.moved": "面板位置已记住。",
    "panel.resized": "面板尺寸已记住。",
    "panel.close": "关闭",
    "panel.settings": "打开插件设置",
    "panel.settingsMissing": "当前部署没有给本插件提供设置页面。",
    "panel.writeFailed": "面板改动没有保存成功：{message}",

  },
};

/**
 * Translate one key for the active locale, falling back to English and then to
 * the key itself, so a missing dictionary entry never blanks the card.
 * @param {string} locale - active locale id.
 * @param {string} key - dictionary key.
 * @param {Record<string, string>} [params] - `{name}` substitutions.
 * @returns {string} the text.
 */
function translate(locale, key, params) {
  var table = DICTS[locale] || DICTS.en;
  var text = table[key];
  if (text === undefined) text = DICTS.en[key];
  if (text === undefined) return key;
  if (params === undefined) return text;
  return text.replace(/\{(\w+)\}/g, function (match, name) {
    return params[name] === undefined ? match : String(params[name]);
  });
}

/* ------------------------------------------------------------------ *
 * card chrome stylesheet
 * ------------------------------------------------------------------ */

/**
 * Card chrome, matching the plugin configuration section's own card: the same
 * radii, borders, spacing and design tokens. The section ships those rules in
 * a CSS module a plugin bundle cannot import, so they are reproduced here.
 */
var CARD_CSS = [
  ".dfp-card{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;transition:border-color .16s,background .16s}",
  ".dfp-card:hover{border-color:var(--dsw-alias-label-dimmed)}",
  ".dfp-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
  ".dfp-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
  ".dfp-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
  ".dfp-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
  ".dfp-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}",
  ".dfp-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
  // The chevron is the host PluginCard's own 14×14 SVG icon, not a text glyph:
  // a `⌄` character rendered at text weight looked thinner than every other
  // card's arrow, and rotating the TEXT SPAN swung it around the text box
  // centre (the glyph sits off-centre on its baseline) instead of turning in
  // place. As an `<svg>` the class goes on the icon itself and
  // `transform:rotate(180deg)` rotates around the icon's own box centre —
  // exactly what dsh-quick-toc's card does.
  ".dfp-chevron{color:var(--dsw-alias-label-tertiary);flex:none;display:block;transition:transform .16s}",
  ".dfp-chevronOpen{transform:rotate(180deg)}",
  ".dfp-body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}",
  ".dfp-readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}",
  ".dfp-footer{border-top:.5px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}",
  ".dfp-resetAll{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:5px 10px;font-size:13px;line-height:1.5;margin-right:auto;color:var(--dsw-alias-label-secondary);background:0 0;border:1px solid var(--dsw-alias-border-l2)}",
  ".dfp-resetAll:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
  ".dfp-resetAll:disabled{opacity:.4;cursor:default}",

  ".dfp-field{padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
  ".dfp-fieldLast{border-bottom:0}",
  ".dfp-fieldHead{align-items:center;gap:8px;display:flex}",
  ".dfp-fieldLabel{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}",
  // The control that sits in the same row as its label, right-aligned — the
  // same shape as dsh-quick-toc's settings card (`.dqt-pinline`), so the
  // cards' rows line up row for row.
  ".dfp-inline{flex:1;justify-content:flex-end;align-items:center;gap:10px;display:flex}",
  ".dfp-overridden{flex:none;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:999px;padding:1px 8px;font-size:11px;line-height:16px}",
  ".dfp-fieldReset{flex:none;margin-left:auto;appearance:none;font:inherit;cursor:pointer;background:0 0;border:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:0}",
  ".dfp-fieldReset:hover{color:var(--dsw-alias-label-primary)}",
  ".dfp-hint{color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;line-height:18px}",

  // accordion sections
  ".dfp-section{border-bottom:.5px solid var(--dsw-alias-border-l2)}",
  ".dfp-sectionLast{border-bottom:0}",
  ".dfp-sectionHead{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:8px;padding:12px 0;display:flex}",
  ".dfp-sectionHead:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
  ".dfp-sectionTitle{flex:none;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:22px}",
  ".dfp-sectionSummary{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}",
  // While a section is open its summary disappears, so without this spacer the
  // chevron would slide left and sit next to the title; the spacer keeps the
  // arrow pinned to the far right in both states.
  ".dfp-sectionSpacer{flex:1;min-width:0}",
  ".dfp-sectionBody{padding:0 0 12px}",
  // The first control may not float away from the section title: the field
  // rows carry 16px top padding of their own, so the first one is tightened.
  ".dfp-sectionBody>.dfp-field:first-child{padding-top:10px}",
  ".dfp-sectionBody>.dfp-hint:first-child{margin-top:10px}",

  // presets: one bar — a dropdown select plus rename/import/export. The
  // buttons must never wrap their two-character labels: they keep nowrap and
  // stay flex:none, so compressing the row eats the SELECT's width instead.
  ".dfp-presetBar{align-items:center;gap:8px;margin-top:8px;display:flex}",
  ".dfp-selectWrap{display:inline-flex;flex:1;min-width:0}",
  ".dfp-select{flex:1;min-width:0;height:30px;box-sizing:border-box;appearance:none;font:inherit;cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;padding:0 6px 0 10px;display:inline-flex;align-items:center;justify-content:space-between;gap:6px}",
  ".dfp-select:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}",
  ".dfp-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
  ".dfp-select:disabled{opacity:.4;cursor:default}",
  ".dfp-selectName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px;text-align:left}",
  ".dfp-selectChevron{flex:none;display:block;color:var(--dsw-alias-label-tertiary);transition:transform .16s}",
  ".dfp-selectChevronOpen{transform:rotate(180deg)}",
  ".dfp-drop{position:fixed;z-index:1200;box-sizing:border-box;min-width:160px;max-height:260px;overflow-y:auto;padding:4px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:16px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px #00000024)}",
  ".dfp-miniButton{appearance:none;font:inherit;cursor:pointer;white-space:nowrap;flex:none;border-radius:8px;padding:3px 8px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);background:0 0;border:.5px solid var(--dsw-alias-border-l3)}",
  ".dfp-miniButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-specific-sidebar-nav-item-hover)}",
  ".dfp-miniButton:disabled{opacity:.4;cursor:default}",
  ".dfp-textInput{flex:1;min-width:0;box-sizing:border-box;padding:5px 8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;font:inherit;font-size:13px;line-height:18px}",
  // The auto-save hint and the transient message share one row: the hint holds
  // the left, the message fades in on the right. The row is always mounted and
  // one line tall, so a message appearing can never push anything down.
  ".dfp-presetMeta{align-items:center;gap:10px;margin-top:6px;display:flex;overflow:hidden}",
  // The hint never wraps: if a long message squeezes it, it truncates instead
  // of growing the row (a two-line row would push everything below it down).
  ".dfp-presetHint{flex:1;min-width:0;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".dfp-status{flex:none;min-width:0;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;opacity:0;transition:opacity .24s}",
  ".dfp-statusOn{opacity:1}",

  ".dfp-chips{align-items:center;flex-wrap:wrap;gap:6px;margin-top:10px;display:flex}",
  ".dfp-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
  ".dfp-chip{align-items:center;gap:2px;height:26px;padding:0 2px 0 4px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;display:inline-flex}",
  ".dfp-chipDragging{opacity:.45}",
  ".dfp-chipDrop{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}",
  ".dfp-grip{cursor:grab;color:var(--dsw-alias-label-tertiary);padding:0 2px;font-size:13px;line-height:1;user-select:none}",
  ".dfp-grip:active{cursor:grabbing}",
  ".dfp-chipLabel{max-width:200px;font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".dfp-chipButton{align-items:center;justify-content:center;width:20px;height:20px;padding:0;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:50%;display:inline-flex;font-size:13px;line-height:1}",
  ".dfp-chipButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3)}",
  ".dfp-chipButton:disabled{opacity:.35;cursor:default}",
  ".dfp-add{align-items:center;gap:6px;height:28px;padding:0 12px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;display:inline-flex;font-size:13px;line-height:18px}",
  ".dfp-add:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-sidebar-nav-item-hover)}",

  // Segmented / toggle controls follow dsh-quick-toc's settings card colours:
  // the selected option takes the same --dsw-specific-sidebar-nav-item-active
  // surface (not just darker text). Shape: one joined pill with a divider.
  ".dfp-modeSeg{flex:none;display:inline-flex;overflow:hidden;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px}",
  ".dfp-modeButton{appearance:none;font:inherit;cursor:pointer;height:28px;padding:0 14px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-left:.5px solid var(--dsw-alias-border-l3);font-size:13px;line-height:18px}",
  ".dfp-modeButton:first-child{border-left:none}",
  ".dfp-modeButton:hover:not(:disabled):not(.dfp-modeButtonActive){background:var(--dsw-specific-sidebar-nav-item-hover)}",
  ".dfp-modeButton:disabled{opacity:.4;cursor:default}",
  ".dfp-modeButtonActive{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-sidebar-nav-item-active)}",
  ".dfp-slotRow{align-items:center;gap:10px;margin-top:10px;display:flex}",
  ".dfp-slotLabel{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;min-width:96px}",
  ".dfp-splitRow{flex:1;align-items:center;gap:4px;display:inline-flex;min-width:0}",
  ".dfp-pick{flex:1;appearance:none;font:inherit;cursor:pointer;color:var(--dsw-alias-label-primary);background:0 0;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;height:28px;padding:0 12px;font-size:13px;line-height:18px;display:inline-flex;align-items:center}",
  ".dfp-pick:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3)}",
  ".dfp-pick:disabled{opacity:.4;cursor:default}",
  ".dfp-pickEmpty{color:var(--dsw-alias-label-tertiary)}",

  // the per-theme switch is gone (light and dark share one value set); the
  // on/off controls are all joined segmented controls now, so no pill switch
  // exists in this card and every row keeps the same 28px control height.

  ".dfp-panel{box-sizing:border-box;position:fixed;z-index:1200;flex-direction:column;width:320px;max-height:380px;padding:8px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:16px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px #00000024);display:flex;gap:6px}",
  ".dfp-search{width:100%;box-sizing:border-box;padding:5px 8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;font:inherit;font-size:13px;line-height:18px}",
  ".dfp-exportText{resize:vertical;min-height:54px;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;line-height:17px}",
  ".dfp-note{padding:4px 2px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}",
  ".dfp-list{flex-direction:column;gap:1px;flex:1;min-height:0;overflow-y:auto;display:flex}",
  ".dfp-group{padding:6px 6px 2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;position:sticky;top:0;background:var(--dsw-alias-bg-layer-2)}",
  ".dfp-option{align-items:center;justify-content:space-between;gap:8px;width:100%;box-sizing:border-box;padding:4px 8px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;display:flex;font-size:13px;line-height:20px}",
  ".dfp-option:hover{background:var(--dsw-alias-bg-layer-3)}",
  ".dfp-optionLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".dfp-optionCheck{flex:none;color:var(--dsw-alias-brand-primary)}",
  ".dfp-footerRow{justify-content:flex-end;display:flex}",

  ".dfp-sliderRow{align-items:center;gap:10px;margin-top:10px;display:flex}",
  ".dfp-slider{flex:1;min-width:0;height:20px;accent-color:var(--dsw-alias-brand-primary)}",
  ".dfp-value{flex:none;min-width:56px;text-align:right;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-variant-numeric:tabular-nums}",
  ".dfp-scale{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;display:flex;justify-content:space-between}",
  // a write the document never took: visible, but quieter than the field label
  ".dfp-sliderNotice{margin-top:6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}",

  // the per-section preview: an inline box at the end of the expanded
  // section body, showing only that section's own sample
  ".dfp-previewBox{margin-top:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:12px}",
  ".dfp-previewCaption{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin-bottom:4px}",
  ".dfp-previewText{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;word-break:break-word}",
  ".dfp-previewCode{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",

  // the floating panel: a dot in the page corner that expands to a small card.
  // Fixed positioning keeps it out of every scroll container; the high z-index
  // sits above the conversation but below host menus. The dot never moves
  // between the shut and open states: the card's anchored corner COINCIDES with
  // the dot's own corner, and the card is CLIPPED down to the dot's rectangle —
  // so the panel unfolds out of the dot instead of fading in beside it. The
  // clip, the scale and the opacity ride one non-linear curve (~280 ms) and the
  // dot cross-fades the other way: out in ~120 ms on the way open, back in over
  // the whole fold, and it stops eating pointer events for as long as it is
  // faded (the card head underneath keeps its drag). The card never scrolls:
  // `overflow:hidden` plus a viewport-tall cap over content that sizes to its
  // own rows. The edge resize grips live INSIDE the card for the same reason —
  // hanging them past the border (the 0.4.0 shape) made the card itself
  // scrollable in both axes.
  ".dfp-floatHost{position:fixed;z-index:2147483000;font-family:inherit}",
  ".dfp-floatHost.dfp-floatSnap{transition:left .16s ease,top .16s ease}",
  // `z-index:2` keeps the dot above the card it is anchored on: the two are the
  // same object in two states, and the cross-fade only reads if the dot is not
  // buried under the card's own surface while it comes back.
  ".dfp-dot{position:relative;z-index:2;width:26px;height:26px;border-radius:50%;cursor:grab;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l3);box-shadow:0 2px 8px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;padding:0;transition:opacity .12s ease,transform .2s ease;touch-action:none;user-select:none}",
  ".dfp-dot:hover{border-color:var(--dsw-alias-label-dimmed)}",
  ".dfp-dotGlyph{width:10px;height:10px;border-radius:50%;background:var(--dsw-alias-brand-primary);pointer-events:none}",
  // the dot while the panel is open: invisible, and no longer a drag surface —
  // the card head owns the pointer there. It stays in the DOM, in place, so the
  // fold has something to return into and the dot is exactly where it was.
  ".dfp-dotAway{opacity:0;pointer-events:none}",
  // the dot coming back: the whole fold, not the 120 ms the way out took. The
  // after-change transition is the one that counts, so this rule alone decides
  // the fade-in, and it is the fold's own length and curve.
  ".dfp-dotBack{transition:opacity .42s cubic-bezier(.4,0,.2,1),transform .2s ease}",
  // The shadow is a FILTER, not a box-shadow: a box-shadow is painted outside
  // the border box, so every frame that carries a clip (both animations) would
  // cut it away.
  //
  // It rides a WRAPPER, never the card. Chromium clips an element's own filter
  // output with that element's `clip-path`, so a shadow on the card is cut away
  // for the whole unfold and the whole fold and only pops in on the frame the
  // resting clip is released — the shadow appearing out of nowhere a beat after
  // the card has arrived, and vanishing again before the card even starts to
  // shrink. The wrapper carries no clip and no overflow of its own, so the
  // filter is applied to the card's already-clipped shape and follows it frame
  // by frame. It is a pure paint layer: nothing about it takes a pointer, and
  // the card it holds keeps every part of the animation.
  ".dfp-floatShadow{position:absolute;z-index:1;box-sizing:border-box;pointer-events:none;width:min(264px,calc(100vw - 32px));filter:drop-shadow(0 10px 32px rgba(0,0,0,.28))}",
  // The card fills the wrapper in normal flow, so the wrapper's anchored corner
  // IS the card's corner: the clip, the scale and the fade still ride the card
  // (and every measurement still reads it), while the anchored edge, the size
  // and the shadow belong to the wrapper around it.
  ".dfp-floatCard{position:relative;box-sizing:border-box;width:100%;height:100%;max-height:calc(100vh - 24px);overflow:hidden;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l3);border-radius:16px;padding:10px 12px 12px;pointer-events:auto;clip-path:inset(0px 0px 0px 0px round 16px);transition:clip-path .28s cubic-bezier(.22,1,.28,1),opacity .28s cubic-bezier(.22,1,.28,1),transform .28s cubic-bezier(.22,1,.28,1)}",
  // the enter frame: the card is clipped to the dot's own rectangle, a hair
  // smaller and dimmer, and the transition (started by dropping this class two
  // frames later) carries all three home at once. Once it has arrived the card
  // drops the clip entirely (see `releaseClip` in the client).
  ".dfp-floatCardEnter{clip-path:var(--dfp-clipStart,inset(0px 0px 0px 0px round 16px));opacity:.6;transform:scale(.985)}",
  // The leave frame: the same rectangle the enter came from, so the fold is the
  // expand played backwards — but on its OWN, longer curve. The unfold is a
  // fast, eager ease-out; the fold starts gently and spends most of its extra
  // time in the tail, which is what makes shutting down read as deliberate
  // instead of abrupt. The card is already invisible but must not swallow
  // clicks aimed at the page underneath while it is still in the DOM.
  ".dfp-floatCardLeave{clip-path:var(--dfp-clipStart,inset(0px 0px 0px 0px round 16px));opacity:0;transform:scale(.985);pointer-events:none;transition:clip-path .42s cubic-bezier(.4,0,.2,1),opacity .42s cubic-bezier(.4,0,.2,1),transform .42s cubic-bezier(.4,0,.2,1)}",
  // the arming frame, on for the two frames the enter class is on: measuring the
  // card for `--dfp-clipStart` RESOLVES its style, and without this the resting
  // clip resolved there would be the "before" of a transition the moment the
  // enter class lands — the unfold would first play backwards from the rest
  // shape and then reverse again, so it never grew out of the dot at all.
  ".dfp-floatCardArm{transition:none}",
  // the content follows the clip a beat behind it — one small stagger, not a
  // procession of per-item animations.
  ".dfp-floatHead,.dfp-floatRow{transition:opacity .2s ease .06s}",
  ".dfp-floatCardEnter .dfp-floatHead,.dfp-floatCardEnter .dfp-floatRow{opacity:0}",
  "@media (prefers-reduced-motion:reduce) and (min-width:2px) and (max-width:1px){.dfp-floatCard{transition:none}.dfp-dot,.dfp-dotBack{transition:none}.dfp-floatHost.dfp-floatSnap{transition:none}.dfp-floatHead,.dfp-floatRow{transition:none}}",
  // The header is the drag surface. Its right padding is the strip the round
  // close button (out of flow, pinned to the card's own top-right corner) needs
  // so the title never runs underneath it; there is no slot for the dot any
  // more — the dot is faded out while the card is open.
  ".dfp-floatHead{display:flex;align-items:center;gap:8px;cursor:grab;user-select:none;touch-action:none}",
  ".dfp-floatTitle{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  // the close: a round icon button in the quick-toc style — same tint at rest,
  // the next tint step on hover; the rounded bar inside is the close icon
  ".dfp-floatClose{position:absolute;top:8px;right:8px;z-index:2;appearance:none;cursor:pointer;display:flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:none;border-radius:50%;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));transition:background .15s ease,color .15s ease,opacity .2s ease}",
  ".dfp-floatClose:hover{background:var(--dsw-alias-interactive-bg-active,rgba(79,140,255,.24))}",
  ".dfp-floatCloseCross{display:block;pointer-events:none;color:currentColor}",
  // the settings entry: the VERY same circle as the close (same diameter, same
  // tint, same hover step), pinned to the card's corner and pushed one diameter
  // plus FLOAT_SETTINGS_GAP to its left. Both radii are 50% and the boxes are
  // square, so neither can read as an ellipse.
  ".dfp-floatSettings{position:absolute;top:8px;right:38px;z-index:2;appearance:none;cursor:pointer;display:flex;align-items:center;justify-content:center;width:22px;height:22px;min-width:0;padding:0;border:none;border-radius:50%;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));transition:background .15s ease,color .15s ease,opacity .2s ease}",
  ".dfp-floatSettings:hover{background:var(--dsw-alias-interactive-bg-active,rgba(79,140,255,.24))}",
  ".dfp-floatSettingsGlyph{display:block;pointer-events:none;color:currentColor}",
  // the host's own button reset cannot inflate either circle: the two share one
  // box model, so "the same size" is a property of the pair, not of a wish.
  ".dfp-floatClose,.dfp-floatSettings{box-sizing:border-box;aspect-ratio:1/1;flex:0 0 auto}",
  ".dfp-floatResize{position:absolute;z-index:3;touch-action:none}",
  ".dfp-floatResizeR{top:0;right:0;width:8px;height:100%;cursor:ew-resize}",
  ".dfp-floatResizeB{left:0;bottom:0;width:100%;height:8px;cursor:ns-resize}",
  ".dfp-floatResizeBR{right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize}",
  ".dfp-floatRow{margin-top:8px}",
  ".dfp-floatLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;display:flex;justify-content:space-between;gap:8px}",
  ".dfp-floatValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}",
  ".dfp-floatSlider{width:100%;box-sizing:border-box;accent-color:var(--dsw-alias-brand-primary)}",
  // the write-failure line takes no room at all while it carries no message
  ".dfp-floatStatus{margin-top:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}",
  ".dfp-floatStatus:empty{display:none}",
].join("");

/**
 * Install the card's chrome stylesheet once, owned by the plugin's fiber.
 * @param {object} ctx - client cordis context.
 */
function installCardStyles(ctx) {
  ctx.effect(
    function () {
      if (typeof document === "undefined") return undefined;
      if (document.querySelector('style[data-plugin-css="' + CARD_STYLE_TAG + '"]') !== null) {
        return undefined;
      }
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-fonttune";
      tag.dataset.pluginCss = CARD_STYLE_TAG;
      tag.textContent = CARD_CSS;
      document.head.append(tag);
      return function () {
        tag.remove();
      };
    },
    "dsh-fonttune: card stylesheet"
  );
}

/* ------------------------------------------------------------------ *
 * DSH token discovery
 * ------------------------------------------------------------------ */

/**
 * Whether a stylesheet belongs to this plugin. Reading bases must skip our own
 * `<style>` elements: once the size rule is live, its declarations would come
 * back as "untouched values" on the next read and compound the offset every
 * refresh cycle (fonts grew by the ratio every 4 seconds in the field).
 * @param {StyleSheet} sheet - any document stylesheet.
 * @returns {boolean} true when the sheet was installed by this plugin.
 */
function isOwnSheet(sheet) {
  try {
    var owner = sheet.ownerNode;
    if (owner === null || owner === undefined) return false;
    var marker = owner.dataset && (owner.dataset.pluginCss || owner.dataset.plugin);
    return marker === STYLE_TAG || marker === CARD_STYLE_TAG || marker === "dsh-fonttune";
  } catch (error) {
    return false;
  }
}

/**
 * Snapshot the typography tokens the size offsets scale.
 *
 * Three sources, in rising authority: the embedded fallback map (covers the
 * frame before DSH's runtime tokens exist), declarations read from the
 * same-origin stylesheets — excluding this plugin's own — and the theme's
 * inline writes on `body` (the font-size slider's value lives there and
 * nowhere else). The computed style is deliberately NOT a source: after our
 * rule applies it reports the SCALED values, and feeding those back as bases
 * compounds the offset on every refresh.
 *
 * `font` shorthand tokens (`--dsw-font-markdown-base` and friends) are
 * collected too: they are what the shipped stylesheets actually consume, and
 * the line-height axes rebuild their inline heights.
 *
 * @returns {Record<string, string>} token name to its untouched value.
 */
function readBaseTokens() {
  var out = {};
  var name;
  for (name in FALLBACK_TOKENS) {
    if (Object.prototype.hasOwnProperty.call(FALLBACK_TOKENS, name)) {
      out[name] = FALLBACK_TOKENS[name];
    }
  }
  if (typeof document === "undefined" || !document.body) return out;

  try {
    var sheets = document.styleSheets;
    for (var sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
      if (isOwnSheet(sheets[sheetIndex])) continue;
      var rules = null;
      try {
        rules = sheets[sheetIndex].cssRules;
      } catch (error) {
        continue; // Cross-origin stylesheet: the inline source still answers.
      }
      if (!rules) continue;
      for (var ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
        var style = rules[ruleIndex].style;
        if (!style) continue;
        for (var propertyIndex = 0; propertyIndex < style.length; propertyIndex += 1) {
          var property = style[propertyIndex];
          if (property.slice(0, 2) !== "--" || !isScaledToken(property)) continue;
          var declared = style.getPropertyValue(property).trim();
          if (declared !== "") out[property] = declared;
        }
      }
    }
  } catch (error) {
    // Keep what the earlier sources produced.
  }

  try {
    // The theme authors these directly on `body`; the raw inline value is the
    // untouched one even while this plugin's `!important` rule is winning.
    var inline = document.body.style;
    for (name in out) {
      if (!Object.prototype.hasOwnProperty.call(out, name)) continue;
      var authored = inline.getPropertyValue(name).trim();
      if (authored !== "") out[name] = authored;
    }
    for (var inlineIndex = 0; inlineIndex < inline.length; inlineIndex += 1) {
      var inlineName = inline[inlineIndex];
      if (inlineName.slice(0, 2) !== "--" || !isScaledToken(inlineName)) continue;
      var inlineValue = inline.getPropertyValue(inlineName).trim();
      if (inlineValue !== "") out[inlineName] = inlineValue;
    }
  } catch (error) {
    // Detached document or no layout engine: the fallback map stands.
  }
  return out;
}

/**
 * Find the cheap markdown selector for this page, so the stylesheet does not
 * have to match the conversation container by substring attribute.
 *
 * The substring form `[class*="_markdown_" i]` is what the dialog rule used to
 * be scoped by, and that rule's code exclusion is a `:not(...)` with ~30
 * arguments, so its scan is paid once per candidate element: naming the wrapper
 * takes that from ~1800 candidates per recalculation to ~37.
 *
 * The code hooks stay as substring selectors (see `codeSurfaceList()`): a class
 * the page has not rendered yet cannot be named, and an unknown surface must
 * still get the code axes.
 *
 * A page without the wrapper keeps the substring form — the builder's default —
 * and only loses the cheaper one.
 *
 * @returns {{markdown?: string}} the hints.
 */
function harvestScope() {
  var hints = {};
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return hints;
  try {
    if (document.querySelector("[data-dss-prose]") !== null) hints.markdown = "[data-dss-prose]";
  } catch (error) {
    // No wrapper to name: the builder falls back to the substring selector.
  }
  return hints;
}

/**
 * Create the writer that keeps one `<style>` element in sync.
 *
 * The host half renders the same declarations into the served index so the
 * first frame is already correct, and that element carries this plugin's
 * `data-plugin-css` stamp. This half ADOPTS it instead of appending a second
 * copy: the served copy is only rebuilt on the next index render, so two
 * elements could never stay in sync — a rule a configuration no longer
 * produces (unset a weight, drop a size offset) would keep applying from the
 * stale copy until the user reloaded the page.
 *
 * @param {() => Record<string, string>} tokens - reads the current base tokens.
 * @returns {(config: unknown) => void} the applier.
 */
function createStylesheet(tokens) {
  var tag = null;
  var lastCss = null;
  return function apply(config) {
    if (typeof document === "undefined") return;
    var css = buildFontCss(config, tokens(), harvestScope());
    if (css === lastCss && tag !== null && tag.isConnected) return;
    lastCss = css;
    if (tag === null || !tag.isConnected) {
      // The served row first (it is already in the document), then our own.
      tag = document.querySelector('style[data-plugin-css="' + STYLE_TAG + '"]');
    }
    if (tag === null || !tag.isConnected) {
      tag = document.createElement("style");
      tag.dataset.plugin = "dsh-fonttune";
      tag.dataset.pluginCss = STYLE_TAG;
      document.head.append(tag);
    }
    tag.textContent = css;
  };
}

/**
 * Read the DSH default of one family variable, for the token override pairs.
 * @param {string} name - custom property name.
 * @returns {string} the live value, or "" when unreadable.
 */
function readDefaultFamily(name) {
  if (typeof document === "undefined") return "";
  try {
    var value = document.defaultView
      .getComputedStyle(document.body)
      .getPropertyValue(name)
      .trim();
    return value === "" ? "" : value;
  } catch (error) {
    return "";
  }
}

/* ------------------------------------------------------------------ *
 * weight granularity
 * ------------------------------------------------------------------ */

/** Sample drawn to compare two weights; mixed scripts, like the UI. */
var WEIGHT_SAMPLE_TEXT = "对话 Aa 字重 0189";

/** Canvas used for the granularity probe, created on first use. */
var weightProbeCanvas = null;

/** Cache of measured slider shapes, keyed by the resolved family stack. */
var weightProfileCache = {};

/**
 * Values the card has moved but the settings document has not confirmed yet.
 *
 * The card paints these over the document's own values the moment the user lets go
 * (see `repaint`), and the document's later echo replaces them one by one. Without
 * the overlay a late echo of the PREVIOUS value would snap the page back for a
 * moment — the same "it jumped back" flicker the slider ledger exists to prevent.
 */
var pendingLocalValues = {};

/** How long a locally painted value is trusted while the document has not echoed it. */
var PAINT_PATIENCE_MS = 45000;

/**
 * When a control gives the user's value back on a host that answers NOTHING.
 *
 * A refusal is handled by result (`refuseField`), never by a clock. This is the last
 * resort for a write whose answer never arrives at all, so it sits far above the
 * slowest answer measured on this host line: one settings write took 1.0-5.14 s on
 * an idle instance (median 1.3 s), and the 7-8 s a loaded instance needs for a click
 * is two writes one after the other, i.e. about 4 s each. At 30 s this cannot fire
 * for a write that is merely slow — which is exactly what the 6 s patience it
 * replaces did, on writes that were all accepted.
 */
var WRITE_FALLBACK_MS = 30000;

/**
 * How long one settings call may stay unanswered before the next one is sent.
 *
 * One call is in flight at a time (see the card's write queue), so a settings call
 * that never answers would stall every later click; this releases the queue. It is
 * the same 30 s as the control's own fallback and deliberately not shorter: a queue
 * released while its call is still in flight would put two patches for one field on
 * the wire, and the older answer can then arrive last.
 */
var WRITE_SETTLE_TIMEOUT_MS = 30000;

/**
 * How long the card waits for the user to stop before it writes.
 *
 * Kept at 0 for this release: one move is written straight away, which is the
 * behaviour that has been tried on a real page. A quiet window that folds a whole
 * run of clicks into ONE write (300 ms) is implemented and covered by offline
 * cases, but it has not been checked on a real page, so it waits for the next
 * release.
 */
var WRITE_QUIET_MS = 0;

/**
 * How long a scheduled local paint may wait for its frame before it paints anyway.
 *
 * A frame is the right moment to paint (several moves inside one frame cost one
 * rebuild), but frame production is not guaranteed: a throttled or backgrounded tab
 * can stop it for as long as it likes, and a paint that waits forever is a page that
 * looks frozen on the old value while the control shows the new one.
 */
var PAINT_BACKSTOP_MS = 250;

/**
 * Repaint the injected stylesheet from the document plus the pending values.
 *
 * Set by `apply`, which owns the `<style>` element; the card calls it through
 * `requestAnimationFrame` when it queues a move, so a burst of moves paints once
 * with the latest value instead of once per click.
 */
var repaint = null;

/**
 * Paint one value locally, without writing anything.
 *
 * The floating panel's drag and any other preview share this: the
 * page follows the value while the settings document never sees it, so a
 * preview costs no write at all. `undefined` lifts a previous local move and
 * shows the document's own value again.
 * @param {string} field - a settings field name.
 * @param {string|number|boolean|undefined} value - the value to paint.
 */
function paintLocalMove(field, value) {
  if (value === undefined) {
    delete pendingLocalValues[field];
  } else {
    pendingLocalValues[field] = { op: shared.PENDING_SET, value: value, at: Date.now(), tries: 0 };
  }
  if (typeof repaint === "function") repaint();
}

/**
 * Drop one locally painted value and show the document's own again.
 * @param {string} field - a settings field name.
 */
function clearLocalMove(field) {
  delete pendingLocalValues[field];
  if (typeof repaint === "function") repaint();
}

/**
 * Write several fields as ONE settings call, with the preset mirror attached.
 *
 * The writer outside the card (the floating panel) shares this instead of the
 * card's queue: one intent is one call —
 * the axis fields plus the active preset's snapshot travel in a single
 * `mutate`, exactly like the card's own flush. A host without `mutate` falls
 * back to one field per call. Every field is painted locally first, so the
 * page follows at once; a refused write lifts the paint again and reports.
 * @param {object} scope - the bound settings scope.
 * @param {object[]} presetList - the stored preset entries.
 * @param {string} activeName - the selected preset's name ("" = none).
 * @param {Record<string, unknown>} changes - field to value (`undefined`
 *   unsets); only value-axis fields mirror into the preset.
 * @param {{mirror?: boolean, onError?: (message: string) => void}} [options] -
 *   `mirror: false` keeps chrome (panel position) out of presets.
 */
function writeSingleShot(scope, presetList, activeName, changes, options) {
  var settings = options !== null && typeof options === "object" ? options : {};
  var fields = [];
  for (var field in changes) {
    if (!Object.prototype.hasOwnProperty.call(changes, field)) continue;
    fields.push(field);
    paintLocalMove(field, changes[field]);
  }
  if (fields.length === 0) return;
  var ops = [];
  for (var index = 0; index < fields.length; index += 1) {
    var name = fields[index];
    if (changes[name] === undefined) ops.push({ op: shared.PENDING_UNSET, path: [name] });
    else ops.push({ op: shared.PENDING_SET, path: [name], value: changes[name] });
  }
  if (settings.mirror !== false) {
    var snapshot = shared.mirrorPresetSnapshot(presetList, activeName, changes);
    if (snapshot !== null) ops.push({ op: snapshot.op, path: snapshot.path, value: snapshot.value });
  }
  var fail = function (message) {
    for (var at = 0; at < fields.length; at += 1) clearLocalMove(fields[at]);
    if (typeof settings.onError === "function") settings.onError(message);
  };
  var verdict = function (applied, error) {
    if (applied === false) {
      var text =
        error === false || error === undefined
          ? "the host refused the write"
          : error && error.message
            ? String(error.message).slice(0, 160)
            : String(error).slice(0, 160);
      fail(text);
    }
  };
  probeLog("single-shot", {
    ops: ops.map(function (op) {
      return op.path[0] + "=" + String(op.value).slice(0, 24);
    }),
  });
  try {
    if (scope && typeof scope.mutate === "function" && (typeof scope.canMutate !== "function" || scope.canMutate())) {
      var batch = scope.mutate(ops);
      if (batch && typeof batch.then === "function") {
        batch.then(
          function (accepted) {
            verdict(accepted !== false, accepted);
          },
          function (error) {
            verdict(false, error);
          }
        );
        return;
      }
      verdict(batch !== false, batch);
      return;
    }
  } catch (error) {
    fail(error && error.message ? String(error.message).slice(0, 160) : String(error).slice(0, 160));
    return;
  }
  // A host without the batch call takes one field per call; the last verdict
  // is the write's.
  var at = 0;
  var step = function () {
    if (at >= ops.length) return;
    var op = ops[at];
    at += 1;
    var single = null;
    try {
      single =
        op.op === shared.PENDING_UNSET
          ? scope.unset(op.path[0])
          : scope.set(op.path[0], op.value);
    } catch (error) {
      fail(error && error.message ? String(error.message).slice(0, 160) : String(error).slice(0, 160));
      return;
    }
    if (single && typeof single.then === "function") {
      single.then(
        function (accepted) {
          if (accepted === false) verdict(false, accepted);
          else step();
        },
        function (error) {
          verdict(false, error);
        }
      );
      return;
    }
    step();
  };
  step();
}

/**
 * Record one step of a slider's local-value ledger when the page is being probed.
 *
 * `globalThis.__DFP_PROBE__` is the same switch `apply` uses to describe the scope it
 * bound. With it on, every commit, reconciliation, refusal and fallback is
 * timestamped into `__DFP_PROBE_LOG__`, so a live run can be read back instead of
 * inferred from what the page ended up showing. Inert in a normal session.
 * @param {string} kind - which step of the ledger this is.
 * @param {object} detail - what the ledger held at that moment.
 */
function probeLog(kind, detail) {
  if (globalThis.__DFP_PROBE__ !== true) return;
  var log = globalThis.__DFP_PROBE_LOG__;
  if (!Array.isArray(log)) {
    log = [];
    globalThis.__DFP_PROBE_LOG__ = log;
  }
  log.push({ at: Date.now(), kind: kind, detail: detail });
}

/**
 * Render the sample at one weight and describe the result.
 *
 * The signature is the total ink (summed alpha) plus the advance width at high
 * precision. Counting only fully-covered pixels would miss what a variable axis
 * does between two named instances — a couple of units of extra alpha per glyph
 * — and report a coarse family where the weights are in fact continuous.
 * @param {string} stack - resolved `font-family` value.
 * @param {number} weight - CSS weight to draw with.
 * @returns {string} the signature; equal signatures mean identical rendering.
 */
function sampleWeightSignature(stack, weight) {
  if (weightProbeCanvas === null) {
    weightProbeCanvas = document.createElement("canvas");
    weightProbeCanvas.width = 260;
    weightProbeCanvas.height = 56;
  }
  // `willReadFrequently` matters here: the profile probe reads the canvas back once
// per sampled weight (~80 times on the first measurement), and without it the
// browser keeps a GPU-backed surface and warns about the readbacks — which is part
// of why dragging the weight felt heavy.
var context = weightProbeCanvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, weightProbeCanvas.width, weightProbeCanvas.height);
  context.font = weight + " 32px " + stack;
  context.textBaseline = "top";
  context.fillStyle = "#000";
  context.fillText(WEIGHT_SAMPLE_TEXT, 2, 6);
  var advance = Math.round(context.measureText(WEIGHT_SAMPLE_TEXT).width * 1000);
  var pixels = context.getImageData(0, 0, weightProbeCanvas.width, weightProbeCanvas.height).data;
  var ink = 0;
  for (var index = 3; index < pixels.length; index += 4) ink += pixels[index];
  return ink + "/" + advance;
}

/**
 * The slider shape to use for one family: its range and its notch.
 *
 * A family can only be made as light or as heavy as the faces it ships, so the
 * range is measured rather than fixed (`weightProfileFrom`), which also makes
 * every notch a change — for every layer of the ladder, so the measurement is
 * told which base is the heaviest one the offset lands on. Measured once per
 * family and base and cached; any failure (no canvas, no 2D context) falls back
 * to the nominal window with single units.
 * @param {string} stack - resolved `font-family` value, "" for the page default.
 * @param {number} [top] - the heaviest base the offset is added to; the ladder's
 *   own top for the conversation and interface axes, the axis's base for code.
 * @returns {{min: number, max: number, step: number}} the slider shape.
 */
function weightProfileFor(stack, top) {
  var base = typeof top === "number" ? top : shared.WEIGHT_LADDER_TOP;
  var key = String(stack) + "\u0000" + base;
  if (Object.prototype.hasOwnProperty.call(weightProfileCache, key)) {
    return weightProfileCache[key];
  }
  var profile = { min: WEIGHT_DELTA_MIN, max: WEIGHT_DELTA_MAX, step: 1 };
  try {
    var resolved = String(stack) === "" ? liveFamily() : String(stack);
    profile = weightProfileFrom(function (weight) {
      return sampleWeightSignature(resolved, weight);
    }, { top: base });
  } catch (error) {
    profile = { min: WEIGHT_DELTA_MIN, max: WEIGHT_DELTA_MAX, step: 1 };
  }
  weightProfileCache[key] = profile;
  return profile;
}

/**
 * The family each weight axis is measured against, resolved once.
 *
 * The collapsed summaries, the sliders, the previews and the warm-up below all
 * have to agree on which family a count belongs to, so the resolution lives
 * here and not in any one caller: the configured stack when there is one, the
 * page's own family otherwise.
 * @param {object} editing - the value set being edited.
 * @returns {{ui: string, dialog: string, code: string}} the stacks.
 */
function weightAxisStacks(editing) {
  var dialogFallbackFamily =
    typeof FALLBACK_TOKENS["--dsw-font-family"] === "string" ? FALLBACK_TOKENS["--dsw-font-family"] : "";
  return {
    ui: editing[SANS_FIELD] !== "" ? formatStack(parseStack(editing[SANS_FIELD])) : "",
    dialog:
      editing[STACK_DIALOG_FIELD] !== ""
        ? formatStack(parseStack(editing[STACK_DIALOG_FIELD]))
        : dialogFallbackFamily,
    code: editing[MONO_FIELD] !== "" ? formatStack(parseStack(editing[MONO_FIELD])) : liveCodeFamily(),
  };
}

/**
 * Run one warm-up job in idle time, falling back to the next task.
 * @param {Function} job - the work to schedule.
 */
function deferWeightWarm(job) {
  var idle = globalThis.requestIdleCallback;
  if (typeof idle === "function") {
    idle.call(globalThis, job, { timeout: 1500 });
  } else {
    globalThis.setTimeout(job, 0);
  }
}

/**
 * Measure the three weight axes' slider shapes before any card mounts.
 *
 * The measurement draws every sampled weight and reads the canvas back — around
 * eighty readbacks per family — and that used to land on the card's own first
 * render, which is why opening the settings page stalled once per refresh while
 * every later open was smooth: the result is cached per family. Warming here,
 * in idle slices one axis at a time, turns the card's first render into a cache
 * hit. The slices run whenever the resolved stacks change (the first sync after
 * load, and every font change after it) and never when nothing moved.
 * @param {object} editing - the value set the axes read.
 */
var warmSignature = null;
var scheduleWeightWarm = function (editing) {
  var stacks = weightAxisStacks(editing);
  var signature = stacks.dialog + "\u0000" + stacks.ui + "\u0000" + stacks.code;
  if (signature === warmSignature) return;
  warmSignature = signature;
  var jobs = [
    function () {
      weightProfileFor(stacks.dialog, shared.WEIGHT_LADDER_STRONG);
      probeLog("weight-warm", { axis: "dialog", stack: stacks.dialog });
    },
    function () {
      weightProfileFor(stacks.ui, shared.WEIGHT_LADDER_STRONG);
      probeLog("weight-warm", { axis: "ui", stack: stacks.ui });
    },
    function () {
      weightProfileFor(stacks.code, shared.WEIGHT_BASE);
      probeLog("weight-warm", { axis: "code", stack: stacks.code });
    },
  ];
  var runNext = function () {
    var job = jobs.shift();
    if (job === undefined) return;
    job();
    deferWeightWarm(runNext);
  };
  deferWeightWarm(runNext);
};

/**
 * The family the page actually renders with, as a `font-family` value.
 * @returns {string} the computed family, or "" when unreadable.
 */
function liveFamily() {
  if (typeof document === "undefined") return "";
  try {
    return document.defaultView.getComputedStyle(document.body).fontFamily || "";
  } catch (error) {
    return "";
  }
}

/**
 * The conversation's own line-height ratio, measured once.
 *
 * The dialog line-height axis is a percentage OF DSH's own height (`28px × 1.05`),
 * so a preview that used the percentage as an ABSOLUTE ratio was wrong twice over:
 * at 100% it fell back to DSH's real (taller) default, while 105% asked for 1.05 —
 * shorter than that default and out of order with the notches above it.
 *
 * The base is read from a hidden node carrying the markdown class whose rule
 * consumes DSH's markdown shorthand, so it is the same ratio the page multiplies.
 * @returns {number} line height ÷ font size; a plain default when unmeasurable.
 */
var DIALOG_LINE_RATIO_FALLBACK = 1.5;
var dialogLineRatioCache = null;
function dialogLineRatio() {
  if (typeof dialogLineRatioCache === "number") return dialogLineRatioCache;
  if (typeof document === "undefined" || typeof document.defaultView === "undefined") {
    return DIALOG_LINE_RATIO_FALLBACK;
  }
  try {
    var className = "";
    var sheets = document.styleSheets || [];
    for (var index = 0; index < sheets.length && className === ""; index += 1) {
      var rules = null;
      try {
        rules = sheets[index].cssRules;
      } catch (error) {
        rules = null;
      }
      if (!rules) continue;
      for (var ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
        var selector = rules[ruleIndex].selectorText || "";
        var body = rules[ruleIndex].style ? rules[ruleIndex].style.cssText : "";
        if (selector.indexOf("_markdown_") < 0) continue;
        if (body.indexOf("--dsw-font-markdown-base") < 0) continue;
        var found = selector.match(/\.(_markdown_[A-Za-z0-9_-]+)/);
        if (found) className = found[1];
      }
    }
    if (className !== "") {
      var host = document.createElement("div");
      host.className = className;
      host.setAttribute("data-dss-prose", "");
      host.style.position = "absolute";
      host.style.visibility = "hidden";
      host.style.left = "-9999px";
      var probe = document.createElement("p");
      probe.textContent = "line";
      probe.style.margin = "0";
      host.appendChild(probe);
      document.body.appendChild(host);
      var style = document.defaultView.getComputedStyle(probe);
      var size = parseFloat(style.fontSize);
      var height = parseFloat(style.lineHeight);
      if (isFinite(size) && size > 0 && isFinite(height) && height > 0) {
        dialogLineRatioCache = Math.round((height / size) * 10000) / 10000;
      }
      if (host.parentNode) host.parentNode.removeChild(host);
    }
  } catch (error) {
    /* the fallback stands */
  }
  if (typeof dialogLineRatioCache !== "number") dialogLineRatioCache = DIALOG_LINE_RATIO_FALLBACK;
  return dialogLineRatioCache;
}

/**
 * The family code surfaces render with when the code axis sets none.
 * @returns {string} the computed family, or "" when unreadable.
 */
function liveCodeFamily() {
  if (typeof document === "undefined") return "";
  try {
    var sample = document.querySelector("pre, code, kbd, samp");
    if (sample === null) return liveFamily();
    return document.defaultView.getComputedStyle(sample).fontFamily || liveFamily();
  } catch (error) {
    return "";
  }
}

/* ------------------------------------------------------------------ *
 * hooks and controls
 * ------------------------------------------------------------------ */

/**
 * Read the settings snapshot and re-render whenever it is replaced.
 *
 * `scope.subscribe` must reach React WRAPPED, never as a bare method
 * reference: it is a prototype method that reads `this.store`, and React
 * invokes the subscriber as a plain function, so a detached reference throws
 * `Cannot read properties of undefined (reading 'store')` the first time the
 * card renders.
 * @param {{getSnapshot: () => any, subscribe: (fn: () => void) => () => void}} scope - bound scope.
 * @returns {any} the current snapshot.
 */
function useScopeSnapshot(scope) {
  var cache = useRef({ snapshot: null, revision: -1 });
  var getRevision = useCallback(
    function () {
      var snapshot = scope.getSnapshot();
      cache.current = {
        snapshot: snapshot,
        revision: typeof snapshot.revision === "number" ? snapshot.revision : -1,
      };
      return cache.current.revision;
    },
    [scope]
  );
  useSyncExternalStore(
    function (onChange) {
      return scope.subscribe(onChange);
    },
    getRevision,
    getRevision
  );
  return scope.getSnapshot();
}

/**
 * One labelled field row with its overridden badge and reset control.
 * @param {object} props - copy, override state, reset action and children.
 * @returns {object} the row element.
 */
function FieldShell(props) {
  // `inline` puts the control ON the label row (pushed right), the way a
  // compact choice belongs: a segmented sitting under the hint reads as a
  // different component than the one beside it. Wide controls (sliders, text
  // fields) keep the control below the hint.
  var control = props.inline === true ? h("div", { className: "dfp-inline" }, props.children) : props.children;
  return h(
    "div",
    { className: "dfp-field" + (props.last ? " dfp-fieldLast" : "") },
    h(
      "div",
      { className: "dfp-fieldHead" },
      h("span", { className: "dfp-fieldLabel" }, props.label),
      props.overridden
        ? h("span", { className: "dfp-overridden" }, props.t("common.overridden"))
        : null,
      props.overridden
        ? h(
            "button",
            {
              type: "button",
              className: "dfp-fieldReset",
              disabled: props.disabled,
              onClick: props.onReset,
            },
            props.t("common.reset")
          )
          : null,
      props.inline === true ? control : null
    ),
    h("p", { className: "dfp-hint" }, props.hint),
    props.inline === true ? null : control
  );
}

/**
 * One accordion section: a title row that reads like a summary line, and the
 * controls only when expanded. The card keeps at most one section open.
 * @param {object} props - copy, open state, toggle handler and children.
 * @returns {object} the section element.
 */
function Section(props) {
  return h(
    "div",
    { className: "dfp-section" + (props.last ? " dfp-sectionLast" : ""), ref: props.wrapRef },
    h(
      "button",
      {
        type: "button",
        className: "dfp-sectionHead",
        "aria-expanded": props.open,
        "aria-label": props.t(props.open ? "section.close" : "section.open", { name: props.title }),
        onClick: props.onToggle,
      },
      h("span", { className: "dfp-sectionTitle" }, props.title),
      // Collapsed: the summary fills the middle. Expanded: an empty spacer
      // takes its place so the chevron never leaves the far right edge.
      props.open
        ? h("span", { className: "dfp-sectionSpacer", "aria-hidden": "true" })
        : h("span", { className: "dfp-sectionSummary" }, props.summary),
      h(
        "svg",
        {
          className: "dfp-chevron" + (props.open ? " dfp-chevronOpen" : ""),
          width: 14,
          height: 14,
          viewBox: "0 0 14 14",
          fill: "none",
          "aria-hidden": "true",
        },
        h("path", { d: CHEVRON_PATH, fill: "currentColor" })
      )
    ),
    props.open ? h("div", { className: "dfp-sectionBody" }, props.children) : null
  );
}

/**
 * A slider over a whole-number range with a live value readout.
 * Dragging only moves a local value; the change handler runs once the
 * pointer is released (or on blur/keyup), so intermediate steps never
 * rewrite the settings document — the page does not recompute per pixel.
 * @param {object} props - range, step, value, labels, change handler and an
 *   optional pendingText(v) formatting the readout while dragging.
 * @returns {object} the slider element.
 */
function NumberSlider(props) {
  var [pending, setPending] = useState(null);
  // A write the document never took: the readout falls back to the document and
  // this says so once, instead of the thumb looking like it moved on its own.
  var [reverted, setReverted] = useState(false);
  var step = typeof props.step === "number" && props.step > 0 ? props.step : 1;
  // The value the host has not confirmed yet. Between the release and the
  // settings round-trip the committed prop is still the OLD number — clearing
  // the local value right away would show that old number for one frame
  // (the "bounce back, then settle" the user saw), so the local value stays
  // on screen until the confirmed value arrives.
  var awaitingRef = useRef(null);
  // The same value as `pending`, readable without a render: the reconciliation
  // below runs from an effect that only depends on the incoming value.
  var pendingRef = useRef(null);
  var setLocal = function (value) {
    pendingRef.current = value;
    setPending(value);
  };
  useEffect(
    function () {
      // `reconcileSliderValue` owns the decision (and is unit-tested): keeping
      // the local value while the user is mid-drag is what stops a late
      // confirmation from snapping the thumb back to the previous value.
      var next = reconcileSliderValue({
        pending: pendingRef.current,
        awaiting: awaitingRef.current,
        confirmed: props.value,
      });
      probeLog("reconcile", {
        pending: pendingRef.current,
        awaiting: awaitingRef.current,
        confirmed: props.value,
        kept: next,
      });
      awaitingRef.current = next.awaiting;
      setLocal(next.pending);
      return undefined;
    },
    [props.value]
  );
  var commit = function (value) {
    probeLog("commit", { value: value });
    awaitingRef.current = value;
    setReverted(false);
    props.onChange(value);
  };
  /**
   * Stop holding a value the host never confirmed.
   *
   * The local value is kept until the document echoes it back, which is what
   * stops the "bounce back, then settle" flicker — but a write the host REFUSES
   * (an out-of-range value against an older schema, a read-only deployment) never
   * echoes, and the slider would then sit on a value the document does not have,
   * i.e. it would look like it jumped somewhere else and stayed there.
   *
   * Which is why the decision is made by RESULT, not by a clock. The card raises
   * `refusedToken` the moment the host answers "no" (`false` or a rejection), and
   * that is the only thing that takes the user's value off the screen right away.
   * A write that is merely still in flight keeps showing what the user chose,
   * however long the host takes: a timer short enough to fire during a healthy
   * write was the whole reason a slow instance looked like it "reverted to the
   * stored value, then moved again".
   *
   * The timer that remains only covers a host that answers NOTHING at all, so it
   * sits far above the slowest answer ever measured here ({@link WRITE_FALLBACK_MS}).
   */
  var refusedToken = typeof props.refusedToken === "number" ? props.refusedToken : 0;
  useEffect(
    function () {
      if (refusedToken === 0) return undefined;
      // The host looked at this write and said no: no echo is coming.
      probeLog("refused", { token: refusedToken, awaiting: awaitingRef.current });
      awaitingRef.current = null;
      setLocal(null);
      setReverted(true);
      return undefined;
    },
    [refusedToken]
  );
  useEffect(
    function () {
      if (awaitingRef.current === null) return undefined;
      var timer = setTimeout(function () {
        // The ledger is the authority, not this timer: a value confirmed while the
        // timer was pending must not report anything, whatever the timer was told.
        if (awaitingRef.current === null) return;
        probeLog("fallback", { awaiting: awaitingRef.current, pending: pendingRef.current });
        awaitingRef.current = null;
        setLocal(null);
        // Nothing came back at all, so the document is the only truth there is.
        setReverted(true);
      }, WRITE_FALLBACK_MS);
      return function () {
        clearTimeout(timer);
      };
    },
    [pending]
  );
  useEffect(
    function () {
      if (pending === null) return undefined;
      var release = function () {
        // One release per drag: a late pointerup must not rewrite the SAME value.
        // The guard compares values instead of "is anything outstanding" — a
        // commit still waiting for the document must not swallow the next drag's
        // release, which silently dropped that adjustment on a slow host.
        if (awaitingRef.current === pending) {
          probeLog("release-ignored", { pending: pending, awaiting: awaitingRef.current });
          return;
        }
        commit(pending);
      };
      window.addEventListener("pointerup", release, true);
      window.addEventListener("touchend", release, true);
      return function () {
        window.removeEventListener("pointerup", release, true);
        window.removeEventListener("touchend", release, true);
      };
    },
    [pending]
  );
  var shown = pending === null ? props.value : pending;
  var readout =
    pending === null
      ? props.readout
      : props.pendingText
        ? props.pendingText(pending)
        : String(pending);
  return h(
    "div",
    null,
    h(
      "div",
      { className: "dfp-sliderRow" },
      h("input", {
        type: "range",
        className: "dfp-slider",
        min: props.min,
        max: props.max,
        step: step,
        value: shown,
        disabled: props.disabled,
        "aria-label": props.label,
        onChange: function (event) {
          // Through `setLocal`, not `setPending`: the ref is what the reconciliation
          // effect reads, and a ref that lags the state makes that effect clear a
          // value the user is still holding — and leave the fallback timer of the
          // cleared value running, which then reports a write that had been taken.
          setLocal(Number(event.target.value));
        },
        onKeyUp: function () {
          if (pending !== null) commit(pending);
        },
        onBlur: function () {
          if (pending !== null) commit(pending);
        },
      }),
      h("span", { className: "dfp-value" }, readout)
    ),
    reverted && props.revertedText
      ? h("div", { className: "dfp-sliderNotice" }, props.revertedText)
      : null,
    h(
      "div",
      { className: "dfp-scale" },
      h("span", null, props.minLabel),
      h("span", null, props.maxLabel)
    )
  );
}

/**
 * One joined segmented control over a small fixed option list.
 * @param {object} props - options [{value,label}], the current value, the
 *   change handler and an optional aria label.
 * @returns {object} the segmented control element.
 */
function Segmented(props) {
  var options = props.options;
  return h(
    "div",
    { className: "dfp-modeSeg", role: "group", "aria-label": props.label },
    options.map(function (option, index) {
      var active = option.value === props.value;
      return h(
        "button",
        {
          type: "button",
          key: option.value,
          className: "dfp-modeButton" + (active ? " dfp-modeButtonActive" : ""),
          "aria-pressed": active,
          disabled: props.disabled,
          onClick: function () {
            props.onChange(option.value);
          },
        },
        option.label
      );
    })
  );
}

/**
 * The preset dropdown: a trigger styled like a select box — the active
 * preset's name with the card's own chevron pointing down inside it on the
 * right — and a portaled menu listing the presets. Picking an entry applies
 * it, makes it the auto-save target and closes the menu. The menu is
 * portaled to `body` because the settings sheet's scroll container would
 * otherwise clip it.
 * @param {object} props - copy, the preset list, the active name, the pick
 *   handler and the disabled flag.
 * @returns {object} the select element.
 */
function PresetSelect(props) {
  var t = props.t;
  var anchorRef = useRef(null);
  var panelRef = useRef(null);
  var [open, setOpen] = useState(false);
  var [position, setPosition] = useState(null);

  useEffect(
    function () {
      if (!open) return undefined;
      var place = function () {
        var anchor = anchorRef.current;
        var view = globalThis;
        if (!anchor || typeof view.innerWidth !== "number") return;
        var rect = anchor.getBoundingClientRect();
        var margin = 10;
        var left = Math.max(margin, Math.min(rect.left, view.innerWidth - rect.width - margin));
        var below = rect.bottom + 4;
        var top = below;
        if (below + 240 > view.innerHeight - margin) {
          top = Math.max(margin, rect.top - 244);
        }
        setPosition({ left: left, top: top, minWidth: Math.max(rect.width, 160) });
      };
      place();
      var view = globalThis;
      view.addEventListener("resize", place);
      view.addEventListener("scroll", place, true);
      return function () {
        view.removeEventListener("resize", place);
        view.removeEventListener("scroll", place, true);
      };
    },
    [open]
  );

  useEffect(
    function () {
      if (!open) return undefined;
      var onPointerDown = function (event) {
        var anchor = anchorRef.current;
        var panel = panelRef.current;
        if (anchor && anchor.contains(event.target)) return;
        if (panel && panel.contains(event.target)) return;
        setOpen(false);
      };
      var onKeyDown = function (event) {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
      return function () {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown);
      };
    },
    [open]
  );

  var menu = null;
  if (open) {
    var items = props.presets.map(function (entry, index) {
      var active = entry.name === props.value;
      return h(
        "button",
        {
          type: "button",
          className: "dfp-option",
          key: entry.name + ":" + index,
          role: "option",
          "aria-selected": active,
          onClick: function () {
            setOpen(false);
            props.onPick(entry);
          },
        },
        h("span", { className: "dfp-optionLabel" }, entry.name),
        active ? h("span", { className: "dfp-optionCheck" }, "✓") : null
      );
    });
    menu = createPortal(
      h(
        "div",
        {
          className: "dfp-drop",
          ref: panelRef,
          role: "listbox",
          "aria-label": t("preset.select"),
          style: position === null ? undefined : { left: position.left, top: position.top, minWidth: position.minWidth },
        },
        items
      ),
      document.body
    );
  }

  return h(
    "span",
    { className: "dfp-selectWrap", ref: anchorRef },
    h(
      "button",
      {
        type: "button",
        className: "dfp-select",
        "aria-haspopup": "listbox",
        "aria-expanded": open,
        "aria-label": t("preset.select"),
        disabled: props.disabled === true,
        onClick: function () {
          setOpen(!open);
        },
      },
      h("span", { className: "dfp-selectName" }, props.value),
      h(
        "svg",
        {
          className: "dfp-selectChevron" + (open ? " dfp-selectChevronOpen" : ""),
          width: 14,
          height: 14,
          viewBox: "0 0 14 14",
          fill: "none",
          "aria-hidden": "true",
        },
        h("path", { d: CHEVRON_PATH, fill: "currentColor" })
      )
    ),
    menu
  );
}

/* ------------------------------------------------------------------ *
 * font enumeration
 * ------------------------------------------------------------------ */

/**
 * @typedef {{status: "unsupported"|"loading"|"denied"|"ready", families: string[],
 *   at?: number, permanent?: boolean}} Catalog
 */

/** Enumeration is session-stable, so it is resolved once and kept. */
var catalogCache = null;

/**
 * How long a refused (or empty) enumeration is trusted before the picker asks
 * again. Answering "denied" and never retrying is wrong in the case that
 * actually happens: the user grants the permission from the browser's prompt
 * or site settings and expects the list to fill in — and when the permission
 * is still blocked the browser rejects the call instantly without prompting,
 * so the retry costs nothing.
 */
var CATALOG_RETRY_MS = 20000;

/** The clock, injectable so the retry window is testable without waiting. */
var catalogNow = function () {
  return Date.now();
};

/**
 * Enumerate installed families; the built-in presets stand in when the browser
 * cannot or will not enumerate them.
 * @param {boolean} [force] - ignore a cached refusal and ask again.
 * @returns {Promise<Catalog>} the catalog.
 */
async function loadCatalog(force) {
  var now = catalogNow();
  if (force !== true && !shared.catalogRefreshDue(catalogCache, now, CATALOG_RETRY_MS)) {
    return catalogCache;
  }
  var host = /** @type {{queryLocalFonts?: () => Promise<Array<{family: string}>>}} */ (
    globalThis
  );
  if (typeof host.queryLocalFonts !== "function") {
    // No API at all: retrying cannot help, and the picker says so.
    catalogCache = { status: "unsupported", families: [], at: now, permanent: true };
    return catalogCache;
  }
  try {
    var fonts = await host.queryLocalFonts();
    var seen = {};
    var families = [];
    for (var index = 0; index < fonts.length; index += 1) {
      var family = sanitizeFamily(fonts[index].family);
      if (family === "") continue;
      var key = family.toLowerCase();
      if (seen[key] === true) continue;
      seen[key] = true;
      families.push(family);
    }
    families.sort(function (left, right) {
      return left.localeCompare(right);
    });
    catalogCache =
      families.length === 0
        ? { status: "unsupported", families: [], at: now }
        : { status: "ready", families: families, at: now };
  } catch (error) {
    // A refused permission is the common case here: `queryLocalFonts` prompts.
    catalogCache = { status: "denied", families: [], at: now };
  }
  return catalogCache;
}

/** Per-session classification cache; measurement is deterministic. */
var cjkCache = {};

/**
 * Measure whether a family actually renders CJK text.
 *
 * Width comparison is the trick that works without loading anything: a family
 * that lacks the glyphs leaves the string to the fallback, so both runs measure
 * identically. Returns null when measuring is impossible, letting the caller
 * fall back to the name heuristic.
 * @param {string} name - a family name.
 * @returns {boolean|null} the measured verdict, or null when unavailable.
 */
function measureCJK(name) {
  if (typeof document === "undefined" || !document.body) return null;
  try {
    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d");
    if (context === null) return null;
    var probe = "中文字體测试";
    context.font = "72px " + quoteFamily(name) + ", monospace";
    var withFamily = context.measureText(probe).width;
    context.font = "72px monospace";
    var without = context.measureText(probe).width;
    if (withFamily <= 0) return null;
    return withFamily !== without;
  } catch (error) {
    return null;
  }
}

/**
 * Classify a family for the simple mode's West/CJK slots.
 *
 * The name heuristic answers FIRST: it is deliberately generous, because a
 * false "east" only parks the family in the CJK slot while a miss would hide a
 * CJK family in the western slot — and crucially, a preset family this machine
 * has not installed must still land in the CJK slot (measurement would report
 * "no coverage" for anything uninstalled, since the fallback renders the
 * probe). The canvas measurement only adds a check for families whose names do
 * not hint at CJK. Verdicts are cached per session.
 * @param {string} name - a family name.
 * @returns {boolean} true when the family belongs in the CJK slot.
 */
function classifyFamily(name) {
  var key = name.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(cjkCache, key)) return cjkCache[key];
  var verdict;
  if (isGenericFamilyName(name)) verdict = false;
  else if (isCJKFamilyName(name)) verdict = true;
  else {
    verdict = measureCJK(name);
    if (verdict === null) verdict = false;
  }
  cjkCache[key] = verdict;
  return verdict;
}

/* ------------------------------------------------------------------ *
 * clipboard
 * ------------------------------------------------------------------ */

/**
 * Copy through the legacy selection path.
 *
 * This is not a museum piece: the async Clipboard API only exists in a secure
 * context, and the deployment note in this repository's README documents a
 * remote HTTP origin where `navigator.clipboard` is simply absent. A
 * selection-based copy still works there, and it also works when the async
 * call is refused without the clipboard-write permission.
 * @param {string} text - what to put on the clipboard.
 * @returns {boolean} whether the copy command reported success.
 */
function copyBySelection(text) {
  if (typeof document === "undefined" || !document.body) return false;
  if (typeof document.execCommand !== "function") return false;
  var area = null;
  try {
    area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    // Off-screen rather than hidden: `display:none` cannot hold a selection.
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    return document.execCommand("copy") === true;
  } catch (error) {
    return false;
  } finally {
    if (area !== null && area.parentNode) area.parentNode.removeChild(area);
  }
}

/**
 * Copy text, trying the async API first and the selection fallback after it.
 * @param {string} text - what to put on the clipboard.
 * @returns {Promise<boolean>} whether the text reached the clipboard.
 */
async function copyText(text) {
  var nav = globalThis.navigator;
  if (
    nav !== undefined &&
    nav !== null &&
    nav.clipboard !== undefined &&
    typeof nav.clipboard.writeText === "function"
  ) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch (error) {
      // No permission, or no clipboard in this context: fall through.
    }
  }
  return copyBySelection(text);
}

/* ------------------------------------------------------------------ *
 * the family picker
 * ------------------------------------------------------------------ */

/**
 * The family picker: the current stack as draggable, removable chips plus an
 * anchored panel of presets, enumerated families and a "use what was typed"
 * row.
 *
 * `single` mode reuses the same panel for the simple mode's West/CJK slots:
 * one trigger button shows the current family, a click picks it and closes,
 * and nothing about the rest of the stack is touched.
 * @param {object} props - copy, the CSS stack value, the change handler, and
 *   for `single` mode the current value plus the pick handler.
 * @returns {object} the picker element.
 */
function StackPicker(props) {
  var single = props.single === true;
  var t = props.t;
  var anchorRef = useRef(null);
  var panelRef = useRef(null);
  var [open, setOpen] = useState(false);
  var [query, setQuery] = useState("");
  var [catalog, setCatalog] = useState({ status: "loading", families: [] });
  var [dragIndex, setDragIndex] = useState(-1);
  var [dropIndex, setDropIndex] = useState(-1);
  var [position, setPosition] = useState(null);

  var families = useMemo(
    function () {
      return parseStack(props.value);
    },
    [props.value]
  );

  useEffect(
    function () {
      if (!open) return undefined;
      var cancelled = false;
      void loadCatalog().then(function (next) {
        if (!cancelled) setCatalog(next);
      });
      return function () {
        cancelled = true;
      };
    },
    [open]
  );

  // The panel is portaled to `body` and positioned from the trigger, so the
  // settings sheet's own scroll container cannot clip it.
  useEffect(
    function () {
      if (!open) return undefined;
      var place = function () {
        var anchor = anchorRef.current;
        var view = globalThis;
        if (!anchor || typeof view.innerWidth !== "number") return;
        var rect = anchor.getBoundingClientRect();
        var margin = 10;
        var left = Math.max(
          margin,
          Math.min(rect.right - PANEL_WIDTH, view.innerWidth - PANEL_WIDTH - margin)
        );
        var below = rect.bottom + 6;
        var top =
          below + PANEL_HEIGHT > view.innerHeight - margin
            ? Math.max(margin, rect.top - PANEL_HEIGHT - 6)
            : below;
        setPosition({ left: left, top: top });
      };
      place();
      const view = globalThis;
      view.addEventListener("resize", place);
      view.addEventListener("scroll", place, true);
      return function () {
        view.removeEventListener("resize", place);
        view.removeEventListener("scroll", place, true);
      };
    },
    [open]
  );

  useEffect(
    function () {
      if (!open) return undefined;
      var onPointerDown = function (event) {
        var anchor = anchorRef.current;
        var panel = panelRef.current;
        if (anchor && anchor.contains(event.target)) return;
        if (panel && panel.contains(event.target)) return;
        setOpen(false);
      };
      var onKeyDown = function (event) {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
      return function () {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown);
      };
    },
    [open]
  );

  var commit = function (next) {
    props.onChange(formatStack(next));
  };

  var moveChip = function (from, to) {
    if (from === to || from < 0 || to < 0 || from >= families.length || to >= families.length) {
      return;
    }
    var next = families.slice();
    var moved = next.splice(from, 1)[0];
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    commit(next);
  };

  var toggle = function (name) {
    if (single) {
      props.onPick(name);
      setOpen(false);
      return;
    }
    var lower = name.toLowerCase();
    var existing = -1;
    for (var index = 0; index < families.length; index += 1) {
      if (families[index].toLowerCase() === lower) existing = index;
    }
    if (existing >= 0) {
      commit(
        families.filter(function (_, index) {
          return index !== existing;
        })
      );
      return;
    }
    commit(families.concat([name]));
  };

  var selectedLower = {};
  if (single) {
    if (typeof props.value === "string" && props.value !== "") {
      selectedLower[props.value.toLowerCase()] = true;
    }
  } else {
    for (var selectedIndex = 0; selectedIndex < families.length; selectedIndex += 1) {
      selectedLower[families[selectedIndex].toLowerCase()] = true;
    }
  }
  // The grouping itself is pure and lives in the shared core, where it is
  // covered without a browser: which rows appear, in which order, and never
  // twice.
  var options = shared.pickerGroups({
    stack: families,
    single: single,
    query: query,
    catalog: catalog,
  });

  var typed = query.trim();
  var typedKnown = false;
  if (typed !== "") {
    for (var optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
      for (var nameIndex = 0; nameIndex < options[optionIndex].families.length; nameIndex += 1) {
        if (options[optionIndex].families[nameIndex].toLowerCase() === typed.toLowerCase()) {
          typedKnown = true;
        }
      }
    }
  }

  var panel = null;
  if (open) {
    var rows = [];
    for (var groupRender = 0; groupRender < options.length; groupRender += 1) {
      var group = options[groupRender];
      rows.push(h("div", { className: "dfp-group", key: "g:" + group.label }, t(group.label)));
      for (var rowIndex = 0; rowIndex < group.families.length; rowIndex += 1) {
        var name = group.families[rowIndex];
        var isSelected = selectedLower[name.toLowerCase()] === true;
        rows.push(
          h(
            "button",
            {
              type: "button",
              className: "dfp-option",
              key: "o:" + group.label + ":" + name,
              style: { fontFamily: quoteFamily(name) },
              "data-family": name,
              onClick: function (event) {
                toggle(event.currentTarget.dataset.family);
              },
            },
            h("span", { className: "dfp-optionLabel" }, name),
            isSelected ? h("span", { className: "dfp-optionCheck" }, "✓") : null
          )
        );
      }
    }
    if (typed !== "" && !typedKnown) {
      rows.push(
        h(
          "button",
          {
            type: "button",
            className: "dfp-option",
            key: "custom",
            onClick: function () {
              if (single) {
                props.onPick(typed);
                setOpen(false);
              } else {
                commit(families.concat([typed]));
              }
              setQuery("");
            },
          },
          h("span", { className: "dfp-optionLabel" }, t("stack.custom", { name: typed }))
        )
      );
    }
    if (rows.length === 0) {
      rows.push(h("div", { className: "dfp-note", key: "none" }, t("stack.empty")));
    }
    var notes = [];
    if (catalog.status === "loading") notes.push(t("stack.loading"));
    if (catalog.status === "denied") notes.push(t("stack.denied"));
    if (catalog.status === "unsupported") notes.push(t("stack.unsupported"));

    panel = createPortal(
      h(
        "div",
        {
          className: "dfp-panel",
          ref: panelRef,
          role: "listbox",
          "aria-multiselectable": single ? "false" : "true",
          "aria-label": props.label,
          style: position === null ? undefined : { left: position.left, top: position.top },
        },
        h("input", {
          type: "search",
          className: "dfp-search",
          "aria-label": t("stack.search"),
          placeholder: t("stack.search"),
          spellCheck: false,
          value: query,
          onChange: function (event) {
            setQuery(event.target.value);
          },
        }),
        notes.length > 0
          ? h(
              "div",
              { className: "dfp-note" },
              notes.map(function (note, index) {
                return h("div", { key: index }, note);
              })
            )
          : null,
        h("div", { className: "dfp-list" }, rows),
        h(
          "div",
          { className: "dfp-footerRow" },
          h(
            "button",
            {
              type: "button",
              className: "dfp-add",
              onClick: function () {
                setOpen(false);
              },
            },
            t("stack.done")
          )
        )
      ),
      document.body
    );
  }

  var chips = families.map(function (name, index) {
    return h(
      "span",
      {
        className:
          "dfp-chip" +
          (dragIndex === index ? " dfp-chipDragging" : "") +
          (dropIndex === index && dragIndex !== index ? " dfp-chipDrop" : ""),
        key: name + ":" + index,
        draggable: true,
        title: t("stack.drag", { name: name }),
        onDragStart: function (event) {
          setDragIndex(index);
          try {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", name);
          } catch (error) {
            // Some environments refuse dataTransfer writes; the drag still works.
          }
        },
        onDragOver: function (event) {
          event.preventDefault();
          setDropIndex(index);
        },
        onDrop: function (event) {
          event.preventDefault();
          moveChip(dragIndex, index);
          setDragIndex(-1);
          setDropIndex(-1);
        },
        onDragEnd: function () {
          setDragIndex(-1);
          setDropIndex(-1);
        },
      },
      h("span", { className: "dfp-grip", "aria-hidden": "true" }, "⠿"),
      h("span", { className: "dfp-chipLabel", style: { fontFamily: quoteFamily(name) } }, name),
      h(
        "button",
        {
          type: "button",
          className: "dfp-chipButton",
          "aria-label": t("stack.earlier", { name: name }),
          disabled: index === 0,
          onClick: function () {
            moveChip(index, index - 1);
          },
        },
        "‹"
      ),
      h(
        "button",
        {
          type: "button",
          className: "dfp-chipButton",
          "aria-label": t("stack.later", { name: name }),
          disabled: index === families.length - 1,
          onClick: function () {
            moveChip(index, index + 1);
          },
        },
        "›"
      ),
      h(
        "button",
        {
          type: "button",
          className: "dfp-chipButton",
          "aria-label": t("stack.remove", { name: name }),
          onClick: function () {
            commit(
              families.filter(function (_, current) {
                return current !== index;
              })
            );
          },
        },
        "×"
      )
    );
  });

  if (single) {
    var hasValue = typeof props.value === "string" && props.value !== "";
    return h(
      "span",
      { className: "dfp-splitRow" },
      h(
        "span",
        { ref: anchorRef },
        h(
          "button",
          {
            type: "button",
            className: "dfp-pick" + (hasValue ? "" : " dfp-pickEmpty"),
            "aria-haspopup": "listbox",
            "aria-expanded": open,
            disabled: props.disabled === true,
            onClick: function () {
              setQuery("");
              setOpen(!open);
            },
          },
          h(
            "span",
            {
              className: "dfp-chipLabel",
              style: hasValue ? { fontFamily: quoteFamily(props.value) } : undefined,
            },
            hasValue ? props.value : t("split.pick")
          )
        )
      ),
      hasValue
        ? h(
            "button",
            {
              type: "button",
              className: "dfp-chipButton",
              "aria-label": t("split.remove", { name: props.value }),
              disabled: props.disabled === true,
              onClick: props.onRemove,
            },
            "×"
          )
        : null,
      panel
    );
  }

  return h(
    "div",
    null,
    h(
      "div",
      { className: "dfp-chips" },
      families.length === 0 ? h("span", { className: "dfp-empty" }, t("stack.empty")) : null,
      chips,
      h(
        "span",
        { ref: anchorRef },
        h(
          "button",
          {
            type: "button",
            className: "dfp-add",
            "aria-expanded": open,
            "aria-haspopup": "listbox",
            onClick: function () {
              setQuery("");
              setOpen(!open);
            },
          },
          plusIcon(),
          h("span", null, t("stack.add"))
        )
      )
    ),
    families.length > 1 ? h("p", { className: "dfp-hint" }, t("stack.hintOrder")) : null,
    panel
  );
}

/* ------------------------------------------------------------------ *
 * card helpers
 * ------------------------------------------------------------------ */

/** localStorage key of the card's view mode. */
var MODE_KEY = "dsh-fonttune.mode.v1";

/**
 * The five built-in preset slots, shown (and exported) until any preset has
 * been saved. They are data, not copy: the names stay as-is in every locale
 * and can be changed with the rename control.
 */
var DEFAULT_PRESET_NAMES = [
  "默认配置1",
  "默认配置2",
  "默认配置3",
  "默认配置4",
  "默认配置5",
];

/**
 * Read the view mode the card opens in. Simple is the default; an unreadable
 * or missing storage (tests, private modes) must not break the card.
 * @returns {"simple"|"advanced"} the persisted mode.
 */
function readViewMode() {
  try {
    if (globalThis.localStorage.getItem(MODE_KEY) === "advanced") return "advanced";
  } catch (error) {
    // Storage unavailable: the default view stands.
  }
  return "simple";
}

/**
 * Derive the simple mode's two slots from one stack: the front non-CJK entry
 * is the western slot, the first CJK entry is the eastern slot, and everything
 * else is reported untouched so a tuned order stays visible.
 * @param {string} value - the CSS stack value.
 * @returns {{west: string|null, east: string|null, rest: string[]}} the slots.
 */
function deriveSlots(value) {
  var families = parseStack(value);
  var west = null;
  var east = null;
  var rest = [];
  for (var index = 0; index < families.length; index += 1) {
    var name = families[index];
    if (classifyFamily(name)) {
      if (east === null) east = name;
      else rest.push(name);
    } else if (west === null) west = name;
    else rest.push(name);
  }
  return { west: west, east: east, rest: rest };
}

/**
 * One family axis in the simple mode: the western slot and the CJK slot as
 * two single-pick triggers, plus a hint naming the untouched remainder.
 * @param {object} props - copy, the derived slots, handlers, disabled flag.
 * @returns {object} the field element.
 */
function SimpleFamilyField(props) {
  var t = props.t;
  var slots = props.slots;
  return h(
    "div",
    { className: "dfp-field" },
    h(
      "div",
      { className: "dfp-fieldHead" },
      h("span", { className: "dfp-fieldLabel" }, props.label)
    ),
    h("p", { className: "dfp-hint" }, t("mode.simpleHint")),
    h(
      "div",
      { className: "dfp-slotRow" },
      h("span", { className: "dfp-slotLabel" }, t(props.westLabel)),
      h(StackPicker, {
        t: t,
        label: t(props.westLabel),
        single: true,
        value: slots.west,
        disabled: props.disabled,
        onPick: props.onPickWest,
        onRemove: props.onRemoveWest,
      })
    ),
    h(
      "div",
      { className: "dfp-slotRow" },
      h("span", { className: "dfp-slotLabel" }, t(props.eastLabel)),
      h(StackPicker, {
        t: t,
        label: t(props.eastLabel),
        single: true,
        value: slots.east,
        disabled: props.disabled,
        onPick: props.onPickEast,
        onRemove: props.onRemoveEast,
      })
    ),
    slots.rest.length > 0
      ? h("p", { className: "dfp-hint" }, t("split.rest", { names: slots.rest.join(", ") }))
      : null
  );
}

/**
 * Summarize one axis set into the short texts the collapsed sections show.
 * @param {object} axis - the effective (follow-applied) value set.
 * @param {boolean} uiFollows - whether the interface follows the conversation.
 * @param {(key: string, params?: object) => string} t - translate seat.
 * @returns {{ui: string, dialog: string, code: string}}
 * @param {(field: string, value: number) => number} [weightCount] - turns a
 *   stored weight offset into the number of font steps the sliders show, so a
 *   collapsed section reads "+2" exactly like the open slider does.
 */
function sectionSummaries(axis, uiFollows, t, weightCount) {
  var sign = function (value) {
    return value > 0 ? "+" + value : String(value);
  };
  var weight = function (field, value) {
    return typeof weightCount === "function"
      ? weightOffsetText(weightCount(field, value))
      : weightOffsetText(value);
  };
  // The conversation owns every axis, so its summary is always its values.
  var dialogParts = [];
  if (axis[STACK_DIALOG_FIELD] !== "") dialogParts.push(firstFamily(axis[STACK_DIALOG_FIELD]));
  if (axis[SIZE_DIALOG_FIELD] !== 0) dialogParts.push(sign(axis[SIZE_DIALOG_FIELD]) + "px");
  if (axis[LINE_HEIGHT_DIALOG_FIELD] !== LINE_HEIGHT_MIN) {
    dialogParts.push(axis[LINE_HEIGHT_DIALOG_FIELD] + "%");
  }
  if (axis[WEIGHT_DIALOG_FIELD] !== WEIGHT_UNSET) {
    dialogParts.push(weight(WEIGHT_DIALOG_FIELD, axis[WEIGHT_DIALOG_FIELD]));
  }
  // The interface either follows (nothing of its own to report) or shows the
  // two axes it owns.
  var uiParts = [];
  if (!uiFollows) {
    var family = axis[SANS_FIELD] === "" ? null : firstFamily(axis[SANS_FIELD]);
    if (family !== null) uiParts.push(family);
    if (axis[WEIGHT_FIELD] !== WEIGHT_UNSET) uiParts.push(weight(WEIGHT_FIELD, axis[WEIGHT_FIELD]));
  }
  var codeParts = [];
  if (axis[MONO_FIELD] !== "") codeParts.push(firstFamily(axis[MONO_FIELD]));
  if (axis[CODE_SIZE_FIELD] !== 0) codeParts.push(sign(axis[CODE_SIZE_FIELD]) + "px");
  if (axis[CODE_LINE_HEIGHT_FIELD] !== 0) codeParts.push(sign(axis[CODE_LINE_HEIGHT_FIELD]) + "px");
  if (axis[CODE_WEIGHT_FIELD] !== WEIGHT_UNSET) {
    codeParts.push(weight(CODE_WEIGHT_FIELD, axis[CODE_WEIGHT_FIELD]));
  }
  if (axis[LIGATURES_FIELD] !== LIGATURES_DEFAULT) {
    codeParts.push(t(axis[LIGATURES_FIELD] === LIGATURES_OFF ? "lig.off" : "lig.on"));
  }
  return {
    ui: uiFollows ? t("ui.follow") : uiParts.length > 0 ? uiParts.join(" · ") : t("ui.own"),
    dialog: dialogParts.length > 0 ? dialogParts.join(" · ") : t("dialog.default"),
    code: codeParts.join(" · "),
  };
}

/** The first family of one stack value, or null. */
function firstFamily(stack) {
  var families = parseStack(stack);
  return families.length > 0 ? families[0] : null;
}

/**
 * One boolean axis as an on/off segmented row.
 * @param {object} props - copy, value, hints, state and handlers.
 * @returns {object} the field element.
 */
function SwitchField(props) {
  return h(
    FieldShell,
    {
      t: props.t,
      label: props.label,
      hint: props.hint,
      overridden: props.overridden,
      disabled: props.disabled,
      onReset: props.onReset,
      inline: true,
    },
    h(Segmented, {
      label: props.label,
      value: props.value ? "on" : "off",
      disabled: props.disabled,
      options: [
        { value: "on", label: props.t("common.on") },
        { value: "off", label: props.t("common.off") },
      ],
      onChange: function (next) {
        props.onChange(next === "on");
      },
    })
  );
}

/* ------------------------------------------------------------------ *
 * the card
 * ------------------------------------------------------------------ */

/**
 * The card as DSH 0.1.7-alpha.x's Plugins page renders it.
 *
 * That page contributes one entry per plugin (`plugins.item`) and asks that one
 * component for two different views: a one-line `summary` for the card in the
 * list, and the `page` body once the entry is opened. The summary is answered
 * with the card's own description, and every other view is the card itself, so
 * the same UI serves the rc line's configuration cell and the alpha's plugin
 * page without a second implementation.
 * @param {object} props - the view asked for plus the injected face.
 * @returns {object|string} the card, or the one-line summary.
 */
function FontCardPage(props) {
  var t = typeof props.t === "function" ? props.t : cardT || fallbackTranslate;
  if (props.view === "summary") return t("card.description");
  // Every other view is the card as the content of a section the reader has
  // already opened, so it starts open: the row/entry they clicked IS the
  // expansion gesture, and asking for a second click on the card's own header
  // was the one thing left to remove on the official plugin page.
  return h(FontCard, {
    scope: props.scope || cardScope || MEMORY_SCOPE,
    t: t,
    defaultOpen: props.view !== "row",
  });
}

/**
 * Render the plugin's card: the settings section dispatches this component
 * under the namespace key, and the host has to serve that namespace for it to
 * appear at all.
 *
 * Structure: a top bar (edit mode), the preset bar (dropdown select +
 * rename/import/export — with a preset selected every edit auto-saves into
 * it), and four collapsed accordion sections — conversation / interface /
 * code / global fine-tuning. Only one section is open at a time, so the card
 * never sprawls; the interface section leads with the follow switch, and an
 * expanded section ends with its own inline preview of just that part. Light
 * and dark themes share one value set (the per-theme editor ships in a later
 * release).
 * @param {object} props - slot props (the injected face plus the locale seat).
 * @returns {object} the card element.
 */
function FontCard(props) {
  // The registration hands the card its face on the line that supports
  // `inject`; the alpha's bundle page renders it with its own props, so the
  // values `apply` bound are the fallback.
  var t = typeof props.t === "function" ? props.t : cardT || fallbackTranslate;
  var scope = props.scope || cardScope || MEMORY_SCOPE;
  // The official plugin page (0.1.7: `view: "page"`) and the rc line's
  // configuration cell (which passes no props at all) both render this card as
  // the whole body of a section the reader has ALREADY opened — the host's own
  // row is the expansion gesture there, so starting collapsed asked for a
  // second click. The card therefore starts open unless the seat says
  // otherwise (`defaultOpen: false`), and `FontCardPage` answers a one-line
  // summary request with its description instead of the card.
  var [open, setOpen] = useState(props.defaultOpen !== false);
  var [view, setView] = useState(readViewMode);
  var [expanded, setExpanded] = useState(null);
  var [presetName, setPresetName] = useState("");
  // The transient preset message: `{text, id}` — the id makes two identical
  // messages (two exports in a row) two distinct events, so the auto-hide
  // effect runs again instead of ignoring the second one.
  var [presetStatus, setPresetStatus] = useState({ text: "", id: 0 });
  var [statusShown, setStatusShown] = useState(false);
  /** The exported JSON when the clipboard refused it: shown selected instead. */
  var [exportText, setExportText] = useState("");
  var [renaming, setRenaming] = useState(false);
  var [importOpen, setImportOpen] = useState(false);
  /** True while the card itself writes a whole preset's values: the edits
   * must not mirror back into the very preset being applied. */
  var applyingRef = useRef(false);
  /**
   * Per field, how many times the host has refused a write for it.
   *
   * A counter rather than a flag so a control can tell one refusal from the next;
   * see `refuseField`. This is what makes "give the user's value back" a result and
   * not a guess about how long a healthy write may take.
   */
  var [refused, setRefused] = useState({});
  /** The pending auto-hide / fade-out timers of the preset message. */
  var statusIdRef = useRef(0);
  var statusTimerRef = useRef(null);
  var snapshot = useScopeSnapshot(scope);
  var config = normalizeConfig(snapshot.value);
  // Light and dark share one value set in this release: the stored flag (if
  // any) is ignored and the dark fields stay dormant in the document.
  config[PER_THEME_FIELD] = false;
  var sets = resolveAxes(config);
  var user = snapshot.user !== null && typeof snapshot.user === "object" ? snapshot.user : {};
  var writable = snapshot.writable === true;
  var presets = config[PRESETS_FIELD];

  // The preset list the dropdown shows: the stored entries once anything has
  // been saved, otherwise the five built-in slots. `activePreset` falls back
  // to the first entry when unset or stale.
  var presetList =
    presets.length > 0
      ? presets
      : DEFAULT_PRESET_NAMES.map(function (name) {
          return { name: name, values: {}, savedAt: 0 };
        });
  var activeName = config[ACTIVE_PRESET_FIELD];
  var activeKnown = false;
  for (var presetIndex = 0; presetIndex < presetList.length; presetIndex += 1) {
    if (presetList[presetIndex].name === activeName) activeKnown = true;
  }
  if (!activeKnown) activeName = presetList[0].name;

  // Which value set the controls below edit and display: light and dark share
  // one set, so it is always the light (flat) fields.
  var editing = sets.light;

  var changeView = function (next) {
    setView(next);
    try {
      globalThis.localStorage.setItem(MODE_KEY, next);
    } catch (error) {
      // Unavailable storage only costs the persistence of the preference.
    }
  };

  /**
   * Mirror one axis value into the active preset's snapshot — the auto-save
   * contract: with a preset selected, every change the user makes IS that preset
   * from now on. Skipped while the card itself applies a whole preset.
   *
   * Only the INTENT is recorded here. The snapshot itself is built when the batch
   * is sent (`presetSnapshotOp`), so a burst of clicks stores the values the user
   * stopped on, and a write that would only move `savedAt` is not made at all.
   * @param {string} field - an axis field name.
   * @param {string|number|boolean} value - the value to store.
   */
  var mirrorPreset = function (field, value) {
    // Chrome (the floating panel's switch and position) never rides a preset:
    // switching presets must not hide or move the panel.
    if (VALUE_FIELDS.indexOf(field) < 0) return;
    if (!writable || applyingRef.current === true) {
      probeLog("mirror-skipped", { field: field, writable: writable, applying: applyingRef.current });
      return;
    }
    if (activePresetEntry() === undefined) {
      probeLog("mirror-no-preset", { field: field, activeName: activeName, presets: presetList.length });
      return;
    }
    pendingPresetValues[field] = { op: shared.PENDING_SET, value: value };
    if (pendingPreset === null) pendingPreset = { kind: "mirror" };
    scheduleFlush();
  };

  /**
   * Write one axis field to the durable flat fields, and mirror the same
   * change into the active preset (the auto-save contract).
   * @param {string} field - an axis field name.
   * @param {string|number|boolean} value - the new value.
   */
  var setField = function (field, value) {
    submit(field, value);
    mirrorPreset(field, value);
  };
  var resetField = function (field) {
    clear(field);
    mirrorPreset(field, DEFAULTS[field]);
  };
  /**
   * Report a write the settings document refused. A silent failure is the
   * worst outcome here: the control goes back to showing the stored value and
   * the user is left believing the change was saved.
   * @param {unknown} error - the rejection reason, or a boolean refusal.
   */
  var writeFailed = function (error) {
    var message =
      error === false || error === undefined
        ? "the host refused the write"
        : error && error.message
          ? String(error.message)
          : String(error);
    if (message.length > 160) message = message.slice(0, 160) + "…";
    showStatus(t("preset.writeFailed", { message: message }));
  };
  /**
   * Mark the controls a refused write belonged to, so each gives the user's value
   * back and says so.
   *
   * A refusal is the one moment a local paint is provably wrong: the host looked at
   * the patch and answered "no", so no echo is coming. It is also the ONLY thing
   * allowed to take a value off the screen before the document echoes it — a write
   * that is merely still in flight must keep showing what the user chose.
   * @param {string[]} fields - the fields the refused write carried.
   */
  var refuseField = function (fields) {
    setRefused(function (previous) {
      var next = {};
      for (var key in previous) {
        if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key];
      }
      for (var index = 0; index < fields.length; index += 1) {
        // A token, not a timestamp: two refusals inside one millisecond must still
        // be two changes, or the control would ignore the second one.
        next[fields[index]] = (previous[fields[index]] || 0) + 1;
      }
      return next;
    });
  };
  /**
   * Follow one queued settings write.
   *
   * The two host lines answer differently: up to 0.1.5-rc.x the scope resolves
   * a promise that rejects on a transport failure, while 0.1.7-alpha.x resolves
   * `false` for a write the host refused (a stale revision, say). Both are
   * reported, and a refused write is never left looking saved.
   * @param {string[]} fields - the fields this write carried.
   * @param {unknown} result - what the scope returned.
   * @param {(applied: boolean) => void} [onSettled] - called once with the verdict.
   */
  var followWrite = function (fields, result, onSettled) {
    var done = function (applied, error) {
      if (applied === false) {
        refuseField(fields);
        writeFailed(error);
      }
      if (typeof onSettled === "function") onSettled(applied);
    };
    if (result === false) {
      done(false, result);
      return;
    }
    if (result && typeof result.then === "function") {
      result.then(function (accepted) {
        done(accepted !== false, accepted);
      }, function (error) {
        // The scope reloads the Host state itself; the status row is what
        // keeps the user from thinking the change stuck.
        done(false, error);
      });
      return;
    }
    if (result && typeof result.catch === "function") {
      result.catch(function (error) {
        writeFailed(error);
      });
    }
    done(true);
  };
  /**
   * Our own writes: one batch in flight, newest value per field.
   *
   * Two measured facts shape this. A settings call is expensive — the host answers
   * one by rewriting the whole profile document and re-applying the whole patch list
   * to the loader, 1.0-5.14 s per call and one document write each — so a click must
   * not spend two of them, and a burst of clicks must not spend one per click. And
   * DSH validates a patch against the revision it was built from, so patches that
   * overlap in flight can be refused as stale or land out of order.
   *
   * Hence: intents are collected per field (the newest wins), everything one turn
   * produced goes out as ONE call, and the next call waits for this one's answer.
   */
  var pendingOps = {};
  /** The order fields were touched in, so a batch keeps a stable order. */
  var pendingOrder = [];
  /** The preset snapshot the pending axis values imply; `null` when none is due. */
  var pendingPreset = null;
  /** The axis values the pending preset snapshot must end up holding. */
  var pendingPresetValues = {};
  /** One call at a time: a batch that arrives while one is in flight waits. */
  var writing = false;
  /** The quiet window's timer; null when no window is armed. */
  var flushTimer = null;
  /**
   * Stop painting a local move once its fate is known.
   * @param {string} field - the field the patch was for.
   */
  var retireLocalMove = function (field) {
    delete pendingLocalValues[field];
  };
  /**
   * The preset entry the axis edits mirror into, if there is one.
   * @returns {{name: string, values: object}|undefined}
   */
  var activePresetEntry = function () {
    for (var index = 0; index < presetList.length; index += 1) {
      if (presetList[index].name === activeName) return presetList[index];
    }
    return undefined;
  };
  /**
   * The preset snapshot the pending axis values imply, as one op — or `null` when
   * there is nothing to store.
   *
   * The snapshot is derived HERE rather than where the click happened, because a
   * burst is one write: what must land is the snapshot the LAST value implies, not
   * the one the first click saw. `savedAt` alone never justifies a write — that is
   * why the stored values are compared before one is built.
   * @returns {{op: string, path: string[], value: unknown}|null}
   */
  var presetSnapshotOp = function () {
    if (pendingPreset === null) return null;
    if (pendingPreset.kind === "json") {
      // An explicit list (save, delete, import, migration) is the user's own edit
      // and wins over the mirror.
      probeLog("preset-op", { kind: "json" });
      return { op: shared.PENDING_SET, path: [PRESETS_FIELD], value: pendingPreset.value };
    }
    var entry = activePresetEntry();
    if (entry === undefined) {
      probeLog("preset-op", { kind: "mirror", why: "no active entry" });
      return null;
    }
    var values = {};
    var key;
    for (key in entry.values) {
      if (Object.prototype.hasOwnProperty.call(entry.values, key)) values[key] = entry.values[key];
    }
    var changed = false;
    for (key in pendingPresetValues) {
      if (!Object.prototype.hasOwnProperty.call(pendingPresetValues, key)) continue;
      var move = pendingPresetValues[key];
      if (move.op === shared.PENDING_UNSET) {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          delete values[key];
          changed = true;
        }
        continue;
      }
      if (values[key] !== move.value) {
        values[key] = move.value;
        changed = true;
      }
    }
    // Nothing moved: the only difference would be the `savedAt` timestamp, and a
    // whole-document rewrite for a timestamp is a write nobody asked for.
    if (!changed) {
      probeLog("preset-op", { kind: "mirror", why: "unchanged", values: values });
      return null;
    }
    var next = presetList.slice();
    for (var index = 0; index < next.length; index += 1) {
      if (next[index].name === entry.name) {
        next[index] = { name: entry.name, values: values, savedAt: Date.now() };
      }
    }
    return { op: shared.PENDING_SET, path: [PRESETS_FIELD], value: JSON.stringify(next) };
  };
  /**
   * Everything one flush must write, as ordered settings ops.
   * @returns {{op: string, path: string[], value?: unknown}[]}
   */
  var collectOps = function () {    var ops = [];
    for (var index = 0; index < pendingOrder.length; index += 1) {
      var field = pendingOrder[index];
      if (field === PRESETS_FIELD) continue; // always rebuilt from the newest axes
      var patch = pendingOps[field];
      if (patch === undefined) continue;
      ops.push({ op: patch.op, path: [field], value: patch.value });
    }
    var snapshot = presetSnapshotOp();
    if (snapshot !== null) ops.push(snapshot);
    probeLog("batch", {
      ops: ops.map(function (op) {
        return op.path[0] + "=" + String(op.value).slice(0, 24);
      }),
      preset: pendingPreset === null ? "none" : pendingPreset.kind,
    });
    return ops;
  };
  /**
   * Send one batch, through `mutate` when the running host offers it.
   *
   * 0.1.7-alpha.x's config form exposes `mutate(ops)`, which the host applies as ONE
   * patch — that is what lets the axis value and the preset snapshot that mirrors it
   * share a single document write. A host whose scope only takes one field at a time
   * still works: the batch is written field by field there and the last verdict is
   * the batch's.
   * @param {{op: string, path: string[], value?: unknown}[]} ops - the batch.
   * @param {(applied: boolean) => void} done - called once with the verdict.
   */
  var sendOps = function (ops, done) {
    var fields = [];
    for (var index = 0; index < ops.length; index += 1) {
      if (ops[index].path[0] !== PRESETS_FIELD) fields.push(ops[index].path[0]);
    }
    var canBatch =
      typeof scope.canMutate === "function" ? scope.canMutate() : typeof scope.mutate === "function";
    if (canBatch) {
      var batch = null;
      try {
        batch = scope.mutate(ops);
      } catch (error) {
        writeFailed(error);
        done(false);
        return;
      }
      followWrite(fields, batch, done);
      return;
    }
    var at = 0;
    var step = function () {
      if (at >= ops.length) {
        done(true);
        return;
      }
      var op = ops[at];
      at += 1;
      var single = null;
      try {
        single = op.op === shared.PENDING_UNSET ? scope.unset(op.path[0]) : scope.set(op.path[0], op.value);
      } catch (error) {
        writeFailed(error);
        done(false);
        return;
      }
      followWrite(op.path[0] === PRESETS_FIELD ? fields : [op.path[0]], single, function (applied) {
        if (applied === false) {
          done(false);
          return;
        }
        step();
      });
    };
    step();
  };
  /** Send what is pending, if the previous batch has been answered. */
  var flushWrites = function () {
    if (writing) return;
    var ops = collectOps();
    if (ops.length === 0) return;
    var sent = [];
    for (var index = 0; index < pendingOrder.length; index += 1) {
      if (pendingOrder[index] !== PRESETS_FIELD) sent.push(pendingOrder[index]);
    }
    pendingOps = {};
    pendingOrder = [];
    pendingPreset = null;
    pendingPresetValues = {};
    // A local move that is now on the wire is not re-painted from the document: the
    // overlay keeps the user's value until the echo arrives.
    writing = true;
    var settled = false;
    var watchdog = globalThis.setTimeout(function () {
      // Nothing came back at all. Release the queue for later clicks; the control
      // yields to the document through its own fallback, not through this.
      finish(true);
    }, WRITE_SETTLE_TIMEOUT_MS);
    var finish = function (applied) {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(watchdog);
      writing = false;
      if (applied === false) {
        for (var at = 0; at < sent.length; at += 1) retireLocalMove(sent[at]);
      }
      // What arrived while this one was in flight is the next batch — but only once
      // the user has stopped: while a quiet window is armed IT decides, so a burst
      // that straddles two writes still ends on one write carrying its last value.
      if (flushTimer === null && hasPending()) flushWrites();
    };
    sendOps(ops, finish);
  };
  /** Whether anything is waiting to be written. */
  var hasPending = function () {
    return pendingOrder.length > 0 || pendingPreset !== null;
  };
  /**
   * Wait for the user to stop, then write everything they did as ONE patch.
   *
   * Every queued move re-arms the window, so a run of clicks — on one control or
   * across several — leaves exactly one settings call behind, holding the value the
   * user stopped on. That is what takes the last of the jumping out: the document
   * used to take on the first click's value and every intermediate one, and each of
   * those states echoed back into the page.
   *
   * The window is short enough to stay invisible (the page already shows the change
   * the moment the user lets go — see `rememberLocalMove`) and long enough to span a
   * person clicking faster than they can read the number. What it costs is covered
   * by `flushPendingWrites`: a page that goes away inside the window.
   */
  var scheduleFlush = function () {
    if (flushTimer !== null) globalThis.clearTimeout(flushTimer);
    flushTimer = globalThis.setTimeout(function () {
      flushTimer = null;
      flushWrites();
    }, WRITE_QUIET_MS);
  };
  /** Write what is pending right now, whatever the window says. */
  var flushPendingWrites = function () {
    if (flushTimer !== null) {
      globalThis.clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushWrites();
  };
  /**
   * Record one move: paint it now, write it with the next batch.
   * @param {string} field - a settings field name.
   * @param {string} op - `PENDING_SET` or `PENDING_UNSET`.
   * @param {string|number|boolean} value - the value to paint and send.
   */
  var queuePatch = function (field, op, value) {
    rememberLocalMove(field, op, value);
    if (pendingOps[field] === undefined) pendingOrder.push(field);
    pendingOps[field] = { op: op, value: value };
    scheduleFlush();
  };
  var submit = function (field, value) {
    queuePatch(field, shared.PENDING_SET, value);
  };
  var clear = function (field) {
    queuePatch(field, shared.PENDING_UNSET, undefined);
  };
  /** The frame handle for the next local paint; null when no paint is scheduled. */
  var paintFrame = null;
  /** The backstop timer for that paint; null when none is armed. */
  var paintBackstop = null;
  /**
   * Paint one move locally, right now.
   *
   * This is what makes a click land immediately: the settings document only echoes
   * the value after the host itself has taken a whole write (measured 1.0-5.1 s),
   * and until that echo arrives the page would keep showing the previous value —
   * clicking through several notches then stalls once per notch, each stall as long
   * as the write took.
   *
   * The paint is deferred to the next frame, so several moves inside one frame paint
   * once (the latest wins) instead of once per move. It carries a timer as well
   * because a frame the browser never produces (a throttled or backgrounded tab)
   * would otherwise take the paint with it — and leave the handle set, which skips
   * every LATER move too, on a page that looks like it stopped following.
   * @param {string} field - a settings field name.
   * @param {string} op - `PENDING_SET` or `PENDING_UNSET`.
   * @param {string|number|boolean} value - the value to paint.
   */
  var rememberLocalMove = function (field, op, value) {
    // A snapshot or a selection is not a value the stylesheet can show, so it is
    // never painted over the document's own.
    if (field === PRESETS_FIELD || field === ACTIVE_PRESET_FIELD) return;
    // A re-assert of the SAME value keeps its counter; a fresh choice starts over.
    var previous = pendingLocalValues[field];
    var same = previous !== undefined && previous.op === op && previous.value === value;
    pendingLocalValues[field] = {
      op: op,
      value: value,
      at: Date.now(),
      tries: same ? previous.tries || 0 : 0,
    };
    if (paintFrame !== null || typeof globalThis.requestAnimationFrame !== "function") {
      probeLog("remember-skipped", {
        field: field,
        value: value,
        pendingFrame: paintFrame !== null,
        hasRaf: typeof globalThis.requestAnimationFrame === "function",
      });
      return;
    }
    var done = false;
    var paintNow = function (why) {
      if (done) return;
      done = true;
      paintFrame = null;
      if (paintBackstop !== null) {
        globalThis.clearTimeout(paintBackstop);
        paintBackstop = null;
      }
      probeLog("paint", { field: field, why: why, painter: typeof repaint === "function" });
      if (typeof repaint === "function") repaint();
    };
    paintFrame = globalThis.requestAnimationFrame(function () {
      paintNow("frame");
    });
    paintBackstop = globalThis.setTimeout(function () {
      paintNow("backstop");
    }, PAINT_BACKSTOP_MS);
  };
  var overridden = function (field) {
    return Object.prototype.hasOwnProperty.call(user, field);
  };
  /**
   * The queue as the LAST render saw it, for listeners that outlive that render.
   *
   * Everything this card queues lives in render-scoped bindings (`flushTimer`,
   * `pendingOps`, `pendingOrder`), and a function component gets a fresh set of them
   * on every render. The listeners below are registered once, by the render that
   * mounted the card, so their `flushPendingWrites` reads the queue THAT render had
   * — which by the time a user has moved a control is the empty one it started with.
   * Measured: a move queued in render 2, `pagehide` at +91 ms flushed render 1's
   * empty queue, and the write only left at +306 ms when the window expired. The ref
   * is refreshed on every render, so the early close always closes the live window.
   */
  var flushRef = useRef(null);
  flushRef.current = flushPendingWrites;
  /**
   * Close the quiet window early whenever the page is about to stop being able to.
   *
   * Waiting for the user to stop is only safe if "the user stopped" cannot be
   * followed by "the page went away" before the window expires. Three moments cover
   * that: the settings sheet closing (this effect's cleanup), the page being hidden
   * (a tab switch, a minimise, most ways of leaving), and `pagehide` (navigation,
   * bfcache). What remains is a hard kill with no event at all, which no client-side
   * debounce can cover — the exposure is the window itself, a few hundred ms.
   */
  useEffect(function () {
    var closeWindow = function () {
      // Through the ref: this closure is the mount render's, the queue is not.
      if (typeof flushRef.current === "function") flushRef.current();
    };
    var onHidden = function () {
      if (document.visibilityState === "hidden") closeWindow();
    };
    globalThis.addEventListener("pagehide", closeWindow);
    document.addEventListener("visibilitychange", onHidden);
    return function () {
      globalThis.removeEventListener("pagehide", closeWindow);
      document.removeEventListener("visibilitychange", onHidden);
      closeWindow();
    };
  }, []);

  // ---- family stack handlers ----
  var pickWest = function (field, family) {
    setField(field, formatStack(setWestEntry(parseStack(editing[field]), family, classifyFamily)));
  };
  var pickEast = function (field, family) {
    setField(field, formatStack(setEastEntry(parseStack(editing[field]), family, classifyFamily)));
  };
  var dropEntry = function (field, family) {
    setField(field, formatStack(removeStackEntry(parseStack(editing[field]), family)));
  };

  // ---- size slider ----
  var sizeField = function (props) {
    return h(
      FieldShell,
      {
        t: t,
        label: t(props.labelKey),
        hint: t(props.hintKey, { offset: props.text }),
        overridden: overridden(props.field) && props.value !== 0,
        disabled: !writable,
        onReset: function () {
          resetField(props.field);
        },
      },
      h(NumberSlider, {
        min: SIZE_MIN,
        max: SIZE_MAX,
        value: props.value,
        disabled: !writable,
        label: t(props.labelKey),
        revertedText: t("write.reverted"),
        refusedToken: refused[props.field] || 0,
        readout: props.text + " " + t("size.unit"),
        minLabel: SIZE_MIN + " " + t("size.unit"),
        maxLabel: "+" + SIZE_MAX + " " + t("size.unit"),
        pendingText: function (value) {
          return (value > 0 ? "+" + value : String(value)) + " " + t("size.unit");
        },
        onChange: function (value) {
          setField(props.field, value);
        },
      })
    );
  };

  // ---- weight slider ----
  // All three weight axes share one shape: an offset added to each element's own
  // weight, centred on zero (code included — its surfaces ship their own weight
  // too, and an offset keeps any bold element inside them bold).
  //
  // The CONTROL counts the family's own steps ("-2 -1 0 +1 +2 +3 +4"), because a
  // family can only be made as light or as heavy as the faces it ships and only
  // in steps between them: how many positions there are is a property of the font,
  // measured on the page. The VALUE written to the document stays a weight offset,
  // so nothing stored before has to be migrated and the stylesheet is unchanged.
  var weightField = function (props) {
    var profile = weightProfileFor(
      props.stack === undefined ? "" : props.stack,
      props.top === undefined ? shared.WEIGHT_LADDER_STRONG : props.top
    );
    var stored = props.value === WEIGHT_UNSET ? NEUTRAL_WEIGHT : props.value;
    // A stored offset outside the measured range (the font changed since it was
    // set) widens the control, so it is never unreachable.
    var shape = weightStepRange(
      { min: Math.min(profile.min, stored), max: Math.max(profile.max, stored), step: profile.step },
      stored
    );
    var text = weightOffsetText;
    return h(
      FieldShell,
      {
        t: t,
        label: t(props.labelKey),
        hint: t(props.hintKey),
        overridden: overridden(props.field) && props.value !== WEIGHT_UNSET,
        disabled: !writable,
        onReset: function () {
          resetField(props.field);
        },
      },
      h(NumberSlider, {
        min: shape.min,
        max: shape.max,
        value: shape.value,
        disabled: !writable,
        label: t(props.labelKey),
        revertedText: t("write.reverted"),
        refusedToken: refused[props.field] || 0,
        // One notch is one family step, so every notch changes what is on screen.
        step: 1,
        // The readout is the STEP COUNT, not the weight: "+2" is two faces
        // bolder, and the numbers stay small whatever the family is.
        readout: text(shape.value),
        minLabel: text(shape.min),
        maxLabel: text(shape.max),
        // The pending readout goes through the same formatter: without it the
        // sign only appeared on release ("80" while dragging, then "+80" once
        // the document confirmed it).
        pendingText: text,
        onChange: function (count) {
          // Once per document, before anything is written on the new scale.
          adoptWeightScale();
          // The neutral position means "leave the axis alone" rather than "write
          // it on every element".
          if (count === 0) resetField(props.field);
          else setField(props.field, count * shape.unit);
        },
      })
    );
  };

  // ---- interface/dialog line-height slider (percent ratio) ----
  var lineField = function (props) {
    return h(
      FieldShell,
      {
        t: t,
        label: t(props.labelKey),
        hint: t(props.hintKey, { ratio: (props.value / LINE_HEIGHT_MIN).toFixed(2) + "×" }),
        overridden: overridden(props.field) && props.value !== LINE_HEIGHT_MIN,
        disabled: !writable,
        onReset: function () {
          resetField(props.field);
        },
      },
      h(NumberSlider, {
        min: LINE_HEIGHT_MIN,
        max: LINE_HEIGHT_MAX,
        step: 5,
        value: props.value,
        disabled: !writable,
        label: t(props.labelKey),
        revertedText: t("write.reverted"),
        refusedToken: refused[props.field] || 0,
        readout: props.value + " " + t("line.unit"),
        minLabel: LINE_HEIGHT_MIN + " " + t("line.unit"),
        maxLabel: LINE_HEIGHT_MAX + " " + t("line.unit"),
        // The unit rides the pending readout too: without it the "%" vanished
        // while dragging and popped back on release.
        pendingText: function (pending) {
          return pending + " " + t("line.unit");
        },
        onChange: function (value) {
          setField(props.field, value);
        },
      })
    );
  };

  // ---- code line-height slider (additive px) ----
  var codeLineField = function () {
    var value = editing[CODE_LINE_HEIGHT_FIELD];
    return h(
      FieldShell,
      {
        t: t,
        label: t("line.codeLabel"),
        hint: t("line.codeHint", { offset: value > 0 ? "+" + value : String(value) }),
        overridden: overridden(CODE_LINE_HEIGHT_FIELD) && value !== 0,
        disabled: !writable,
        onReset: function () {
          resetField(CODE_LINE_HEIGHT_FIELD);
        },
      },
      h(NumberSlider, {
        min: CODE_LINE_HEIGHT_MIN,
        max: CODE_LINE_HEIGHT_MAX,
        value: value,
        disabled: !writable,
        label: t("line.codeLabel"),
        revertedText: t("write.reverted"),
        refusedToken: refused[CODE_LINE_HEIGHT_FIELD] || 0,
        readout: (value > 0 ? "+" + value : String(value)) + "px",
        minLabel: CODE_LINE_HEIGHT_MIN + "px",
        maxLabel: "+" + CODE_LINE_HEIGHT_MAX + "px",
        pendingText: function (pending) {
          return (pending > 0 ? "+" + pending : String(pending)) + "px";
        },
        onChange: function (next) {
          setField(CODE_LINE_HEIGHT_FIELD, next);
        },
      })
    );
  };

  // ---- ligature segmented control ----
  var ligatureField = function () {
    var value = editing[LIGATURES_FIELD];
    return h(
      FieldShell,
      {
        t: t,
        label: t("lig.label"),
        hint: t("lig.hint"),
        overridden: overridden(LIGATURES_FIELD) && value !== LIGATURES_DEFAULT,
        disabled: !writable,
        onReset: function () {
          resetField(LIGATURES_FIELD);
        },
        inline: true,
      },
      h(Segmented, {
        label: t("lig.label"),
        value: value,
        options: [
          { value: LIGATURES_DEFAULT, label: t("lig.default") },
          { value: LIGATURES_ON, label: t("lig.on") },
          { value: LIGATURES_OFF, label: t("lig.off") },
        ],
        onChange: function (next) {
          setField(LIGATURES_FIELD, next);
        },
      })
    );
  };

  // ---- advanced feature-settings text field ----
  var featuresField = function () {
    var value = editing[FEATURES_FIELD];
    return h(
      FieldShell,
      {
        t: t,
        label: t("feat.label"),
        hint: t("feat.hint"),
        overridden: overridden(FEATURES_FIELD) && value !== "",
        disabled: !writable,
        onReset: function () {
          resetField(FEATURES_FIELD);
        },
      },
      h("input", {
        type: "text",
        className: "dfp-search",
        spellCheck: false,
        value: value,
        disabled: !writable,
        "aria-label": t("feat.label"),
        placeholder: t("feat.placeholder"),
        onChange: function (event) {
          setField(FEATURES_FIELD, event.target.value);
        },
      })
    );
  };

  // ---- text rendering preference ----
  var smoothingField = function () {
    var value =
      shared.SMOOTHING_VALUES.indexOf(editing[SMOOTHING_FIELD]) >= 0
        ? editing[SMOOTHING_FIELD]
        : SMOOTHING_AUTO;
    return h(
      FieldShell,
      {
        t: t,
        label: t("smoothing.label"),
        hint: t("smoothing.hint"),
        overridden: overridden(SMOOTHING_FIELD) && value !== SMOOTHING_AUTO,
        disabled: !writable,
        onReset: function () {
          resetField(SMOOTHING_FIELD);
        },
        inline: true,
      },
      h(Segmented, {
        label: t("smoothing.label"),
        value: value,
        options: [
          { value: SMOOTHING_AUTO, label: t("smoothing.auto") },
          { value: SMOOTHING_SHARP, label: t("smoothing.sharp") },
          { value: SMOOTHING_SMOOTH, label: t("smoothing.smooth") },
        ],
        onChange: function (next) {
          setField(SMOOTHING_FIELD, next);
        },
      })
    );
  };

  // ---- synthesis switches ----
  var synthesisField = function (props) {
    var value = editing[props.field] === true;
    return h(
      "div",
      { className: "dfp-field" },
      h(
        "div",
        { className: "dfp-fieldHead", role: "group", "aria-label": t(props.labelKey) },
        h("span", { className: "dfp-fieldLabel" }, t(props.labelKey)),
        h(
          "div",
          { className: "dfp-inline" },
          h(Segmented, {
            label: t(props.labelKey),
            value: value ? "on" : "off",
            options: [
              { value: "on", label: t("common.on") },
              { value: "off", label: t("common.off") },
            ],
            disabled: !writable,
            onChange: function (next) {
              if (next === "on") setField(props.field, true);
              else resetField(props.field);
            },
          })
        )
      ),
      h("p", { className: "dfp-hint" }, t(props.hintKey))
    );
  };

  // ---- presets ----
  /**
   * Show a transient preset message: it fades in on the same row as the
   * auto-save hint and fades out by itself after a moment, so it can never
   * pile up on screen and never pushes the sections below it down (the row it
   * lives in is always mounted, only its opacity changes).
   * @param {string} text - the message.
   */
  var showStatus = function (text) {
    statusIdRef.current += 1;
    setPresetStatus({ text: text, id: statusIdRef.current });
  };
  useEffect(
    function () {
      if (presetStatus.text === "") return undefined;
      setStatusShown(true);
      var hide = globalThis.setTimeout(function () {
        setStatusShown(false); // the CSS transition fades it out
        statusTimerRef.current = globalThis.setTimeout(function () {
          statusTimerRef.current = null;
          setPresetStatus({ text: "", id: statusIdRef.current });
        }, 240);
      }, 2600);
      return function () {
        globalThis.clearTimeout(hide);
        if (statusTimerRef.current !== null) {
          globalThis.clearTimeout(statusTimerRef.current);
          statusTimerRef.current = null;
        }
      };
    },
    [presetStatus.id]
  );

  /**
   * Write a whole preset list the caller built (save, delete, import, migration).
   *
   * An explicit list, so it is not compared against what is stored: the caller
   * decided, and a no-op here would silently drop a rename or a deletion.
   * @param {{name: string, values: object}[]} next - the list to store.
   */
  var writePresets = function (next) {
    if (next.length > shared.MAX_PRESETS) next = next.slice(0, shared.MAX_PRESETS);
    pendingPreset = { kind: "json", value: JSON.stringify(next) };
    scheduleFlush();
  };

  /**
   * Adopt the offset scale, once per document.
   *
   * A document written before the weight axes became relative stores absolute
   * weights inside `300…600`, and once a document is marked a stored `450` means
   * +450 — the two scales overlap, so the conversion must happen exactly once and
   * never again. This is that moment: before the first weight this card writes,
   * convert whatever is still absolute (the three fields and every saved snapshot),
   * then set the marker.
   *
   * The values are read from the RAW settings document, not from the normalized
   * `config`: normalization has already converted a legacy absolute weight
   * (`450 → 50`), so looking for one on the converted side finds nothing — and the
   * marker would then re-label the stored `450` as +450, turning a +50 code weight
   * into +450 in one click.
   *
   * Values first, marker last: a stylesheet rebuild between the two still sees
   * values that render exactly as before, and a marked document is never left
   * holding an unconverted absolute weight.
   *
   * The three fields are read from the document rather than from the expanded
   * `editing` set too: while the interface follows the conversation, `editing`
   * mirrors the conversation's weight into the interface's own field, and writing
   * that back would silently freeze the follow.
   */
  var adoptWeightScale = function () {
    if (config[WEIGHT_OFFSETS_FIELD] === true) return;
    var raw = snapshot.value !== null && typeof snapshot.value === "object" ? snapshot.value : {};
    for (var index = 0; index < shared.WEIGHT_FIELDS.length; index += 1) {
      var field = shared.WEIGHT_FIELDS[index];
      var stored = Number(raw[field]);
      if (!isFinite(stored) || stored < shared.WEIGHT_MIN || stored > shared.WEIGHT_MAX) {
        continue;
      }
      submit(field, stored - shared.WEIGHT_BASE);
    }
    // The snapshots are migrated from their stored JSON for the same reason: the
    // normalized list has already been converted, so it would report no change.
    var rawPresets = raw[PRESETS_FIELD];
    if (typeof rawPresets === "string" && rawPresets.trim() !== "") {
      var parsed = null;
      try {
        parsed = JSON.parse(rawPresets);
      } catch (error) {
        parsed = null;
      }
      var migrated = shared.migratePresetWeights(parsed);
      if (migrated.changed) writePresets(migrated.presets);
    }
    submit(WEIGHT_OFFSETS_FIELD, true);
  };

  /**
   * Switch presets: the entry becomes the auto-save target and its stored
   * values are applied over the set currently being edited — every axis the
   * entry does not store falls back to its neutral default, so a slot switch
   * is exact.
   * @param {{name: string, values: object}} entry - the picked preset.
   */
  var switchPreset = function (entry) {
    if (!writable || entry.name === activeName) return;
    applyingRef.current = true;
    try {
      for (var index = 0; index < VALUE_FIELDS.length; index += 1) {
        var field = VALUE_FIELDS[index];
        var value = Object.prototype.hasOwnProperty.call(entry.values, field)
          ? entry.values[field]
          : DEFAULTS[field];
        setField(field, value);
      }
      submit(ACTIVE_PRESET_FIELD, entry.name);
    } finally {
      applyingRef.current = false;
    }
    showStatus(t("preset.applied", { name: entry.name }));
  };

  /** Rename the active preset in place; its stored values ride along. */
  var renamePreset = function () {
    setRenaming(false);
    var name = presetName.trim().slice(0, shared.MAX_PRESET_NAME);
    setPresetName("");
    if (name === "" || !writable || name === activeName) return;
    var taken = false;
    var activeIndex = -1;
    for (var index = 0; index < presetList.length; index += 1) {
      if (presetList[index].name.toLowerCase() === name.toLowerCase()) taken = true;
      if (presetList[index].name === activeName) activeIndex = index;
    }
    if (taken || activeIndex < 0) {
      showStatus(t("preset.nameUsed"));
      return;
    }
    var next = presetList.slice();
    next[activeIndex] = {
      name: name,
      values: presetList[activeIndex].values,
      savedAt: presetList[activeIndex].savedAt,
    };
    writePresets(next);
    submit(ACTIVE_PRESET_FIELD, name);
    showStatus(t("preset.renamed", { name: name }));
  };

  /**
   * Hand the preset list over as JSON: the clipboard when it is available,
   * and otherwise a selected read-only box with the same text in it. The old
   * fallback printed the export into the one-line status row, which truncated
   * the JSON at 120 characters — a message that could not be copied from.
   */
  var exportPresets = function () {
    var text = JSON.stringify(presetList);
    void copyText(text).then(function (copied) {
      if (copied) {
        setExportText("");
        showStatus(t("preset.exported"));
        return;
      }
      setExportText(text);
      showStatus(t("preset.exportManual"));
    });
  };
  var importPresets = function (text) {
    var parsed = normalizePresets(text);
    if (parsed.length === 0) {
      showStatus(t("preset.importBad"));
      return;
    }
    // Imported presets merge into the list by name, imported values win.
    var merged = presetList.slice();
    for (var entryIndex = 0; entryIndex < parsed.length; entryIndex += 1) {
      var entry = parsed[entryIndex];
      var replaced = false;
      for (var existingIndex = 0; existingIndex < merged.length; existingIndex += 1) {
        if (merged[existingIndex].name.toLowerCase() === entry.name.toLowerCase()) {
          merged[existingIndex] = entry;
          replaced = true;
          break;
        }
      }
      if (!replaced) merged.push(entry);
    }
    writePresets(merged);
    setImportOpen(false);
    showStatus(t("preset.imported", { count: parsed.length }));
  };

  // the family field, in either mode
  var familyField = function (props) {
    var stack = editing[props.field];
    if (view === "simple") {
      return h(SimpleFamilyField, {
        t: t,
        label: t(props.labelKey),
        westLabel: props.westLabel,
        eastLabel: props.eastLabel,
        slots: deriveSlots(stack),
        disabled: !writable,
        onPickWest: function (family) {
          pickWest(props.field, family);
        },
        onPickEast: function (family) {
          pickEast(props.field, family);
        },
        onRemoveWest: function () {
          var slots = deriveSlots(stack);
          if (slots.west !== null) dropEntry(props.field, slots.west);
        },
        onRemoveEast: function () {
          var slots = deriveSlots(stack);
          if (slots.east !== null) dropEntry(props.field, slots.east);
        },
      });
    }
    return h(
      FieldShell,
      {
        t: t,
        label: t(props.labelKey),
        hint: t(props.hintKey),
        overridden: overridden(props.field),
        disabled: !writable,
        onReset: function () {
          resetField(props.field);
        },
      },
      h(StackPicker, {
        t: t,
        label: t(props.labelKey),
        value: stack,
        onChange: function (value) {
          setField(props.field, value);
        },
      })
    );
  };

  // The interface follows the conversation (default): of the two axes the
  // interface owns, the conversation's value wins and its own stays the
  // fallback. The switch lives in the interface section.
  var uiFollows = config[UI_FOLLOWS_FIELD] !== false;

  // The family each weight axis is measured against: the configured stack when
  // there is one, the page's own family otherwise. Resolved once through the
  // shared helper, so the collapsed summaries, the sliders, the previews and
  // the warm-up all agree on the count.
  var measuredStacks = weightAxisStacks(editing);
  var uiStack = measuredStacks.ui;
  var dialogStack = measuredStacks.dialog;
  var codeStack = measuredStacks.code;
  /**
   * One weight offset, as the number of family steps the reader sees.
   * @param {string} field - which weight axis.
   * @param {number} value - the stored offset.
   * @returns {number} the step count.
   */
  var weightCount = function (field, value) {
    var isCode = field === CODE_WEIGHT_FIELD;
    var stack =
      field === WEIGHT_DIALOG_FIELD ? dialogStack : isCode ? codeStack : uiStack;
    var profile = weightProfileFor(stack, isCode ? shared.WEIGHT_BASE : shared.WEIGHT_LADDER_STRONG);
    return weightStepRange(profile, value === WEIGHT_UNSET ? 0 : value).value;
  };

  var summaries = sectionSummaries(editing, uiFollows, t, weightCount);

  // The interface owns one axis now (its family); its preview shows that and
  // nothing else — the weight, size and line height all come from the
  // conversation section.
  var previewUiStyle = {};
  if (uiStack !== "") previewUiStyle.fontFamily = uiStack;
  var previewDialogStyle = {};
  // Independent and unset: the conversation keeps DSH's own family, so the
  // preview shows the theme's default rather than the interface stack the page
  // rule would otherwise paint into this box.
  if (dialogStack !== "") previewDialogStyle.fontFamily = dialogStack;
  previewDialogStyle.fontSize = 13 + editing[SIZE_DIALOG_FIELD] + "px";
  // The axis is a percentage OF DSH's own line height, so the preview multiplies the
  // measured base by the same percentage — and does it at every notch including 100,
  // or the preview would show a shorter line at 105% than at 100%.
  previewDialogStyle.lineHeight = String(
    Math.round(
      dialogLineRatio() *
        (editing[LINE_HEIGHT_DIALOG_FIELD] / LINE_HEIGHT_MIN) *
        10000
    ) / 10000
  );
  if (editing[WEIGHT_DIALOG_FIELD] !== WEIGHT_UNSET) {
    // The offset, not a weight: the injected stylesheet's conversation ladder
    // reads `--dfp-wdelta` on this very class and re-states each element's own
    // base plus the offset, so the preview shows the same hierarchy the
    // conversation does instead of one flat weight.
    previewDialogStyle["--dfp-wdelta"] = editing[WEIGHT_DIALOG_FIELD];
  }
  var previewCodeStyle = {};
  if (editing[MONO_FIELD] !== "") {
    previewCodeStyle.fontFamily = formatStack(parseStack(editing[MONO_FIELD]));
  }
  previewCodeStyle.fontSize = 13 + editing[CODE_SIZE_FIELD] + "px";
  if (editing[CODE_LINE_HEIGHT_FIELD] !== 0) {
    previewCodeStyle.lineHeight = "calc(20px + " + editing[CODE_LINE_HEIGHT_FIELD] + "px)";
  }

  return h(
    "li",
    { className: "dfp-card" + (open ? " dfp-cardOpen" : "") },
    h(
      "button",
      {
        type: "button",
        className: "dfp-header",
        "aria-expanded": open,
        "aria-label": t(open ? "card.collapse" : "card.expand") + ": " + t("card.title"),
        onClick: function () {
          setOpen(!open);
        },
      },
      h(
        "span",
        { className: "dfp-headText" },
        h("span", { className: "dfp-name" }, t("card.title")),
        h("span", { className: "dfp-description" }, t("card.description"))
      ),
      h(
        "svg",
        {
          className: "dfp-chevron" + (open ? " dfp-chevronOpen" : ""),
          width: 14,
          height: 14,
          viewBox: "0 0 14 14",
          fill: "none",
          "aria-hidden": "true",
        },
        h("path", { d: CHEVRON_PATH, fill: "currentColor" })
      )
    ),
    open
      ? h(
          "div",
          { className: "dfp-body" },
          writable ? null : h("p", { className: "dfp-readOnly", role: "status" }, t("card.readOnly")),

          // edit mode
          h(
            "div",
            { className: "dfp-field" },
            h(
              "div",
              { className: "dfp-fieldHead", role: "group", "aria-label": t("mode.label") },
              h("span", { className: "dfp-fieldLabel" }, t("mode.label")),
              h(
                "div",
                { className: "dfp-inline" },
                h(Segmented, {
                  label: t("mode.label"),
                  value: view,
                  options: [
                    { value: "simple", label: t("mode.simple") },
                    { value: "advanced", label: t("mode.advanced") },
                  ],
                  onChange: changeView,
                })
              )
            )
          ),

          // the preset bar: a dropdown select plus rename/import/export.
          // With a preset selected every edit auto-saves into it, so there is
          // no separate save step — the bar sits right under the edit mode.
          h(
            "div",
            { className: "dfp-field" },
            h(
              "div",
              { className: "dfp-fieldHead" },
              h("span", { className: "dfp-fieldLabel" }, t("preset.label"))
            ),
            h(
              "div",
              { className: "dfp-presetBar" },
              renaming
                ? h("input", {
                    type: "text",
                    className: "dfp-textInput",
                    autoFocus: true,
                    spellCheck: false,
                    value: presetName,
                    disabled: !writable,
                    "aria-label": t("preset.rename"),
                    placeholder: t("preset.renamePlaceholder"),
                    onChange: function (event) {
                      setPresetName(event.target.value);
                    },
                    onKeyDown: function (event) {
                      if (event.key === "Enter") renamePreset();
                      if (event.key === "Escape") {
                        setRenaming(false);
                        setPresetName("");
                      }
                    },
                    onBlur: function () {
                      if (presetName.trim() !== "") renamePreset();
                      else setRenaming(false);
                    },
                  })
                : h(PresetSelect, {
                    t: t,
                    presets: presetList,
                    value: activeName,
                    disabled: !writable,
                    onPick: switchPreset,
                  }),
              h(
                "button",
                {
                  type: "button",
                  className: "dfp-miniButton",
                  disabled: !writable,
                  onClick: function () {
                    setPresetName(activeName);
                    setRenaming(true);
                  },
                },
                t("preset.rename")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dfp-miniButton",
                  disabled: !writable,
                  onClick: function () {
                    setImportOpen(!importOpen);
                  },
                },
                t("preset.import")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dfp-miniButton",
                  onClick: exportPresets,
                },
                t("preset.export")
              )
            ),
            // the hint and the transient message share one always-mounted row:
            // the message fades in on the right and never changes the row's
            // height, so nothing below it moves
            h(
              "div",
              { className: "dfp-presetMeta" },
              h("p", { className: "dfp-hint dfp-presetHint" }, t("preset.autoSave")),
              h(
                "span",
                {
                  className: "dfp-status" + (statusShown ? " dfp-statusOn" : ""),
                  role: "status",
                  "aria-live": "polite",
                  // The one-line clamp is deliberate; the full text (a long
                  // clipboard fallback, say) stays readable on hover.
                  title: presetStatus.text,
                },
                presetStatus.text
              )
            ),
            importOpen
              ? h("textarea", {
                  className: "dfp-search",
                  rows: 3,
                  "aria-label": t("preset.import"),
                  placeholder: t("preset.importPlaceholder"),
                  onBlur: function (event) {
                    // Import on blur, not per keystroke: typing a partial
                    // paste must not be parsed as a bad export.
                    var text = event.target.value.trim();
                    if (text !== "") importPresets(text);
                  },
                })
              : null,
            // The clipboard-less export: the same JSON, already selected, so
            // the one thing left to do is press the copy shortcut.
            exportText !== ""
              ? h("textarea", {
                  className: "dfp-search dfp-exportText",
                  rows: 3,
                  readOnly: true,
                  autoFocus: true,
                  spellCheck: false,
                  "aria-label": t("preset.exportManual"),
                  value: exportText,
                  onFocus: function (event) {
                    event.target.select();
                  },
                  onCopy: function () {
                    setExportText("");
                  },
                })
              : null
          ),

          // the accordion, conversation first (it owns every axis), then the
          // interface (which follows it), then code
          h(
            Section,
            {
              t: t,
              title: t("section.dialog"),
              summary: summaries.dialog,
              open: expanded === "dialog",
              onToggle: function () {
                setExpanded(expanded === "dialog" ? null : "dialog");
              },
            },
            familyField({
              field: STACK_DIALOG_FIELD,
              labelKey: "dialog.label",
              hintKey: "dialog.hint",
              westLabel: "dialogWest.label",
              eastLabel: "dialogEast.label",
            }),
            sizeField({
              field: SIZE_DIALOG_FIELD,
              labelKey: "size.dialogLabel",
              hintKey: "size.dialogHint",
              value: editing[SIZE_DIALOG_FIELD],
              text:
                editing[SIZE_DIALOG_FIELD] > 0
                  ? "+" + editing[SIZE_DIALOG_FIELD]
                  : String(editing[SIZE_DIALOG_FIELD]),
            }),
            lineField({
              field: LINE_HEIGHT_DIALOG_FIELD,
              labelKey: "line.dialogLabel",
              hintKey: "line.dialogHint",
              value: editing[LINE_HEIGHT_DIALOG_FIELD],
            }),
            weightField({
              field: WEIGHT_DIALOG_FIELD,
              labelKey: "weight.dialogLabel",
              hintKey: "weight.dialogHint",
              value: editing[WEIGHT_DIALOG_FIELD],
              stack: dialogStack,
            }),
            h(
              "div",
              { className: "dfp-previewBox" },
              h("div", { className: "dfp-previewCaption" }, t("preview.dialogCaption")),
              h(
                "div",
                { className: "dfp-previewText dfp-previewDialog", style: previewDialogStyle },
                t("preview.sample")
              )
            )
          ),
          h(
            Section,
            {
              t: t,
              title: t("section.ui"),
              summary: summaries.ui,
              open: expanded === "ui",
              onToggle: function () {
                setExpanded(expanded === "ui" ? null : "ui");
              },
            },
            // The interface owns a family and a weight. While it follows the
            // conversation both come from the section above and only this row
            // shows; with the switch off its own two controls appear.
            h(
              "div",
              { className: "dfp-field" + (uiFollows ? " dfp-fieldLast" : "") },
              h(
                "div",
                { className: "dfp-fieldHead", role: "group", "aria-label": t("ui.follow") },
                h("span", { className: "dfp-fieldLabel" }, t("ui.follow")),
                h(
                  "div",
                  { className: "dfp-inline" },
                  h(Segmented, {
                    label: t("ui.follow"),
                    value: uiFollows ? "on" : "off",
                    options: [
                      { value: "on", label: t("common.on") },
                      { value: "off", label: t("common.off") },
                    ],
                    disabled: !writable,
                    onChange: function (next) {
                      if (next === "on") {
                        setField(UI_FOLLOWS_FIELD, true);
                        return;
                      }
                      // Turning the switch off must not change what the page
                      // shows: the interface keeps the values it was following,
                      // written into its own two fields, and the sliders start
                      // from there. An axis the conversation does not set
                      // (empty family, unset weight) clears the interface's own
                      // field instead, so it stays on DSH's defaults.
                      if (editing[SANS_FIELD] === "") resetField(SANS_FIELD);
                      else if (editing[SANS_FIELD] !== config[SANS_FIELD]) {
                        setField(SANS_FIELD, editing[SANS_FIELD]);
                      }
                      if (editing[WEIGHT_FIELD] === WEIGHT_UNSET) resetField(WEIGHT_FIELD);
                      else if (editing[WEIGHT_FIELD] !== config[WEIGHT_FIELD]) {
                        setField(WEIGHT_FIELD, editing[WEIGHT_FIELD]);
                      }
                      setField(UI_FOLLOWS_FIELD, false);
                    },
                  })
                )
              ),
              h("p", { className: "dfp-hint" }, t("ui.followHint"))
            ),
            uiFollows
              ? null
              : familyField({
                  field: SANS_FIELD,
                  labelKey: "sans.label",
                  hintKey: "sans.hint",
                  westLabel: "sansWest.label",
                  eastLabel: "sansEast.label",
                }),
            uiFollows
              ? null
              : weightField({
                  field: WEIGHT_FIELD,
                  labelKey: "weight.uiLabel",
                  hintKey: "weight.uiHint",
                  value: editing[WEIGHT_FIELD],
                  stack: uiStack,
                }),
            h(
              "div",
              { className: "dfp-previewBox" },
              h("div", { className: "dfp-previewCaption" }, t("preview.sansCaption")),
              h("div", { className: "dfp-previewText", style: previewUiStyle }, t("preview.sample"))
            )
          ),
          h(
            Section,
            {
              t: t,
              title: t("section.code"),
              summary: summaries.code,
              open: expanded === "code",
              onToggle: function () {
                setExpanded(expanded === "code" ? null : "code");
              },
            },
            familyField({
              field: MONO_FIELD,
              labelKey: "mono.label",
              hintKey: "mono.hint",
              westLabel: "monoWest.label",
              eastLabel: "monoEast.label",
            }),
            sizeField({
              field: CODE_SIZE_FIELD,
              labelKey: "size.codeLabel",
              hintKey: "size.codeHint",
              value: editing[CODE_SIZE_FIELD],
              text:
                editing[CODE_SIZE_FIELD] > 0
                  ? "+" + editing[CODE_SIZE_FIELD]
                  : String(editing[CODE_SIZE_FIELD]),
            }),
            codeLineField(),
            weightField({
              field: CODE_WEIGHT_FIELD,
              labelKey: "weight.codeLabel",
              hintKey: "weight.codeHint",
              value: editing[CODE_WEIGHT_FIELD],
              // The code axis puts one weight on the whole surface, so its own base
              // is the heaviest layer there is: any lower base would cap the range
              // short of what code text can actually reach.
              top: shared.WEIGHT_BASE,
              stack: codeStack,
            }),
            ligatureField(),
            view === "advanced" ? featuresField() : null,
            h(
              "div",
              { className: "dfp-previewBox" },
              h("div", { className: "dfp-previewCaption" }, t("preview.monoCaption")),
              h(
                "div",
                { className: "dfp-previewText dfp-previewCode", style: previewCodeStyle },
                t("preview.code")
              )
            )
          ),
          // global fine-tuning, without an accordion: it is one switch (two in
          // advanced mode), so it sits directly below the three font sections
          view === "simple"
            ? synthesisField({
                field: NO_SYNTHETIC_ITALIC_FIELD,
                labelKey: "synth.simple",
                hintKey: "synth.simpleHint",
                simple: true,
              })
            : h(
                "div",
                null,
                synthesisField({
                  field: NO_SYNTHETIC_ITALIC_FIELD,
                  labelKey: "synth.italic",
                  hintKey: "synth.italicHint",
                }),
                synthesisField({
                  field: NO_SYNTHETIC_BOLD_FIELD,
                  labelKey: "synth.bold",
                  hintKey: "synth.boldHint",
                })
              ),

          // how the strokes are drawn: a look preference rather than an axis,
          // so it sits with the global switches and never rides a preset
          smoothingField(),

          // the floating panel's master switch: chrome, not typography, so it
          // sits with the global switches and never rides a preset snapshot
          h(SwitchField, {
            t: t,
            label: t("panel.masterLabel"),
            hint: t("panel.masterHint"),
            value: editing[PANEL_ENABLED_FIELD] !== false,
            disabled: !writable,
            overridden: overridden(PANEL_ENABLED_FIELD) && editing[PANEL_ENABLED_FIELD] === false,
            onReset: function () {
              resetField(PANEL_ENABLED_FIELD);
            },
            onChange: function (next) {
              setField(PANEL_ENABLED_FIELD, next);
            },
          }),

          h(
            "div",
            { className: "dfp-footer" },
            h(
              "button",
              {
                type: "button",
                className: "dfp-resetAll",
                disabled: !writable,
                onClick: function () {
                  for (var index = 0; index < VALUE_FIELDS.length; index += 1) {
                    clear(VALUE_FIELDS[index]);
                  }
                  // The retired axes are cleared too: they render nothing, so a
                  // value left behind would be invisible forever.
                  for (var retired = 0; retired < RETIRED_FIELDS.length; retired += 1) {
                    clear(RETIRED_FIELDS[retired]);
                  }
                  clear(DARK_VALUES_FIELD);
                  // Auto-save: the reset IS a change to the active preset, so
                  // its snapshot follows back to the neutral defaults.
                  if (writable && applyingRef.current !== true) {
                    var activeIndex = -1;
                    for (var i = 0; i < presetList.length; i += 1) {
                      if (presetList[i].name === activeName) activeIndex = i;
                    }
                    if (activeIndex >= 0) {
                      var next = presetList.slice();
                      next[activeIndex] = {
                        name: presetList[activeIndex].name,
                        values: {},
                        savedAt: Date.now(),
                      };
                      writePresets(next);
                    }
                  }
                },
              },
              t("card.resetAll")
            )
          )
        )
      : null
  );
}

/* ------------------------------------------------------------------ *
 * the floating panel
 * ------------------------------------------------------------------ */

/** localStorage key of the panel's open/shut state (position lives in settings). */
var FLOAT_OPEN_KEY = "dsh-fonttune.float.v1";

/**
 * The unfold's own length, in milliseconds (mirrors `.dfp-floatCard`).
 *
 * Used to know when the card's resting clip may be dropped for good.
 */
var FLOAT_UNFOLD_MS = 280;

/**
 * The fold's length, in milliseconds (mirrors `.dfp-floatCardLeave`).
 *
 * Longer than the unfold ON PURPOSE: the user read the old, symmetric 280 ms
 * close as "too fast". The unfold is an eager, front-loaded ease-out, while the
 * fold starts gently and spends its extra 140 ms in the tail — the card covers
 * the last third of its travel over roughly the last 40% of the duration, so it
 * visibly settles into the dot instead of being gone in ~100 ms.
 */
var FLOAT_FOLD_MS = 420;

/**
 * How long the shut card stays mounted, in milliseconds.
 *
 * The leave transition itself is 420 ms (`FLOAT_FOLD_MS`); this adds the slack
 * for the two frames the class waits for (see `startLeave`) so the card is
 * never dropped mid-fold.
 */
var FLOAT_LEAVE_MS = 480;

/**
 * How long the enter frame may wait for its two frames before a timer stands
 * in, in milliseconds.
 *
 * Longer than two frames at any frame rate a person can watch, and shorter than
 * anything they would notice: a browser that stopped painting the tab must not
 * leave the card clipped to the dot forever.
 */
var FLOAT_SETTLE_MS = 250;

/**
 * How long a change of the conversation area waits before the dot is pulled
 * back inside it, in milliseconds.
 *
 * A sidebar folding away fires a burst of sizes (the window, the pane, the
 * message list) and every one of them moves the same corners: waiting turns that
 * burst into ONE re-snap, which is what keeps a region change from writing a
 * position per frame.
 */
var FLOAT_REFLOW_MS = 120;

/**
 * How often the winning rectangle is re-read by hand, in milliseconds.
 *
 * The observer is the fast path, and this is the line that cannot be cut: a host
 * that REPLACES the conversation element (a re-render, a session switch, a layout
 * swap) leaves the observer holding a node that is no longer in the document, and
 * an observer on a detached node is never called again — the resolution that would
 * find the new node can only run inside the callback that will never arrive. This
 * tick reads the bounds directly, so it cannot be deafened by anything the host
 * does to the document.
 *
 * 500 ms is the pick. The reading is four numbers off ONE already-resolved
 * candidate list (a `getBoundingClientRect` per distinct scroll container, capped
 * at 24), and it does NOTHING else when the numbers are unchanged: no style
 * resolution, no render, no write. So the cost is a layout read twice a second
 * while a page is visible — far under the thresholds a polling loop has to respect
 * — while the user sees the dot corrected within half a second of a host rebuild,
 * which is under the ~700 ms a hand-off in this shell costs anyway.
 */
var FLOAT_WATCH_POLL_MS = 500;

/**
 * How far off a corner still counts as resting on it, in CSS pixels.
 *
 * A position is stored rounded, and a caller may hand in a fraction, so an exact
 * comparison would find a "stray" dot in a dot already parked and move it for
 * nothing (and write it back to the document). Two pixels is under the smallest
 * visible offset and far above any rounding error.
 */
var FLOAT_CORNER_SLACK = 2;

/**
 * Read the panel's persisted open state. Open is the default; an unreadable
 * storage must not break the page.
 * @returns {boolean} true when the panel starts expanded.
 */
function floatReadOpen() {
  try {
    return globalThis.localStorage.getItem(FLOAT_OPEN_KEY) !== "shut";
  } catch (error) {
    return true;
  }
}

/**
 * Persist the panel's open state. Position is NOT stored here — it rides the
 * settings field, so it follows the configuration.
 * @param {boolean} open - the state to keep.
 */
function floatStoreOpen(open) {
  try {
    globalThis.localStorage.setItem(FLOAT_OPEN_KEY, open ? "open" : "shut");
  } catch (error) {
    // Unavailable storage only costs the persistence of the preference.
  }
}

/**
 * Mount the floating tune panel: a dot in the page corner that expands to
 * quick controls for the most-used axes.
 *
 * Vanilla DOM on purpose: the panel lives on every page, while the card only
 * renders inside the settings sheet — there is no React seat for it. One
 * settings call per gesture (an axis value plus the preset mirror in a single
 * `mutate`), local paint the moment the gesture ends, and the dot's corner and
 * position persisted as ONE `panelPos`/`panelCorner` write when a drag ends.
 *
 * The dot drags from the dot itself or the card head; a press below the click
 * threshold is a click (toggle), past it a drag (move, no toggle, no replayed
 * animation). Release re-decides the dot's corner — the nearest one — and snaps
 * onto it. That corner is the dot's IDENTITY: a region that changes shape moves
 * the corner, and the dot follows it there instead of letting the coordinates
 * the old region left behind pick a different one (see `settleOnCorner`). The
 * open card's anchored corner coincides with the dot, and the card is clipped
 * down to the dot's own rectangle for the first frame of the unfold, so the
 * panel grows out of the dot and folds back into it; the dot itself cross-fades
 * the other way and stops taking pointer events while the card is up. The card
 * carries edge resize handles inside its own bounds, and a press on a button
 * inside the drag handle belongs to that button: the drag only starts when the
 * press missed every button.
 * @param {object} scope - the bound settings scope.
 * @param {(key: string, params?: object) => string} t - the translator.
 * @param {object} [hostCtx] - the client context, for the host service lookups
 *   the settings button performs at click time.
 * @returns {{destroy: () => void, toggle: () => void}} the panel's handles.
 */
function mountFloatPanel(scope, t, hostCtx) {
  var noop = function () {};
  if (typeof document === "undefined" || !document.body) return { destroy: noop, toggle: noop };
  // The offline stand-ins hand out element stubs without listeners or
  // selectors; without a real element face there is nothing to mount on.
  var probe = null;
  try {
    probe = document.createElement("div");
  } catch (error) {
    probe = null;
  }
  if (
    probe === null ||
    typeof probe.setAttribute !== "function" ||
    typeof probe.addEventListener !== "function" ||
    typeof probe.appendChild !== "function" ||
    typeof probe.querySelector !== "function" ||
    typeof document.body.appendChild !== "function"
  ) {
    return { destroy: noop, toggle: noop };
  }
  var host = document.createElement("div");
  host.className = "dfp-floatHost";
  host.setAttribute("data-dfp-float", "1");
  // One host per page: a fiber that applies again (HMR, a second seat) adopts
  // the seat instead of parking a twin next to it — two hosts would be two
  // "truths" about the same dot.
  try {
    var olds = document.querySelectorAll("[data-dfp-float]");
    for (var oi = 0; oi < olds.length; oi += 1) {
      if (olds[oi].parentNode) olds[oi].parentNode.removeChild(olds[oi]);
    }
  } catch (error) {
    // A host without selector removal still gets exactly this host.
  }
  document.body.appendChild(host);

  var open = floatReadOpen();
  var drag = null;
  var resize = null;
  // A drag that travelled past the click threshold swallows the click the
  // browser fires on release; without this a drag ending over the dot (or a
  // press that barely moved) toggles the panel it just moved — the repeated
  // open animation from the bug report.
  var suppressClick = false;
  // The enter animation plays only on a real shut->open transition, never on
  // a re-render while open (slider input, snapshot echo): re-adding the start
  // frame there replayed the animation under the user's hands.
  var playEnter = false;
  // The one truth about where the dot sits: the settings field at rest, this
  // variable while the user moves it. Collapse, reopen and reload only READ
  // it — they never recompute it — so only a real move changes it, and only
  // the first run (nothing stored) takes the default corner.
  var pos = null;
  // The corner the dot LIVES in — one of "tl"/"tr"/"bl"/"br", or null while the
  // document names none. This is the dot's identity and `pos` is only its
  // consequence: a region that changes shape moves the corner, and the dot is
  // put back on the SAME one (see `settleOnCorner`). Only a release the user
  // made re-decides it, and only a document that never named one has it derived
  // for it — once, and stored, which is what keeps every later change of shape
  // from re-picking a corner from coordinates the old region left behind.
  var corner = null;
  // The live card size while resizing; otherwise the document's size rules.
  var liveSize = null;
  // The document value `pos` was last reconciled with: a snapshot carrying
  // anything else is an edit from elsewhere and is adopted. Our own writes
  // set `pos` first, so their echo always matches and is a no-op.
  var lastSeenDoc = null;
  // The same for the corner: the document value `corner` was last reconciled
  // with, and the one our own write is still carrying.
  var lastSeenCorner = null;
  var lastSeenSize = null;
  // Our own position write still in flight: collapse skips re-saving it.
  var pendingWrite = null;
  var pendingCorner = null;
  var pendingSizeWrite = null;
  // The leave-animation timer, and whether a leave is in flight (the card must
  // survive the snapshot guard until the shrink has played out).
  var closeTimer = null;
  var leaving = false;
  var statusTimer = null;
  // The quadrant the live card grew from, kept for the leave: the fold has to
  // end on the same small rectangle the unfold started from, and the card's own
  // measurement only exists while it is mounted.
  var liveQuadrant = null;

  var el = function (tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };

  var SVG_NS = "http://www.w3.org/2000/svg";

  /**
   * Build one inline SVG node — no icon package, no emoji.
   *
   * `document.createElementNS` is the only way to put a node in the SVG
   * namespace; a host that ships no such method (the offline stubs, a very old
   * engine) gets the HTML element instead, which still paints the circles
   * because both are `display:block` boxes styled by the same rule.
   * @param {string} tag - the SVG tag name.
   * @param {Record<string, string|number>} attrs - its attributes.
   * @returns {object} the element.
   */
  var svgEl = function (tag, attrs) {
    var node = typeof document.createElementNS === "function"
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag);
    for (var name in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, name)) node.setAttribute(name, String(attrs[name]));
    }
    return node;
  };

  /**
   * The settings glyph: a gear built inline, at the button's own 24-unit scale.
   *
   * Two concentric rings plus a ring of eight teeth drawn as a dashed stroke —
   * `stroke-dasharray` on a circle whose circumference is exactly 8 × 2 units
   * puts one tooth every 2 units, so the shape is arithmetic rather than a
   * path's worth of magic numbers. Everything is `currentColor`, so the button's
   * own tint (rest, hover and disabled alike) drives it.
   * @returns {object} the `<svg>` element.
   */
  /** The panel's icon buttons are this wide and this tall, always. */
  var ROUND_BUTTON_PX = 22;
  // The pinwheel inside the settings button: the Host's own Plugins-entry glyph
  // (its 16-unit box, copied path for path), drawn a touch under the close's
  // weight at 1.8px — the sidebar's own one-pixel stroke was too fine. The box
  // is 16px against the close's 15px on purpose: the pinwheel is an airy
  // silhouette and read small at the same size (16 unit = 16px, so the stroke
  // attribute IS its pixel weight).
  var SETTINGS_GLYPH_PX = 16;
  var SETTINGS_GLYPH_STROKE = 1.8;
  // The close's cross: quick-toc's own close geometry (24 box, 3.4 stroke, the
  // lines spanning 5..19), drawn at the size its round buttons carry.
  var CLOSE_ICON_PX = 15;

  /**
   * Force one icon button to be a true circle, whatever the host stylesheet says.
   *
   * The class rules in `CARD_CSS` already ask for a circle, but a host rule such as
   * `… button { border-radius: 8px }` out-specifies a lone class and turns it back
   * into a rounded square — which is what the user sees as "not round yet". Inline
   * declarations win over every stylesheet, so the shape holds on every host line.
   * @param {object} node - the button to square up.
   */
  var roundButton = function (node) {
    // `important` on the style attribute, not plain inline: a host rule written as
    // `… button { border-radius: 8px !important }` beats a plain inline
    // declaration, and an important style-attribute declaration beats THAT. The
    // shape is the whole point of the button, so it gets the strongest form there
    // is short of a shadow root.
    var important = function (name, value) {
      node.style.setProperty(name, value, "important");
    };
    important("width", ROUND_BUTTON_PX + "px");
    important("height", ROUND_BUTTON_PX + "px");
    // A 50% radius on a NON-SQUARE box is an oval: a host `min-width` would widen
    // the box while the height stays 22px, and the eye reads that as "not round".
    // Pin the box itself square, every side of it.
    important("min-width", "0");
    important("min-height", "0");
    important("max-width", "none");
    important("max-height", "none");
    important("aspect-ratio", "1 / 1");
    // `corner-shape` decides how a rounded corner is DRAWN: a host that styles it
    // otherwise turns a 50% radius into a cut corner, which reads as "not round"
    // no matter what the computed radius says. quick-toc's round tool buttons say
    // `cornerShape: "round"` for the same reason — so does this one.
    important("corner-shape", "round");
    important("flex", "none");
    important("padding", "0");
    important("border", "none");
    important("border-radius", "50%");
    important("box-sizing", "border-box");
    important("display", "flex");
    important("align-items", "center");
    important("justify-content", "center");
  };

  /**
   * Make one box draw as a true circle whatever the host stylesheet says.
   *
   * `corner-shape` decides HOW a rounded corner is drawn: a host that asks for a
   * cut corner turns a 50% radius into a square with sliced corners, which reads
   * as "not round" however correct the computed radius is. The box is pinned
   * square too, because 50% of a non-square box is an oval. Inline `important`
   * wins every stylesheet tie.
   * @param {object} node - the element to round.
   */
  var roundShape = function (node) {
    var important = function (name, value) {
      node.style.setProperty(name, value, "important");
    };
    important("corner-shape", "round");
    important("border-radius", "50%");
    important("aspect-ratio", "1 / 1");
    important("min-width", "0");
    important("min-height", "0");
    important("max-width", "none");
    important("max-height", "none");
    important("box-sizing", "border-box");
  };

  /**
   * The Host's own Plugins-entry glyph: the four-arc pinwheel.
   *
   * The paths are copied VERBATIM from the shipped icon the sidebar's Plugins
   * entry renders (`IconPluginPinwheelOutlineRegular`, a 16-unit box), so the
   * silhouette is exactly the entry it opens. The stroke is deliberately
   * HEAVIER than the sidebar's one pixel: 1.8px as drawn (1.8 units in the
   * 16px box), a touch under the close's cross so the two buttons read alike.
   * The size is pinned inline for the same reason the buttons are: a host `svg`
   * rule must not be able to shrink the one glyph the user recognises.
   * @returns {object} the svg element.
   */
  var settingsGlyph = function () {
    var svg = svgEl("svg", {
      class: "dfp-floatSettingsGlyph",
      viewBox: "0 0 16 16",
      width: String(SETTINGS_GLYPH_PX),
      height: String(SETTINGS_GLYPH_PX),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": String(SETTINGS_GLYPH_STROKE),
      "aria-hidden": "true",
      focusable: "false",
    });
    svg.style.width = SETTINGS_GLYPH_PX + "px";
    svg.style.height = SETTINGS_GLYPH_PX + "px";
    var petals = [
      "M7.84457 5.06199C11.6605 4.93876 14.7962 6.14848 14.8484 7.76397C14.8875 8.97461 13.1838 10.0696 10.7215 10.5942",
      "M5.12742 8.07731C5.00419 4.26138 6.21391 1.12568 7.8294 1.07351C9.04004 1.03441 10.135 2.73808 10.6596 5.20037",
      "M8.02457 10.6802C4.20865 10.8034 1.07294 9.5937 1.02077 7.97821C0.981678 6.76758 2.68535 5.67262 5.14763 5.14798",
      "M10.7476 7.89535C10.8708 11.7113 9.66109 14.847 8.0456 14.8991C6.83496 14.9382 5.74 13.2346 5.21536 10.7723",
    ];
    for (var index = 0; index < petals.length; index += 1) {
      svg.appendChild(svgEl("path", { d: petals[index] }));
    }
    return svg;
  };

  /**
   * The close's cross: quick-toc's own close glyph, copied as geometry.
   *
   * Its cross lines span 5..19 in a 24 box (the intersection at 12,12 dead
   * centre — no nudge), stroked 3.4 with round caps, drawn at the 15px its
   * round buttons carry. Round caps are the whole point: every stroke end in
   * this header is rounded now, and the cross is the most visible one.
   * @returns {object} the svg element.
   */
  var closeCross = function () {
    var svg = svgEl("svg", {
      class: "dfp-floatCloseCross",
      viewBox: "0 0 24 24",
      width: String(CLOSE_ICON_PX),
      height: String(CLOSE_ICON_PX),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "3.4",
      "stroke-linecap": "round",
      "aria-hidden": "true",
      focusable: "false",
    });
    svg.style.width = CLOSE_ICON_PX + "px";
    svg.style.height = CLOSE_ICON_PX + "px";
    svg.appendChild(svgEl("line", { x1: "5", y1: "5", x2: "19", y2: "19" }));
    svg.appendChild(svgEl("line", { x1: "19", y1: "5", x2: "5", y2: "19" }));
    return svg;
  };

  /**
   * Go to the plugin's own settings screen, with every route the host offers.
   *
   * The host's own navigation comes first (`openPluginPage`): the plugin
   * manager's cross-plugin service and the layout's panel selection are the
   * routes a shipped DSH feature itself uses, and they cannot mistake a
   * conversation that merely names the plugin for its entry. The DOM chain
   * (`shared.findSettingsEntry`, a pure lookup over the document) stays as the
   * fallback for a host line with neither service, and this wrapper runs its
   * plan with a short retry while the settings dialog mounts.
   *
   * Nothing is silent: a host with no settings screen at all logs one warning
   * that names the reason, so a user staring at a button that does nothing can
   * find out why from the console.
   * @param {string} [reason] - a short tag for the diagnostic line.
   * @returns {boolean} whether a route was found and taken.
   */
  var openSettingsScreen = function (reason) {
    var tag = typeof reason === "string" && reason !== "" ? reason : "settings button";
    // The host's own navigation first: it is the only route that cannot mistake
    // prose naming the plugin for the plugin's own page.
    if (openPluginPage(tag)) return true;
    var attempts = 0;
    var retry = function (select) {
      // The dialog mounts in one commit, and the row (then its configuration tab)
      // mounts one commit after the cell; six frames is far more than that and
      // still short enough that a miss reads as "nothing happened".
      attempts += 1;
      if (attempts > 6) return null;
      var found = select();
      if (found === null) return null;
      shared.dispatchSynthetic(found, "click");
      return found;
    };
    var plan = shared.findSettingsEntry(document, { retry: retry });
    if (plan === null) {
      warnSettingsMissing(tag, "no settings entry and no settings launcher on screen");
      return false;
    }
    var taken = plan.run();
    probeLog("settings-open", { reason: tag, kind: plan.kind, taken: taken !== false && taken !== null });
    return taken !== false && taken !== null;
  };

  /**
   * How long the entry-card click waits for the Plugins page to mount it.
   *
   * The card appears a commit or three after the panel switch, so the lookup
   * polls briefly instead of giving up on the first frame; twelve tries at
   * 150 ms is far past a page paint and still reads as one gesture.
   */
  /**
   * Look one host service up WITHOUT declaring a dependency on it.
   *
   * `pluginNavigation` and `layout` are optional here by design: a required
   * inject would keep this whole package from activating on a host line that
   * does not ship them, and the settings button is not worth that. Both routes
   * the client context offers are tried — `ctx.get` (the optional lookup) first,
   * then the service property.
   * @param {string} name - the service name.
   * @returns {object|null} the service, or null when this host has none.
   */
  var serviceOf = function (name) {
    var ctx = hostCtx;
    if (ctx === null || ctx === undefined) return null;
    try {
      if (typeof ctx.get === "function") {
        var found = ctx.get(name);
        if (found) return found;
      }
    } catch (error) {
      // fall through to the property read
    }
    try {
      return ctx[name] || null;
    } catch (error) {
      return null;
    }
  };

  var ENTRY_CLICK_TRIES = 12;
  var ENTRY_CLICK_DELAY_MS = 150;

  /**
   * Click THIS plugin's entry on the Plugins page once the page has mounted it.
   *
   * The click lands on the entry card's title button, which is the host's own
   * open gesture; the card itself is a list item with no handler.
   * @param {string} tag - a short tag for the diagnostic line.
   * @param {Function} done - settled with whether the click landed.
   */
  var clickPluginEntry = function (tag, done) {
    var tries = 0;
    var step = function () {
      tries += 1;
      var target = shared.pluginClickTarget(shared.pluginEntryCard(document));
      if (target !== null) {
        var landed = shared.dispatchSynthetic(target, "click");
        probeLog("settings-open", { reason: tag, kind: "panel-entry", taken: landed === true });
        done(landed === true);
        return;
      }
      if (tries >= ENTRY_CLICK_TRIES) {
        probeLog("settings-open", { reason: tag, kind: "panel-entry", taken: false });
        done(false);
        return;
      }
      globalThis.setTimeout(step, ENTRY_CLICK_DELAY_MS);
    };
    step();
  };

  /**
   * Reach this plugin's own configuration page through the HOST's navigation.
   *
   * The Plugins page is a main panel the layout service selects by id, and the
   * plugin manager publishes `pluginNavigation` for cross-plugin jumps straight
   * to a package's own page — the same service a shipped DSH feature calls for
   * exactly this gesture. Both are looked up WITHOUT being declared (see
   * `getService`): a required dependency would park this whole package on a
   * host line that ships neither.
   *
   * Order: open the Plugins panel and click this plugin's entry (its own page,
   * titled with its name); failing the click, the navigation service's package
   * page; failing both services, the caller keeps the legacy DOM chain.
   * @param {string} tag - a short tag for the diagnostic line.
   * @returns {boolean} whether a host route was taken (the entry click settles later).
   */
  var openPluginPage = function (tag) {
    var nav = serviceOf("pluginNavigation");
    var layout = serviceOf("layout");
    if (globalThis.__DFP_PROBE__ === true) {
      var raw = function (name) {
        var out = {};
        try {
          var viaGet = serviceOf(name);
          out.get = viaGet === null || viaGet === undefined ? String(viaGet) : typeof viaGet;
        } catch (error) {
          out.get = "THREW " + String(error && error.message ? error.message : error).slice(0, 80);
        }
        try {
          var direct = hostCtx === null || hostCtx === undefined ? undefined : hostCtx[name];
          out.direct = direct === null || direct === undefined ? String(direct) : typeof direct;
        } catch (error) {
          out.direct = "THREW " + String(error && error.message ? error.message : error).slice(0, 80);
        }
        return out;
      };
      probeLog("settings-routes", {
        nav: raw("pluginNavigation"),
        layout: raw("layout"),
        slots: raw("slots"),
        canNav: nav !== null && nav !== undefined && typeof nav.openBundle === "function",
        canLayout: layout !== null && layout !== undefined && typeof layout.selectPanel === "function",
      });
    }
    var canBundle = nav !== null && nav !== undefined && typeof nav.openBundle === "function";
    var canPanel = layout !== null && layout !== undefined && typeof layout.selectPanel === "function";
    if (canPanel) {
      try {
        layout.selectPanel(shared.PLUGIN_PANEL_ID);
      } catch (error) {
        canPanel = false;
      }
    }
    if (canPanel) {
      clickPluginEntry(tag, function (clicked) {
        if (clicked || !canBundle) return;
        try {
          nav.openBundle(shared.PLUGIN_BUNDLE_NAME);
          probeLog("settings-open", { reason: tag, kind: "plugin-navigation", taken: true });
        } catch (error) {
          warnSettingsMissing(tag, "the plugin navigation service refused the package");
        }
      });
      probeLog("settings-open", { reason: tag, kind: "panel-select", taken: true });
      return true;
    }
    if (canBundle) {
      try {
        nav.openBundle(shared.PLUGIN_BUNDLE_NAME);
        probeLog("settings-open", { reason: tag, kind: "plugin-navigation", taken: true });
        return true;
      } catch (error) {
        warnSettingsMissing(tag, "the plugin navigation service refused the package");
        return false;
      }
    }
    return false;
  };

  /**
   * Report a settings screen that could not be reached.
   *
   * A control that does nothing is the worst outcome, so this never returns
   * quietly: it warns (never throws) and paints the panel's own status line, the
   * same one a refused write uses.
   * @param {string} reason - a short tag for the diagnostic line.
   * @param {string} detail - why the lookup failed.
   */
  var warnSettingsMissing = function (reason, detail) {
    var message = "dsh-fonttune: could not open the plugin settings (" + reason + ": " + detail + ")";
    try {
      if (typeof console !== "undefined" && typeof console.warn === "function") console.warn(message);
    } catch (error) {
      // A host without a console still gets the status line below.
    }
    status(t("panel.settingsMissing"));
  };

  /**
   * The conversation's own anchors: the scope hint a host may mark its prose
   * with, and the hashed markdown container every supported line ships.
   *
   * The hint is what `harvestScope` names the dialog rules by where the host has
   * it; the substring form is the same fallback the stylesheet builder uses, so
   * the panel measures the very element the type axes already style.
   */
  var PROSE_HINT = "[data-dss-prose]";
  var PROSE_FALLBACK = '[class*="_markdown_" i]';

  /**
   * How many candidate regions are read before the list is handed over.
   *
   * A real session carries one prose element per message; a couple of dozen is far
   * past every distinct scroll container (they share one) while keeping a long
   * conversation from turning the reading into a scan of the whole document.
   */
  var FLOAT_BOUNDS_CANDIDATES = 24;

  /** One element's rectangle, or null when it cannot be read at all. */
  var rectOf = function (node) {
    try {
      return node.getBoundingClientRect();
    } catch (error) {
      return null;
    }
  };

  /**
   * The nearest ancestor that actually scrolls: the message list the prose lives
   * in, which is the box the user reads the conversation inside.
   *
   * `overflow-y` is read through `getComputedStyle` rather than trusted from an
   * attribute, because the shell sets it in a stylesheet — and a container styled
   * to scroll IS the region even while it has nothing to scroll yet.
   * @param {object} node - the element to walk up from (it is not counted).
   * @returns {object|null} the scroll container, or null when nothing scrolls.
   */
  var scrollParentOf = function (node) {
    var at = node;
    // A bound on the walk: a page that never ends must not spin here.
    for (var hop = 0; hop < 64; hop += 1) {
      at = at.parentElement;
      if (at === null || at === undefined) return null;
      var overflow = "";
      try {
        overflow = globalThis.getComputedStyle(at).overflowY;
      } catch (error) {
        overflow = "";
      }
      if (overflow === "auto" || overflow === "scroll") return at;
    }
    return null;
  };

  /** The window size the bounds are cut to, with the shared fallback. */
  var floatViewport = function () {
    return {
      width: globalThis.innerWidth || shared.FLOAT_VIEWPORT_W,
      height: globalThis.innerHeight || shared.FLOAT_VIEWPORT_H,
    };
  };

  /**
   * Every prose element on the page, in document order.
   *
   * A conversation holds MANY of them — one per message, and a measured real
   * session had 36. The first in document order is usually an old turn scrolled
   * thousands of pixels off screen, and its scroll container can measure zero;
   * reading the bounds from that one element alone threw both of its candidates
   * away and snapped the dot to the whole window instead of the conversation.
   * @returns {Array<object>} the prose elements (possibly empty).
   */
  var proseElements = function () {
    var found = [];
    var add = function (nodes) {
      for (var index = 0; index < nodes.length; index += 1) {
        if (found.indexOf(nodes[index]) < 0) found.push(nodes[index]);
      }
    };
    try {
      add(document.querySelectorAll(PROSE_HINT));
      add(document.querySelectorAll(PROSE_FALLBACK));
    } catch (error) {
      // A page without a queryable document keeps the empty list (the window).
    }
    return found;
  };

  /**
   * The candidate regions for the dot, best first, each with the element it was
   * measured from.
   *
   * The container is the box the conversation is DISPLAYED in, so a turn taller
   * than the screen does not make the region taller than the screen. Every prose
   * element contributes its container (deduplicated — they mostly share one), and
   * `floatBoundsFrom` takes the first candidate that survives the viewport cut,
   * which is what makes an off-screen first message harmless.
   *
   * The ELEMENT travels with the rectangle because a region change has to be
   * noticed as well as measured: the thing whose size change means "the region
   * changed" is the element the winning candidate was read from, and it is not
   * the first markdown block on the page (see `regionElement`).
   * @returns {Array<{node: object|null, rect: object|null}>} the candidates, best
   *   first, in the order `floatBoundsFrom` expects.
   */
  var floatRegions = function () {
    var prose = proseElements();
    var list = [];
    var containers = [];
    for (var index = 0; index < prose.length && list.length < FLOAT_BOUNDS_CANDIDATES; index += 1) {
      var container = scrollParentOf(prose[index]);
      if (container === null) {
        list.push({ node: prose[index], rect: rectOf(prose[index]) });
        continue;
      }
      if (containers.indexOf(container) >= 0) continue;
      containers.push(container);
      list.push({ node: container, rect: rectOf(container) });
    }
    return list;
  };

  /**
   * The candidate rectangles alone, best first.
   * @returns {Array<object|null>} the rectangles `floatBoundsFrom` picks from.
   */
  var floatBoundsRects = function () {
    var list = floatRegions();
    var rects = [];
    for (var index = 0; index < list.length; index += 1) rects.push(list[index].rect);
    return rects;
  };

  /**
   * The elements the region can be measured from: every candidate, best first.
   *
   * This is the set to WATCH. The bounds rule takes the first candidate that
   * survives the viewport cut, and which one that is can change without any
   * element the panel already follows changing size — a real session log keeps its
   * FIRST markdown block in an off-screen, zero-height scroll holder (a
   * virtualised transcript leaves its old turns there), and a conversation that
   * has not been laid out yet is a zero-height box as well. Pointing the observer
   * at "the first prose element's scroll parent" was the reported "the dot stopped
   * following": that box never changes size, so the region could open and shut
   * with the dot left on the coordinates the other shape gave it.
   *
   * Every candidate is observed, unusable ones included, because a candidate that
   * is a sliver (or has no box at all) is exactly what GROWS into the region when
   * the conversation comes back or is laid out.
   * @returns {Array<object>} the elements to watch, deduplicated, best first.
   */
  var regionTargets = function () {
    var list = floatRegions();
    var nodes = [];
    for (var index = 0; index < list.length; index += 1) {
      if (list[index].node === null || list[index].node === undefined) continue;
      if (nodes.indexOf(list[index].node) >= 0) continue;
      nodes.push(list[index].node);
    }
    return nodes;
  };

  /**
   * Whether two observed-target lists are the same boxes in the same order.
   * @param {Array<object>|null} a - the list the observer holds.
   * @param {Array<object>} b - the list resolved now.
   * @returns {boolean} true when there is nothing to re-point.
   */
  var sameTargets = function (a, b) {
    if (a === null || a === undefined) return b.length === 0;
    if (a.length !== b.length) return false;
    for (var index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) return false;
    }
    return true;
  };

  /**
   * The rectangle the dot snaps to, drags within and reads its own quadrant from.
   *
   * The conversation when it can be found, the whole window when it cannot (a
   * settings page has no prose at all): the window is what this used to be
   * everywhere, and it stays the last resort rather than the rule.
   * @returns {object} the bounds, in viewport coordinates.
   */
  var floatBounds = function () {
    return shared.floatBoundsFrom(floatBoundsRects(), floatViewport());
  };

  /**
   * Whether the user asked the page not to animate.
   *
   * The stylesheet yields to the same media query; this is what keeps the
   * classes themselves off, so a reduced-motion user gets the panel shown and
   * dropped outright instead of a two-frame blink of the start frame.
   * @returns {boolean} true when the panel must not animate.
   */
  var motionReduced = function () {
    try {
      return (
        typeof globalThis.matchMedia === "function" &&
        false
      );
    } catch (error) {
      return false;
    }
  };

  /**
   * Arm the fold: point the card's own `--dfp-clipStart` at the dot's rectangle
   * inside it, measured from the card as it is right now.
   *
   * Both animation frames read the same custom property — the enter frame and
   * the leave frame — so the unfold and the fold are the same rectangle in
   * opposite directions, whatever the card's size has become.
   * @param {object} card - the live card element.
   */
  var armClipStart = function (card) {
    var quadrant = liveQuadrant === null ? "tr" : liveQuadrant;
    var width = 0;
    var height = 0;
    try {
      width = card.offsetWidth;
      height = card.offsetHeight;
    } catch (error) {
      // An unmeasurable card keeps the flat (rest) clip; only the shape is lost.
    }
    try {
      card.style.setProperty(
        "--dfp-clipStart",
        shared.floatClipStart(width, height, quadrant, shared.FLOAT_DOT)
      );
    } catch (error) {
      // A card without a style face falls back to the flat clip in the sheet.
    }
  };

  /**
   * The state the panel shows: the document overlaid with the local moves,
   * so the panel always agrees with the page.
   */
  var readState = function () {
    var snap = { value: {}, writable: false };
    try {
      snap = scope.getSnapshot() || snap;
    } catch (error) {
      // An unready scope reads as an empty, read-only document.
    }
    var raw = snap.value !== null && typeof snap.value === "object" ? snap.value : {};
    var config = normalizeConfig(shared.overlayPendingValues(raw, pendingLocalValues));
    var stored = config[PRESETS_FIELD];
    var list = Array.isArray(stored) && stored.length > 0
      ? stored
      : DEFAULT_PRESET_NAMES.map(function (name) {
          return { name: name, values: {}, savedAt: 0 };
        });
    var activeName = config[ACTIVE_PRESET_FIELD];
    var known = false;
    for (var index = 0; index < list.length; index += 1) {
      if (list[index].name === activeName) known = true;
    }
    if (!known) activeName = list[0].name;
    return { config: config, presetList: list, activeName: activeName, writable: snap.writable === true };
  };

  var status = function (text) {
    var node = host.querySelector(".dfp-floatStatus");
    if (!node) return;
    node.textContent = text;
    if (statusTimer !== null) globalThis.clearTimeout(statusTimer);
    if (text !== "") {
      statusTimer = globalThis.setTimeout(function () {
        statusTimer = null;
        var live = host.querySelector(".dfp-floatStatus");
        if (live) live.textContent = "";
      }, 4000);
    }
  };

  var reportError = function (message) {
    status(t("panel.writeFailed", { message: message }));
  };

  /**
   * The document's stored position, normalized ("" when unset).
   * @returns {string} the `"x,y"` text or "".
   */
  var readDocPos = function () {
    try {
      var snap = scope.getSnapshot() || {};
      var raw = snap.value !== null && typeof snap.value === "object" ? snap.value : {};
      var text = typeof raw[PANEL_POS_FIELD] === "string" ? raw[PANEL_POS_FIELD] : "";
      return shared.normalizePanelPos(text);
    } catch (error) {
      return "";
    }
  };

  /**
   * The document's remembered corner, normalized ("" when it names none).
   * @returns {string} one of "tl"/"tr"/"bl"/"br", or "".
   */
  var readDocCorner = function () {
    try {
      var snap = scope.getSnapshot() || {};
      var raw = snap.value !== null && typeof snap.value === "object" ? snap.value : {};
      return shared.normalizePanelCorner(raw[PANEL_CORNER_FIELD]);
    } catch (error) {
      return "";
    }
  };

  /**
   * The document's stored size, normalized ("" when unset).
   * @returns {string} the `"w,h"` text or "".
   */
  var readDocSize = function () {
    try {
      var snap = scope.getSnapshot() || {};
      var raw = snap.value !== null && typeof snap.value === "object" ? snap.value : {};
      var text = typeof raw[PANEL_SIZE_FIELD] === "string" ? raw[PANEL_SIZE_FIELD] : "";
      return shared.normalizePanelSize(text);
    } catch (error) {
      return "";
    }
  };

  /**
   * Adopt the document's position and corner when they moved without us.
   *
   * Skipped mid-drag (the pointer owns the element until release). Our own
   * writes set `pos`/`corner` before they are sent, so their echo matches and
   * is a no-op; anything else is an edit from elsewhere and becomes the truth.
   *
   * A position that ARRIVED here is not a rest position yet: it is a corner
   * only if it happens to be one, and a value an older build stored under the
   * window's own corners never is. The caller settles it (see
   * `settleOnCorner`); the return value is what says whether there is anything
   * to settle, so no ordinary snapshot pays for the measurement.
   *
   * A corner that arrived is the dot's new IDENTITY — another writer moved the
   * dot to another corner — so it settles too, even when the position text did
   * not change: the dot has to be put back on the corner the document names.
   * @returns {boolean} true when the document handed over something new.
   */
  var adoptDocPos = function () {
    if (drag !== null || resize !== null) return false;
    var text = readDocPos();
    // A document that HOLDS what we last sent confirms it, whether or not the
    // text is one this panel has seen before: clearing the marker here is what
    // keeps a write the host echoed back unchanged from shielding every later
    // write of that same position (a collapse would then find the document
    // disagreeing and store nothing at all).
    if (text === pendingWrite) pendingWrite = null;
    var cornerText = readDocCorner();
    if (cornerText === pendingCorner) pendingCorner = null;
    var moved = false;
    if (cornerText !== lastSeenCorner) {
      lastSeenCorner = cornerText;
      corner = shared.parsePanelCorner(cornerText);
      moved = true;
    }
    if (text === lastSeenDoc) return moved;
    lastSeenDoc = text;
    pos = shared.parsePanelPos(text);
    moved = true;
    var sizeText = readDocSize();
    if (sizeText !== lastSeenSize) {
      lastSeenSize = sizeText;
      if (sizeText === pendingSizeWrite) pendingSizeWrite = null;
      liveSize = null;
    }
    return moved;
  };

  /**
   * Persist the position and the corner on collapse, when either is dirty.
   *
   * Collapse is the moment a move becomes final without a drag-end write of
   * its own (a drag that never saw its pointerup, a nudge from elsewhere):
   * if what we show is not what the document holds, one write closes the gap —
   * both fields in ONE `mutate`, so the dot's identity and its coordinates can
   * never be stored apart from each other.
   */
  var persistIfDirty = function () {
    var state;
    try {
      state = readState();
    } catch (error) {
      return;
    }
    if (!state.writable) return;
    var changes = {};
    var cur = pos === null ? "" : pos.x + "," + pos.y;
    if (cur !== lastSeenDoc && cur !== pendingWrite) {
      pendingWrite = cur;
      changes[PANEL_POS_FIELD] = cur;
    }
    if (corner !== null && corner !== lastSeenCorner && corner !== pendingCorner) {
      pendingCorner = corner;
      changes[PANEL_CORNER_FIELD] = corner;
    }
    if (Object.keys(changes).length > 0) {
      writeSingleShot(scope, state.presetList, state.activeName, changes, {
        mirror: false,
        onError: reportError,
      });
    }
    var sizeCur = liveSize === null ? "" : liveSize.w + "," + liveSize.h;
    if (sizeCur !== "" && sizeCur !== lastSeenSize && sizeCur !== pendingSizeWrite) {
      pendingSizeWrite = sizeCur;
      writeSingleShot(scope, state.presetList, state.activeName, { panelSize: sizeCur }, {
        mirror: false,
        onError: reportError,
      });
    }
  };

  /**
   * The coordinates of the corner the dot LIVES in, naming it when nothing has.
   *
   * This is the single line where "the corner is the identity and the position is
   * its consequence" is carried out: the remembered corner is turned into a
   * position inside the region AS IT IS NOW, so a sidebar folding away moves the
   * dot to the new coordinates of the SAME corner instead of letting the
   * coordinates the old region gave it vote for a different one (the reported
   * "it was bottom-right, the panel opened, and shutting it landed bottom-left").
   *
   * Only a document that never named a corner gets one derived here — from where
   * the dot is at this moment — and that answer is remembered and stored, so the
   * question is asked once in the life of a document (`PANEL_CORNER_FIELD`).
   * @param {object} bounds - the region, as `floatBounds` returns it.
   * @param {{x: number, y: number}} at - where the dot is right now.
   * @returns {{x: number, y: number}} the top-left of the dot on its own corner.
   */
  var cornerHome = function (bounds, at) {
    if (corner === null) corner = shared.floatNearestCorner(bounds, at.x, at.y);
    return shared.floatCornerPoint(bounds, corner);
  };

  /**
   * Whether the dot is sitting on the corner it lives in, in this region.
   *
   * The one question the settle and the card's own anchor both ask, so "is it
   * parked?" has one answer: a dot that is (a rest position in the current
   * region) is drawn from its remembered corner, and one that is not is drawn
   * from where it actually is (a drag in flight, a position just adopted).
   * @param {object} bounds - the region, as `floatBounds` returns it.
   * @param {{x: number, y: number}} at - the dot's live top-left.
   * @param {string} name - the corner to compare against.
   * @returns {boolean} true when the two agree within the rounding slack.
   */
  var restingOnCorner = function (bounds, at, name) {
    var point = shared.floatCornerPoint(bounds, name);
    return (
      Math.abs(at.x - point.x) <= FLOAT_CORNER_SLACK &&
      Math.abs(at.y - point.y) <= FLOAT_CORNER_SLACK
    );
  };

  /**
   * Which corner the open card is anchored on.
   *
   * The remembered corner when the dot is resting on it in this region, and the
   * dot's own coordinates otherwise. A separate function rather than an extra
   * branch inside `render`: that function names the CARD's anchored corner
   * `corner`, and a local of that name would shadow the dot's identity here.
   * @param {object} bounds - the region, as `floatBounds` returns it.
   * @param {{x: number, y: number}} at - the dot's live top-left.
   * @param {string} fallback - the quadrant the coordinates alone call for.
   * @returns {string} one of "tl", "tr", "bl", "br".
   */
  var dotQuadrant = function (bounds, at, fallback) {
    if (corner !== null && pos !== null && restingOnCorner(bounds, pos, corner)) return corner;
    return fallback;
  };

  /**
   * Snap the dot to the corner it LIVES in, with a short slide.
   *
   * The corners are the CONVERSATION's, not the window's: with sidebars on either
   * side and a top bar, the window's corners sit on chrome the dot has no
   * business on (see `floatBounds`). The snapped corner is what the next expand
   * grows away from, so the card always lands inside the conversation.
   *
   * The corner comes from the identity, never from a fresh vote: a collapse
   * after the region has changed shape must land on the SAME corner, recomputed
   * for the region as it is now (see `cornerHome`). With nothing remembered the
   * corner is named from where the dot actually is, once.
   *
   * Called on collapse, on drag-end and when the region itself changes shape: the
   * position write follows in the same gesture (see the callers).
   *
   * With nothing stored the dot is already drawn in the stylesheet's default
   * corner: it is pinned exactly where it renders rather than snapped, because
   * a rect read before layout (or with the host hidden) is all zeros and used
   * to send the dot to the top-left corner the user never asked for.
   * @returns {{x: number, y: number}} the corner the dot now sits on.
   */
  var snapToCorner = function () {
    var bounds = floatBounds();
    var snapped;
    if (pos !== null) {
      snapped = cornerHome(bounds, pos);
    } else {
      snapped = {
        x: Math.round(bounds.right - shared.FLOAT_MARGIN - shared.FLOAT_DOT),
        y: Math.round(bounds.bottom - shared.FLOAT_MARGIN - shared.FLOAT_DOT),
      };
      try {
        var rect = host.getBoundingClientRect();
        if (rect.left > 0 || rect.top > 0) {
          snapped = { x: Math.round(rect.left), y: Math.round(rect.top) };
        }
      } catch (error) {
        // An unreadable rect keeps the default corner.
      }
      // The pinned position is the dot's own answer to which corner it is in.
      if (corner === null) corner = shared.floatNearestCorner(bounds, snapped.x, snapped.y);
    }
    pos = snapped;
    try {
      host.classList.add("dfp-floatSnap");
    } catch (error) {
      // A host without classes still lands on the snapped corner.
    }
    host.style.right = "";
    host.style.bottom = "";
    host.style.left = snapped.x + "px";
    host.style.top = snapped.y + "px";
    return snapped;
  };

  /**
   * Write the live position and corner once (a drag-end).
   *
   * ONE call for both fields: the dot's identity and the coordinates it implies
   * are one fact, and storing them apart could leave a document naming a corner
   * it does not sit on. `mirror: false` keeps chrome out of presets, and a field
   * the document already holds is left out of the write entirely.
   * @param {object} live - the state to mirror alongside the write.
   */
  var writeLivePos = function (live) {
    if (pos === null) return;
    var changes = {};
    var cur = pos.x + "," + pos.y;
    if (cur !== pendingWrite) {
      pendingWrite = cur;
      changes[PANEL_POS_FIELD] = cur;
    }
    if (corner !== null && corner !== lastSeenCorner && corner !== pendingCorner) {
      pendingCorner = corner;
      changes[PANEL_CORNER_FIELD] = corner;
    }
    if (Object.keys(changes).length === 0) return;
    writeSingleShot(scope, live.presetList, live.activeName, changes, {
      mirror: false,
      onError: reportError,
    });
    status(t("panel.moved"));
  };

  // The re-snap a region change asks for, and the observer that asks for it.
  var reflowTimer = null;
  var regionObserver = null;
  // The boxes the observer holds, in the order `regionTargets` resolved them.
  var observedRegion = null;
  // Whether the un-losable line (the body) is in the observed set as well.
  var observedBody = null;
  // The low-frequency fallback and the winning rectangle it last looked at.
  var pollTimer = null;
  var pollBounds = null;
  // Whether the first rectangle has already been read: the reading that ARMS the
  // comparison, at mount, never settles anything by itself.
  var armed = false;

  /**
   * Put the dot back on the corner it LIVES in, whenever it is not on it.
   *
   * ONE rule, asked by every path that ends a gesture or a panel state: the dot
   * RESTS on one of the region's four corners — that is where a collapse and a
   * drag-end leave it, and it is the corner the next expand grows away from. A
   * window resize, a sidebar folding away or a top bar appearing moves those
   * corners with no gesture of the user's; opening the panel grows the card out
   * of the corner the dot sits on; a document edited from outside (a value an
   * older build stored under the window's own corners, a position another
   * writer put there) and a drag the browser CANCELLED all leave a position
   * behind that no gesture chose. Each of them asks this one question, so the
   * dot cannot be left lying in the middle of the region by any of them.
   *
   * Which corner that is has a single answer: the remembered one. A region that
   * changed shape moved the corner the dot sits on — a conversation that got
   * narrower has its bottom-right corner somewhere else — and the dot is carried
   * to the NEW coordinates of the SAME corner. It is deliberately NOT asked
   * which corner is nearest: the coordinates the old region gave it can sit on
   * the other side of the new region's middle, so a fresh vote here is what
   * turned "bottom-right, panel opened, panel shut" into a dot that had moved to
   * the bottom-left. Only a release the user made re-decides, and only a
   * document that never named a corner has one derived here — from where the dot
   * is — which is then remembered and stored (`cornerHome`).
   *
   * The condition is "not on its corner yet", NOT "outside the region". Inside is
   * not the same as parked: a position that is neither corner — one an older
   * build stored under the window's own corners, or one read from a document
   * while the region was a different shape — is inside the region at every
   * resize and so was passed over by every reflow, for as long as the panel
   * lived. The move is ONE snap, and it persists through the ordinary one-write
   * path: `persistIfDirty` only ever stores what the document does not already
   * hold, so a run of resizes cannot write per frame.
   *
   * A region change is the one caller that SAYS SO (`regionMoved`), and that flag
   * is what makes the new coordinates reach the document. A region that grew
   * leaves the dot between its corners: the move is real — the same identity now
   * has other numbers — but it is not a move OUT of the region, so the older rule
   * stored nothing and the document kept the coordinates of a shape that no
   * longer exists. The next mount then reads that position back as one of its
   * own. So a region-driven settle stores what it moved; a position the DOCUMENT
   * handed over (an edit from outside, a value an older build left) is still
   * painted on the corner and left there — one writer does not argue with
   * another. Nothing is written when nothing moved: `persistIfDirty` only ever
   * stores what the document does not already hold.
   *
   * With nothing stored the dot has to be MEASURED instead of read, because the
   * stylesheet parks it in the window's own corner — and an all-zero rect (a
   * hidden host, a read before the first paint) is no measurement at all: a
   * panel that is switched off must not be moved or stored.
   *
   * A gesture owns the dot for as long as it lasts: a drag in flight is left
   * exactly where the pointer put it (see `startDrag`), on every path.
   * @param {boolean} [regionMoved] - true when the REGION changed shape under the
   *   dot rather than the document handing it a position.
   * @returns {boolean} true when the dot was moved onto its corner.
   */
  var settleOnCorner = function (regionMoved) {
    if (drag !== null || resize !== null) return false;
    var bounds = floatBounds();
    var at = pos;
    if (at === null) {
      var rect = rectOf(host);
      if (
        rect === null ||
        (rect.left === 0 && rect.top === 0 && rect.width === 0 && rect.height === 0)
      ) {
        return false;
      }
      at = { x: rect.left, y: rect.top };
    }
    // The corner the dot lives in, at the coordinates THIS region gives it. A
    // dot already on it has nothing to do here; the region only moved the
    // corner under it, so it has to be moved to the new one and stored.
    var target = cornerHome(bounds, at);
    // A document that stored a position BEFORE the corner was a field of its own
    // (or that another writer moved) still has to name one: the identity is what
    // every later region change reads, so it is derived here — once, from where
    // the dot is — and stored. `pos !== null` is what tells the two apart: a
    // page that stored nothing at all has nothing to migrate, and stays
    // untouched until the dot first moves.
    var naming = corner !== null && corner !== lastSeenCorner && pos !== null;
    var settled =
      Math.abs(at.x - target.x) <= FLOAT_CORNER_SLACK &&
      Math.abs(at.y - target.y) <= FLOAT_CORNER_SLACK;
    if (settled) {
      // A dot already on its corner has nothing to MOVE — the one write left is
      // the identity itself, so a region change can never be what derives a
      // corner at coordinates the region it was chosen in no longer has.
      if (naming) persistIfDirty();
      return false;
    }
    var outside = !(
      at.x >= bounds.left - 0.5 &&
      at.y >= bounds.top - 0.5 &&
      at.x + shared.FLOAT_DOT <= bounds.right + 0.5 &&
      at.y + shared.FLOAT_DOT <= bounds.bottom + 0.5
    );
    pos = { x: Math.round(at.x), y: Math.round(at.y) };
    snapToCorner();
    // Both fields in ONE write: the dot is on the corner and the document is
    // told which corner that is, in the same `mutate`. A region that changed
    // shape is the caller that has to store the move it just made, wherever the
    // dot was standing before (see the note above).
    if (outside || naming) persistIfDirty();
    if (regionMoved === true) persistIfDirty();
    return true;
  };

  /**
   * The re-snap a region change asks for, with the card rebuilt around it.
   *
   * The card is measured against the dot's corner, so a panel that is OPEN when
   * the region moves has to be laid out again around the corner the dot just
   * moved to; a shut panel has nothing to rebuild.
   *
   * This is the ONE caller that tells the settle the REGION is what moved the dot,
   * in either direction: a region that narrowed and one that grew both re-place
   * the dot on its remembered corner and store the coordinates that corner has
   * now — a dot left INSIDE the new region is a dot that still has to be moved
   * and stored, so "is it inside?" is not the question here (see
   * `settleOnCorner`).
   */
  var reflowIntoBounds = function () {
    if (!settleOnCorner(true)) return;
    if (open) render();
  };

  /**
   * Keep the observer on every box the region can be measured from, plus the one
   * box that can never be taken away from it.
   *
   * The conversation element is rebuilt per session, so the targets are resolved
   * again on every change instead of being pinned once at mount. What is resolved
   * is the CANDIDATE SET the bounds are picked from (`regionTargets`), never the
   * first prose element's scroll parent: on a real session log that block lives in
   * an off-screen, zero-height holder, and an observer pointed at it is deaf — the
   * region could change shape with the dot left behind.
   *
   * The CANDIDATE SET alone is not enough, and this is the hole the third report
   * came through: a host that REPLACES the whole conversation element (a re-render,
   * a session switch, a layout swap) leaves every observed box detached, and a
   * detached box never resizes again — while re-resolving the targets can only
   * happen inside the callback that will never be called. The line out of that loop
   * is to hold, permanently, a box the host cannot replace: the body. It cannot be
   * removed from a live document, so it always has one more chance to fire, it
   * takes the SAME settle path as a candidate change, and that path re-resolves the
   * candidates and re-points the observer at the new nodes. The body is what the
   * bounds fall back to anyway on a page with no prose at all (a settings page).
   *
   * A DETACHED OBSERVED NODE HANDS OVER ONE LAST TIME. A browser delivers an
   * observed box one final `0x0` notification as it leaves the tree (measured on
   * this rig: it does so for a direct removal and for the removal of any ancestor),
   * which is the callback that re-resolves the candidates onto the replacement. That
   * is why the swap-in-one-task case already worked — and why it is not enough on
   * its own: it only helps if something was still observed when the removal happened.
   * A re-render that takes the conversation out and mounts the next one in a LATER
   * task leaves the panel with NO candidate for the whole gap, watching the body
   * alone — and a shell whose sidebar moves does not move the body's own box, so the
   * layout the remount brings reaches no observer at all. That gap is what the
   * low-frequency fallback below is for, and what the `watchRegion`/`pollRegion`
   * pair together make impossible to be deaf to.
   *
   * Re-pointing is idempotent: a call whose target set (body included) is unchanged
   * keeps the observer it has, so the echo of a change cannot rebuild one per
   * callback. The set is compared by IDENTITY, and a box that is no longer in the
   * document counts as changed — the whole point of the resolve is a set that was
   * replaced.
   */
  var watchRegion = function () {
    if (typeof globalThis.ResizeObserver !== "function") return;
    var body = document.body === undefined ? null : document.body;
    var targets = regionTargets();
    if (body !== null && targets.indexOf(body) < 0) targets.push(body);
    if (sameTargets(observedRegion, targets) && observedBody === body && targetsUnchanged(targets)) {
      return;
    }
    try {
      if (regionObserver === null) {
        regionObserver = new globalThis.ResizeObserver(function () {
          scheduleReflow();
        });
      } else {
        regionObserver.disconnect();
      }
      observedRegion = targets;
      observedBody = body;
      for (var index = 0; index < targets.length; index += 1) {
        regionObserver.observe(targets[index]);
      }
    } catch (error) {
      // A host without a usable observer keeps the debounced resize listener.
      regionObserver = null;
      observedRegion = null;
      observedBody = null;
    }
  };

  /**
   * Whether every observed box is still in the document.
   *
   * An observer holds a node, not a position in the tree: a box the host removed
   * (a re-render swapping the conversation element) is a box that will never
   * report a size again, so a set that still LOOKS the same is a set that has to be
   * resolved again. A detached box is exactly the state the body line above exists
   * to survive, and this is where the resolve gets its chance the moment a live
   * callback arrives with the old set still in hand. The rule itself is shared, so
   * it is stated once (`shared.floatTargetsConnected`).
   *
   * @param {Array<object>} targets - the resolved set.
   * @returns {boolean} true when nothing in it was taken away.
   */
  var targetsUnchanged = function (targets) {
    return shared.floatTargetsConnected(document, targets);
  };

  /**
   * Ask for a reflow soon, once.
   *
   * The burst of sizes a sidebar fold produces has to end in ONE snap and ONE
   * write, so every request re-arms the same timer rather than queueing work.
   */
  var scheduleReflow = function () {
    if (typeof globalThis.setTimeout !== "function") return;
    if (reflowTimer !== null) globalThis.clearTimeout(reflowTimer);
    reflowTimer = globalThis.setTimeout(function () {
      reflowTimer = null;
      watchRegion();
      reflowIntoBounds();
    }, FLOAT_REFLOW_MS);
  };

  var onViewResize = function () {
    scheduleReflow();
  };

  /**
   * Whether two readings of the winning rectangle are the same shape.
   *
   * The four numbers and nothing else: this runs on a timer, so it may not touch
   * the document, the style sheet or the settings document — it is a comparison of
   * what a rectangle already cost to read. The rule is shared with the offline
   * suite, so it is stated once (`shared.sameWatchBounds`).
   * @param {object|null} a - the rectangle read last time (null before the first
   *   reading, and a null rectangle measures as nothing).
   * @param {object|null} b - the rectangle read now.
   * @returns {boolean} true when a settle would have nothing new to answer.
   */
  var sameWatchBounds = function (a, b) {
    // A counter for the live proof only: how many times the fallback actually took a
    // MEASUREMENT. Nothing in the bundle reads it back, and it is cheap on purpose.
    if (globalThis !== undefined && globalThis !== null) {
      globalThis.__dfpPollTicks = (globalThis.__dfpPollTicks || 0) + 1;
    }
    return shared.sameWatchBounds(a, b);
  };

  /**
   * The fallback the observer cannot replace: read the rectangle on a timer.
   *
   * The one thing an observer on a live document can never notice is its own
   * target being taken away — the node is detached, so it stops reporting, and the
   * code that would find its replacement lives in the callback that will not come.
   * This tick is outside that loop: it resolves the candidates from the document
   * every time, so a host that swaps the conversation element is caught within one
   * interval whatever the observer is still holding.
   *
   * It does ONE cheap thing when nothing changed — four number comparisons against
   * the rectangle it read last time — and nothing else: no style resolution, no
   * re-render, no write. Only a RECTANGLE THAT MOVED goes on to the ordinary settle
   * (`scheduleReflow`, the same debounced path every observer callback takes), and
   * that path stores a position only when the dot actually moved. There is no
   * periodic write of any kind.
   *
   * A hidden page paints nothing and moves nothing, so it is not even read: the
   * tick returns at once, and the page becoming visible again takes one reading
   * immediately rather than waiting out the interval.
   */
  var pollRegion = function () {
    if (document.hidden === true) return;
    // A settle is already on its way (an observer fired, the window resized), so
    // this reading would only duplicate work it is about to do anyway.
    if (reflowTimer !== null) return;
    var bounds = floatBounds();
    if (sameWatchBounds(pollBounds, bounds)) return;
    pollBounds = bounds;
    // The first reading only arms the comparison: at mount the dot has not been
    // settled yet, and a rectangle that has not MOVED must never be a reason to
    // place one.
    if (armed === false) return;
    scheduleReflow();
  };

  /** One immediate reading, for the page coming back from hidden. */
  var onVisibility = function () {
    if (document.hidden === true) return;
    pollBounds = null;
    pollRegion();
  };

  /**
   * The leave animation's last step: drop the card the shrink left behind.
   *
   * Runs from the timer `setOpen` armed, never synchronously.
   */
  var endLeave = function () {
    closeTimer = null;
    leaving = false;
    if (!open) render();
  };

  /**
   * Start the leave animation: the card folds back into the dot and fades, and
   * the dot fades back in over the same span.
   *
   * The class lands two frames late ON PURPOSE. Shutting very often happens in
   * the same task that RENDERED the card — a tap on the dot ends a drag and
   * rebuilds the card first — and a freshly built element has no resolved
   * "before" style yet: a class added in that same task paints the end state
   * straight away, which is why the open animated and the close looked instant.
   * Two frames put a paint between the render and the class, which is exactly
   * what a transition needs, and the fold then plays the enter's own rectangle
   * backwards — on the leave class's longer, gentler curve, so shutting down
   * takes its time instead of matching the eager unfold.
   */
  var startLeave = function () {
    if (open) return;
    var card = host.querySelector(".dfp-floatCard");
    if (card === null || card === undefined || typeof card.classList === "undefined") {
      endLeave();
      return;
    }
    // The fold ends on the dot's CURRENT rectangle, so the property is measured
    // again here rather than trusted from the render that built the card.
    armClipStart(card);
    card.classList.add("dfp-floatCardLeave");
    // The dot comes back on the same two frames and over the same span as the
    // fold, so the two cross-fades end together. It is a live element (the
    // render that opened the panel built it), never a rebuilt one.
    var dot = host.querySelector(".dfp-dot");
    if (dot !== null && dot !== undefined && typeof dot.classList !== "undefined") {
      dot.classList.remove("dfp-dotAway");
      dot.classList.add("dfp-dotBack");
    }
  };

  /**
   * Queue `startLeave` for after the next paint; a timer stands in where the
   * frame callback is missing.
   */
  var playLeave = function () {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(function () {
        globalThis.requestAnimationFrame(startLeave);
      });
      // Same guard as the enter frame: a browser that stopped painting this tab
      // must still fold the card away (and drop it on time) instead of leaving
      // it fully open until the timer takes it.
      globalThis.setTimeout(startLeave, FLOAT_SETTLE_MS);
      return;
    }
    globalThis.setTimeout(startLeave, 16);
  };

  /**
   * Open or shut the panel. Opening never touches the position; shutting
   * snaps the dot to its corner and persists it first (see `snapToCorner`),
   * then plays the leave animation (`startLeave`).
   *
   * A drag past the click threshold owns the gesture: toggles arriving
   * mid-drag are ignored, so dragging never replays the open animation.
   * @param {boolean} next - the state to take.
   */
  var setOpen = function (next) {
    if (drag !== null && drag.moved) return;
    if (open === next) {
      render();
      return;
    }
    open = next;
    floatStoreOpen(open);
    if (!open) {
      snapToCorner();
      persistIfDirty();
      var card = host.querySelector(".dfp-floatCard");
      // A reduced-motion user gets the card dropped outright, without the two
      // frames of start frame the fold would have to blink through.
      if (card !== null && typeof card.classList !== "undefined" && !motionReduced()) {
        // The resting card carries no clip at all, and an inline clip beats the
        // leave class — while `none` would not interpolate either. Putting the
        // shared rest shape back here, two frames before the class lands, is
        // visually identical (it is the same rounded box) and gives the fold a
        // value to leave from.
        try {
          card.style.clipPath = "";
        } catch (error) {
          // A card without a style face still folds through the class.
        }
        // `leaving` is what keeps the card alive: the snapshot guard skips
        // rebuilds while it is set, and the timer below drops the card once the
        // fold has played out.
        leaving = true;
        if (closeTimer !== null) globalThis.clearTimeout(closeTimer);
        closeTimer = globalThis.setTimeout(endLeave, FLOAT_LEAVE_MS);
        playLeave();
        return;
      }
    } else {
      // The card grows AWAY from the dot's own corner, so that corner has to be
      // a real one before the unfold starts: a dot something left off-corner (a
      // document written by an older build, an edit from outside, a gesture the
      // browser cancelled) would otherwise unfold the card in the middle of the
      // conversation. An ordinary open — the dot already on its corner — moves
      // nothing at all.
      settleOnCorner();
      playEnter = true;
      if (closeTimer !== null) {
        globalThis.clearTimeout(closeTimer);
        closeTimer = null;
      }
      leaving = false;
    }
    render();
  };

  var commit = function (changes, options) {
    var state = readState();
    if (!state.writable) return;
    var settings = options !== null && typeof options === "object" ? options : {};
    if (settings.mirror === undefined) settings.mirror = true;
    settings.onError = reportError;
    writeSingleShot(scope, state.presetList, state.activeName, changes, settings);
    render();
  };

  var sliderRow = function (body, labelText, valueText, min, max, step, value, onRelease) {
    var row = el("div", "dfp-floatRow");
    var label = el("div", "dfp-floatLabel");
    label.appendChild(el("span", null, labelText));
    var shown = el("span", "dfp-floatValue", valueText);
    label.appendChild(shown);
    row.appendChild(label);
    var input = el("input", "dfp-floatSlider");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute("aria-label", labelText);
    input.addEventListener("input", function () {
      shown.textContent = input.value;
    });
    input.addEventListener("change", function () {
      onRelease(Number(input.value));
    });
    row.appendChild(input);
    body.appendChild(row);
    return { row: row, input: input, shown: shown };
  };

  /**
   * Start a dot drag from a press on the dot or the card head.
   *
   * A press below the click threshold is a click, not a drag: the pointer
   * may not move the element and no animation may replay. Past the threshold
   * the gesture is a drag for its whole life — toggles arriving mid-drag are
   * ignored (see `setOpen`) and the click the browser fires on release is
   * swallowed (see `suppressClick`). Release snaps to the nearest corner and
   * writes ONE position (never one write per pixel).
   * @param {object} event - the pointerdown event.
   * @param {object} handle - the element to capture the pointer on.
   * @param {boolean} writable - whether a drag-end write is allowed.
   */
  var startDrag = function (event, handle, writable) {
    if (drag !== null || resize !== null) return;
    if (!writable) return;
    if (event.button !== undefined && event.button !== 0) return;
    var rect = host.getBoundingClientRect();
    drag = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    try {
      host.classList.remove("dfp-floatSnap");
    } catch (error) {
      // A host without classes drags all the same.
    }
    host.style.right = "";
    host.style.bottom = "";
    host.style.left = rect.left + "px";
    host.style.top = rect.top + "px";
    if (pos === null) pos = { x: Math.round(rect.left), y: Math.round(rect.top) };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch (captureError) {
      // A host without pointer capture still drags via the window listener.
    }
    var move = function (at) {
      if (drag === null) return;
      if (!drag.moved) {
        if (!shared.floatDragExceeded(at.clientX - drag.startX, at.clientY - drag.startY)) return;
        drag.moved = true;
        suppressClick = true;
      }
      // The pointer is clamped to the conversation, so a drag cannot park the dot
      // on a sidebar or behind the top bar in the first place.
      var bounds = floatBounds();
      var maxX = Math.max(bounds.left, bounds.right - shared.FLOAT_DOT);
      var maxY = Math.max(bounds.top, bounds.bottom - shared.FLOAT_DOT);
      var x = Math.round(Math.max(bounds.left, Math.min(maxX, at.clientX - drag.dx)));
      var y = Math.round(Math.max(bounds.top, Math.min(maxY, at.clientY - drag.dy)));
      host.style.left = x + "px";
      host.style.top = y + "px";
      pos = { x: x, y: y };
    };
    // A pointerup the page never sees (released off-window, a cancelled
    // gesture) must still end the drag: anything less wedges every later
    // render behind a drag that is long over.
    var end = function (write) {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", up);
      globalThis.removeEventListener("pointercancel", cancelled);
      globalThis.removeEventListener("blur", blurred);
      var wasMoved = drag !== null && drag.moved;
      drag = null;
      if (pos === null) {
        render();
        return;
      }
      if (!write) {
        // A gesture the browser cancelled (or a window that lost focus) is over
        // without being committed: nothing is stored — the document keeps the
        // last position it was given — but the dot may not REST where the
        // pointer left it either, or the next open would grow the card out of
        // the middle of the conversation.
        if (wasMoved) settleOnCorner();
        render();
        return;
      }
      if (!wasMoved) {
        render();
        return;
      }
      // A release is the ONE moment the dot's corner is chosen afresh: the user
      // put it somewhere with their own hand, so the nearest corner of the
      // region is where it lives from now on. Every other path reads the
      // remembered corner instead (see `settleOnCorner`), which is what keeps a
      // region change from re-deciding it from stale coordinates.
      corner = shared.floatNearestCorner(floatBounds(), pos.x, pos.y);
      snapToCorner();
      var live = readState();
      writeLivePos(live);
      render();
    };
    var up = function () {
      // Only the dot toggles on a tap; the card head shares this gesture for
      // moving and must not collapse when it is merely pressed.
      var tapped = drag !== null && !drag.moved &&
        !!(handle.classList && handle.classList.contains("dfp-dot"));
      end(true);
      if (tapped) {
        // The click the browser would fire next is already dead: `end()` just
        // rebuilt the dot it was aimed at, so a press could never toggle through
        // the click listener. Toggle here instead, and swallow the click as well
        // in case it still arrives. (Keyboard Enter/Space keeps working through
        // the click listener, which never sees a pointerdown.) The flag resets on
        // the next tick so a later keyboard press is never eaten by a stale flag.
        suppressClick = true;
        globalThis.setTimeout(function () {
          suppressClick = false;
        }, 0);
        setOpen(!open);
      }
    };
    var cancelled = function () {
      end(false);
    };
    var blurred = function () {
      end(false);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up);
    globalThis.addEventListener("pointercancel", cancelled);
    // A release the page never sees (off-window without capture, a lost
    // focus) must still end the drag when the window loses focus.
    globalThis.addEventListener("blur", blurred);
    event.preventDefault();
  };

  /**
   * Start an edge resize from a press on a card handle.
   *
   * The card follows the pointer live; the document gets ONE size write on
   * release, next to the position field, restored on the next open.
   *
   * Sizes are content-box throughout (`style.width`/`style.height`): starting
   * from the border-box rect would fold the padding and border into the value
   * on every gesture, growing the card by that chrome each time.
   * @param {object} event - the pointerdown event.
   * @param {string} mode - "w", "h" or "wh".
   * @param {object} box - the positioned layer that owns the size (the shadow
   *   wrapper; the card fills it).
   * @param {object} card - the card being resized.
   */
  var startResize = function (event, mode, box, card) {
    if (drag !== null || resize !== null) return;
    if (event.button !== undefined && event.button !== 0) return;
    var base = null;
    try {
      var cs = globalThis.getComputedStyle(card);
      var cw = parseFloat(cs.width);
      var ch = parseFloat(cs.height);
      if (isFinite(cw) && isFinite(ch)) base = { w: Math.round(cw), h: Math.round(ch) };
    } catch (styleError) {
      base = null;
    }
    if (base === null) {
      var fellBack = card.getBoundingClientRect();
      base = { w: Math.round(fellBack.width), h: Math.round(fellBack.height) };
    }
    resize = { startX: event.clientX, startY: event.clientY, w: base.w, h: base.h, mode: mode, moved: false };
    liveSize = liveSize || docSize(configOfResize());
    if (liveSize === null) liveSize = { w: base.w, h: 0 };
    try {
      card.setPointerCapture(event.pointerId);
    } catch (captureError) {
      // A card without pointer capture still resizes via the window listener.
    }
    var move = function (at) {
      if (resize === null) return;
      resize.moved = true;
      var w = resize.w;
      var h = resize.h;
      if (resize.mode === "w" || resize.mode === "wh") {
        w = Math.min(shared.PANEL_SIZE_MAX_W, Math.max(shared.PANEL_SIZE_MIN_W, Math.round(resize.w + at.clientX - resize.startX)));
      }
      if (resize.mode === "h" || resize.mode === "wh") {
        h = Math.min(shared.PANEL_SIZE_MAX_H, Math.max(shared.PANEL_SIZE_MIN_H, Math.round(resize.h + at.clientY - resize.startY)));
      }
      liveSize = { w: w, h: h };
      // The viewport cap rides the live size as well: what the pointer shows is
      // what the release stores, and the card can never leave the screen.
      box.style.width = "min(" + w + "px,calc(100vw - 32px))";
      box.style.height = "min(" + h + "px,calc(100vh - 24px))";
    };
    var end = function (write) {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", up);
      globalThis.removeEventListener("pointercancel", cancelled);
      var wasMoved = resize !== null && resize.moved;
      resize = null;
      if (write && wasMoved && liveSize !== null) {
        var cur = liveSize.w + "," + liveSize.h;
        if (cur !== pendingSizeWrite) {
          var live = readState();
          if (live.writable) {
            pendingSizeWrite = cur;
            writeSingleShot(scope, live.presetList, live.activeName, { panelSize: cur }, {
              mirror: false,
              onError: reportError,
            });
            status(t("panel.resized"));
          }
        }
      }
      render();
    };
    var up = function () {
      end(true);
    };
    var cancelled = function () {
      end(false);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up);
    globalThis.addEventListener("pointercancel", cancelled);
    event.preventDefault();
    event.stopPropagation();
  };

  /**
   * The card size the document holds (null when never resized).
   * @param {object} config - the normalized configuration.
   * @returns {{w: number, h: number}|null} the size, or null for the default.
   */
  var docSize = function (config) {
    try {
      return shared.parsePanelSize(config[PANEL_SIZE_FIELD]);
    } catch (error) {
      return null;
    }
  };

  /**
   * The configuration behind the resize seat (read fresh, not from render).
   * @returns {object} the normalized configuration.
   */
  var configOfResize = function () {
    try {
      return readState().config;
    } catch (error) {
      return {};
    }
  };

  var render = function () {
    var state = readState();
    var config = state.config;
    var enabled = config[PANEL_ENABLED_FIELD] !== false;
    host.style.display = enabled ? "" : "none";
    if (!enabled) return;
    // Position from the one truth; a drag owns the element until release.
    // Opening, collapse and reload all land here and move nothing.
    if (drag === null) {
      if (pos === null) {
        host.style.left = "";
        host.style.top = "";
        host.style.right = "16px";
        host.style.bottom = "16px";
      } else {
        host.style.right = "";
        host.style.bottom = "";
        host.style.left = pos.x + "px";
        host.style.top = pos.y + "px";
      }
    }
    host.textContent = "";
    // One line in the console answers "which build is live": with a linked plugin
    // and a cached client script, "I refreshed" is not evidence on its own.
    host.setAttribute("data-dfp-build", "2026-10-01-2");
    var dot = el("button", "dfp-dot");
    dot.type = "button";
    dot.setAttribute("aria-label", t("panel.dot"));
    dot.title = t("panel.dot");
    var glyph = el("span", "dfp-dotGlyph");
    dot.appendChild(glyph);
    // The dot is a circle too — outer frame and the mark inside it both — and
    // `corner-shape` is what decides that on a host that cuts its rounded corners.
    roundShape(dot);
    roundShape(glyph);
    // The dot is draggable AND clickable: below the threshold this is a
    // click (toggle), past it a drag (move, no toggle, no animation).
    dot.addEventListener("pointerdown", function (event) {
      startDrag(event, dot, state.writable);
    });
    dot.addEventListener("click", function () {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      setOpen(!open);
    });
    host.appendChild(dot);
    // While the card is up the dot is on its way out: it keeps its place in the
    // DOM and its coordinates, but it must not take a drag away from the card
    // head underneath it. On a real shut->open the fade is armed by `playEnter`
    // (two frames, so the 1 it starts from actually paints); every other
    // rebuild while open wants it gone at once, or a snapshot echo would flash
    // it back.
    if (open && !(playEnter && !motionReduced()) && typeof dot.classList !== "undefined") {
      dot.classList.add("dfp-dotAway");
    }
    if (!open) return;

    // The shadow's own layer: the card is clipped while it animates, and a clip
    // on the card would clip the card's own filter away with it (see the sheet).
    var shadow = el("div", "dfp-floatShadow");
    var card = el("div", "dfp-floatCard");
    // The bar the dot sits in decides the expand direction, and that bar is the
    // CONVERSATION's: `floatBounds` measures it, so a dot parked in the region's
    // top-right grows left-down even where the window would call it bottom-right.
    var bounds = floatBounds();
    var anchor = pos;
    if (anchor === null) {
      // Nothing stored yet: the dot starts on the conversation region's
      // BOTTOM-RIGHT corner. Reading the unpositioned host's own rect instead
      // — what this used to do — made the first corner an accident of where the
      // page flow happened to place a fixed box: bottom-left on one document,
      // another corner on the next. The corner is the dot's identity, so the
      // first one is a decision, not a coincidence.
      anchor = { x: bounds.right, y: bounds.bottom };
    }
    var quadrant = shared.floatQuadrantIn(bounds, anchor.x, anchor.y);
    // The remembered corner is the answer the card is really anchored on: a
    // region narrow enough puts a corner's coordinates on the other side of its
    // own middle, and the card still has to grow AWAY from the corner the dot
    // lives in rather than flip around it. A dot that is not on its remembered
    // corner (mid-drag, or a position just adopted) is read from where it is.
    // Asked through a helper: `corner` below is the CARD's anchored corner, and
    // a local of that name here would shadow the dot's identity.
    quadrant = dotQuadrant(bounds, anchor, quadrant);
    liveQuadrant = quadrant;
    var expand = shared.floatExpandDirection(quadrant);
    try {
      host.setAttribute("data-dfp-quadrant", quadrant);
      card.setAttribute("data-dfp-expand", expand);
    } catch (error) {
      // Attributes are probe conveniences; the layout below stands alone.
    }
    // The card's anchored corner IS the dot's corner, and the transform-origin
    // is that same shared corner: the card unfolds toward the opposite corner
    // and folds back into the dot when it shuts. The anchored edge and the size
    // are the WRAPPER's (it is the positioned box now); the origin is set on
    // both, because the scale itself still rides the card and has to shrink
    // toward that same corner.
    var cardCorner = shared.floatCardAnchor(quadrant);
    shadow.style.left = "";
    shadow.style.right = "";
    shadow.style.top = "";
    shadow.style.bottom = "";
    shadow.style[cardCorner.h] = "0px";
    shadow.style[cardCorner.v] = "0px";
    try {
      shadow.style.transformOrigin = cardCorner.origin;
      card.style.transformOrigin = cardCorner.origin;
    } catch (error) {
      // The default origin still animates; only the direction is lost.
    }
    var sized = liveSize || docSize(config);
    if (sized !== null) {
      // A stored size is capped by the viewport, like the stylesheet default:
      // a card sized on a big screen must still fit a small one. The card fills
      // the wrapper, so the wrapper is the box that gets the size.
      shadow.style.width = "min(" + sized.w + "px,calc(100vw - 32px))";
      if (sized.h > 0) {
        shadow.style.height = "min(" + sized.h + "px,calc(100vh - 24px))";
      }
    }
    var head = el("div", "dfp-floatHead");
    // Plain padding on one side only: the two round buttons are out of flow in
    // the card's own top-right corner, and the title keeps clear of both.
    // Nothing is held open for the dot any more — it is faded out while the
    // card is up.
    head.style.paddingRight =
      Math.max(
        0,
        shared.FLOAT_CLOSE_INSET +
          shared.FLOAT_CLOSE +
          shared.FLOAT_SETTINGS_GAP +
          shared.FLOAT_CLOSE +
          shared.FLOAT_CLOSE_GAP -
          shared.FLOAT_CARD_PAD
      ) + "px";
    head.appendChild(el("span", "dfp-floatTitle", t("panel.title")));
    // The settings entry sits IMMEDIATELY LEFT of the close: the same circle, one
    // diameter plus FLOAT_SETTINGS_GAP along the corner (see the stylesheet).
    // Its own rule puts it there, so the pair stays 8px apart at every card size.
    var settingsButton = el("button", "dfp-floatSettings");
    settingsButton.type = "button";
    roundButton(settingsButton);
    settingsButton.setAttribute("aria-label", t("panel.settings"));
    settingsButton.title = t("panel.settings");
    settingsButton.appendChild(settingsGlyph());
    settingsButton.addEventListener("click", function () {
      openSettingsScreen("panel head");
    });
    head.appendChild(settingsButton);
    // The close: one round icon button (the bar inside is the close icon),
    // pinned to the card's top-right corner by its own rule. No mirroring: the
    // dot is invisible, and takes no pointer, while this button is on screen.
    var closer = el("button", "dfp-floatClose");
    closer.type = "button";
    roundButton(closer);
    closer.setAttribute("aria-label", t("panel.close"));
    closer.title = t("panel.close");
    closer.appendChild(closeCross());
    closer.addEventListener("click", function () {
      setOpen(false);
    });
    head.appendChild(closer);
    card.appendChild(head);
    // Dragging the head moves the dot the card hangs off; the threshold and
    // the mid-drag toggle guard live in `startDrag`/`setOpen`. A press that
    // landed on a BUTTON inside the head belongs to that button and never
    // reaches the drag: `startDrag` preventDefaults the pointerdown, and a
    // prevented pointerdown suppresses the compatibility mouse events — with
    // this guard missing, the click the close button waits for never arrived.
    head.addEventListener("pointerdown", function (event) {
      var pressed = event.target;
      if (pressed !== null && pressed !== undefined && typeof pressed.closest === "function" &&
        pressed.closest("button") !== null) {
        return;
      }
      startDrag(event, head, state.writable);
    });

    var size = config[SIZE_DIALOG_FIELD];
    sliderRow(
      card,
      t("size.dialogLabel"),
      (size > 0 ? "+" + size : String(size)) + " " + t("size.unit"),
      SIZE_MIN,
      SIZE_MAX,
      1,
      size,
      function (next) {
        commit({ sizeOffsetDialog: next });
      }
    );

    var line = config[LINE_HEIGHT_DIALOG_FIELD];
    sliderRow(
      card,
      t("line.dialogLabel"),
      line + " " + t("line.unit"),
      LINE_HEIGHT_MIN,
      LINE_HEIGHT_MAX,
      5,
      line,
      function (next) {
        commit({ lineHeightDialog: next });
      }
    );

    // The dialog weight in the family's own steps, like the card's control:
    // the document keeps the offset, the readout counts steps.
    var dialogStack = formatStack(parseStack(config[STACK_DIALOG_FIELD]));
    var profile = { min: WEIGHT_DELTA_MIN, max: WEIGHT_DELTA_MAX, step: 1 };
    try {
      profile = weightProfileFor(dialogStack, shared.WEIGHT_LADDER_STRONG);
    } catch (profileError) {
      // The nominal window stands in when the family cannot be measured.
    }
    var storedWeight = config[WEIGHT_DIALOG_FIELD] === WEIGHT_UNSET ? 0 : config[WEIGHT_DIALOG_FIELD];
    var shape = weightStepRange(
      { min: Math.min(profile.min, storedWeight), max: Math.max(profile.max, storedWeight), step: profile.step },
      storedWeight
    );
    (function () {
      var row = el("div", "dfp-floatRow");
      var label = el("div", "dfp-floatLabel");
      label.appendChild(el("span", null, t("weight.dialogLabel")));
      var shown = el("span", "dfp-floatValue", weightOffsetText(shape.value));
      label.appendChild(shown);
      row.appendChild(label);
      var input = el("input", "dfp-floatSlider");
      input.type = "range";
      input.min = String(shape.min);
      input.max = String(shape.max);
      input.step = "1";
      input.value = String(shape.value);
      input.setAttribute("aria-label", t("weight.dialogLabel"));
      input.addEventListener("input", function () {
        shown.textContent = weightOffsetText(Number(input.value));
      });
      input.addEventListener("change", function () {
        var count = Number(input.value);
        if (count === 0) commit({ weightDialog: undefined });
        else commit({ weightDialog: count * shape.unit });
      });
      row.appendChild(input);
      card.appendChild(row);
    })();

    card.appendChild(el("div", "dfp-floatStatus", ""));
    // Edge resize handles: right, bottom and the corner. The card follows the
    // pointer live; one size write lands on release (see `startResize`).
    (function () {
      var edges = [
        { mode: "w", className: "dfp-floatResize dfp-floatResizeR" },
        { mode: "h", className: "dfp-floatResize dfp-floatResizeB" },
        { mode: "wh", className: "dfp-floatResize dfp-floatResizeBR" },
      ];
      for (var edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
        (function (edge) {
          var grip = el("div", edge.className);
          grip.setAttribute("data-dfp-resize", edge.mode);
          grip.addEventListener("pointerdown", function (event) {
            startResize(event, edge.mode, shadow, card);
          });
          card.appendChild(grip);
        })(edges[edgeIndex]);
      }
    })();
    shadow.appendChild(card);
    host.appendChild(shadow);
    // Enter animation, only on a real shut->open transition: the card starts
    // clipped to the dot's own rectangle, a hair smaller and dimmer, and the
    // next frames let the transition carry all three home (clip/transform/
    // opacity, ~280 ms on one non-linear curve). Re-renders while open skip
    // this, so sliders and echoes never replay the animation.
    var entering = playEnter === true && typeof card.classList !== "undefined" && !motionReduced();
    playEnter = false;
    if (entering) {
      // Arm before measuring: the read below resolves the card's own style,
      // and the arming class keeps that resolution from becoming the "before"
      // of a transition (see `.dfp-floatCardArm`).
      card.classList.add("dfp-floatCardArm");
      armClipStart(card);
      card.classList.add("dfp-floatCardEnter");
      var settled = false;
      var settleTimer = null;
      /**
       * Drop the resting clip once the unfold has actually arrived.
       *
       * The clip is what makes the card grow, but the shape it lands on is the
       * card's own border box — and clipping that a second time (`border-radius`
       * already rounds it) doubles the anti-aliasing along the rounded corners,
       * which reads as thin, washed-out corners, while cutting the card's own
       * filter shadow away. So the clip goes as soon as it has nothing left to
       * do. `transitionend` is exact; the timer is the backstop for a browser
       * that never delivers it, and each attempt re-checks the geometry, so a
       * still-running unfold is never cut short.
       * @param {number} attempt - how many checks have already been made.
       */
      var releaseClip = function (attempt) {
        if (leaving || !open) return;
        if (card.parentNode === null) return;
        var current = null;
        try {
          current = globalThis.getComputedStyle(card).clipPath;
        } catch (error) {
          return; // no computed styles here (an offline stub): leave the clip alone
        }
        if (!shared.isRestClip(current)) {
          if (attempt < 20) {
            globalThis.setTimeout(function () {
              releaseClip(attempt + 1);
            }, 60);
          }
          return;
        }
        card.style.clipPath = "none";
      };
      var settle = function () {
        if (settled) return;
        settled = true;
        if (settleTimer !== null) {
          globalThis.clearTimeout(settleTimer);
          settleTimer = null;
        }
        if (card.parentNode !== null) {
          card.classList.remove("dfp-floatCardArm");
          card.classList.remove("dfp-floatCardEnter");
        }
        // The dot goes out on the same two frames, so its own 1 paints first
        // and the cross-fade runs with the unfold rather than before it.
        var liveDot = host.querySelector(".dfp-dot");
        if (liveDot !== null && liveDot !== undefined && typeof liveDot.classList !== "undefined") {
          liveDot.classList.add("dfp-dotAway");
        }
        if (typeof card.addEventListener === "function") {
          card.addEventListener("transitionend", function (event) {
            if (event !== null && event !== undefined && event.propertyName === "clip-path") {
              releaseClip(0);
            }
          });
        }
        globalThis.setTimeout(function () {
          releaseClip(0);
        }, FLOAT_UNFOLD_MS + 60);
      };
      if (typeof globalThis.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(function () {
          globalThis.requestAnimationFrame(settle);
        });
        // A frame callback that never arrives (a tab the browser stopped
        // painting) must not leave the card parked on its start frame: this
        // timer is long enough for the start frame to have painted first.
        settleTimer = globalThis.setTimeout(settle, FLOAT_SETTLE_MS);
      } else {
        globalThis.setTimeout(settle, 50);
      }
    } else if (typeof card.style !== "undefined") {
      // Nothing to animate — a re-render while the card is already open, or a
      // reduced-motion user — so the card is at its resting geometry from its
      // very first frame, and that geometry needs no clip at all.
      card.style.clipPath = "none";
    }
    if (!state.writable) {
      // The close button stays live on a read-only document: shutting the
      // panel is chrome, not a write.
      var controls = card.querySelectorAll("input,select,button");
      for (var off = 0; off < controls.length; off += 1) {
        if (controls[off] !== closer) controls[off].disabled = true;
      }
    }
  };

  var onSnapshot = function () {
    // A drag owns the element until release: rebuilding under the pointer
    // would replace the head mid-gesture and drop the capture. The drag
    // always ends on pointerup/cancel/blur (see `end`), so this skip cannot
    // wedge the panel the way the old render gate did.
    if (drag !== null || resize !== null) return;
    // A snapshot from elsewhere moves the truth; our own echo matches it. A
    // position that ARRIVED is not a rest position yet — it is painted only
    // once it is on a corner, so no document value can park the dot in the
    // middle of the conversation (see `settleOnCorner`).
    if (adoptDocPos()) settleOnCorner();
    // A leave animation in flight owns the node until its timer fires.
    if (!open && leaving) return;
    render();
  };

  var unsubscribe = null;
  try {
    unsubscribe = scope.subscribe(onSnapshot);
  } catch (error) {
    unsubscribe = null;
  }
  // The truth starts as the document: reloads land back where the dot was, in
  // the corner it lives in.
  lastSeenDoc = readDocPos();
  pos = shared.parsePanelPos(lastSeenDoc);
  lastSeenCorner = readDocCorner();
  corner = shared.parsePanelCorner(lastSeenCorner);
  lastSeenSize = readDocSize();
  liveSize = null;
  render();
  // The region moves without any gesture of the user's — a window resize, a
  // sidebar folding away, a top bar appearing, or a host that REPLACES the whole
  // conversation element. The observer answers the first three; the interval below
  // answers the fourth, which no observer on a replaced node can ever answer (see
  // `watchRegion` and `pollRegion`). The one-shot reflow after them covers a stored
  // position that no longer fits this window at mount.
  try {
    globalThis.addEventListener("resize", onViewResize);
  } catch (error) {
    // A host without an event target still watches through the observer.
  }
  watchRegion();
  reflowIntoBounds();
  // Armed AFTER the mount settle: the first reading is only the baseline the next
  // ones are compared against.
  armed = true;
  pollBounds = null;
  try {
    if (typeof globalThis.setInterval === "function") {
      pollTimer = globalThis.setInterval(pollRegion, FLOAT_WATCH_POLL_MS);
    }
  } catch (error) {
    // A host without timers keeps the observer and the resize listener.
  }
  try {
    document.addEventListener("visibilitychange", onVisibility);
  } catch (error) {
    // A document without events still gets the interval.
  }

  return {
    destroy: function () {
      if (statusTimer !== null) globalThis.clearTimeout(statusTimer);
      if (closeTimer !== null) globalThis.clearTimeout(closeTimer);
      if (reflowTimer !== null) globalThis.clearTimeout(reflowTimer);
      reflowTimer = null;
      if (pollTimer !== null) {
        try {
          globalThis.clearInterval(pollTimer);
        } catch (error) {
          // Already gone with the page.
        }
        pollTimer = null;
      }
      pollBounds = null;
      armed = false;
      leaving = false;
      try {
        globalThis.removeEventListener("resize", onViewResize);
      } catch (error) {
        // Already gone with the page.
      }
      try {
        document.removeEventListener("visibilitychange", onVisibility);
      } catch (error) {
        // Already gone with the page.
      }
      if (regionObserver !== null) {
        try {
          regionObserver.disconnect();
        } catch (error) {
          // A half-torn-down observer needs no disconnecting.
        }
        regionObserver = null;
        observedRegion = null;
        observedBody = null;
      }
      try {
        if (typeof unsubscribe === "function") unsubscribe();
      } catch (error) {
        // Already gone with the scope.
      }
      if (host.parentNode) host.parentNode.removeChild(host);
    },
    toggle: function () {
      setOpen(!open);
    },
  };
}

/* ------------------------------------------------------------------ *
 * plugin body
 * ------------------------------------------------------------------ */

/**
 * Mount the card and keep the page's typography in sync with the settings.
 * @param {object} ctx - client cordis context.
 */
function apply(ctx) {
  installCardStyles(ctx);

  var tokens = readBaseTokens();
  var applyCss = createStylesheet(function () {
    return tokens;
  });

  /**
   * Look a service up without declaring it.
   *
   * Declaring a name the running host does not provide parks the whole package
   * until it appears — on DSH 0.1.7-alpha.x a declared `settingsScope` left the
   * Web UI waiting on a service that no longer exists. Both routes are tried:
   * `ctx.get(name)` first, then the service property older lines also expose.
   * @param {string} name - the service name.
   * @returns {object|null} the service, or null when this host has none.
   */
  var getService = function (name) {
    try {
      if (typeof ctx.get === "function") {
        var found = ctx.get(name);
        if (found) return found;
      }
    } catch (error) {
      // fall through to the property read
    }
    try {
      return ctx[name] || null;
    } catch (error) {
      return null;
    }
  };

  /**
   * Whether one served namespace is THIS plugin's form.
   *
   * The alpha keys a form by profile entry id, which the installing profile's
   * patch decides, so the entry's own fields are what identify us: either the
   * served schema or the values it carries name them.
   * @param {object} entry - one namespace from the describe view.
   * @returns {boolean} true when the entry is this plugin's.
   */
  var isOurNamespace = function (entry) {
    var schema = "";
    try {
      schema = JSON.stringify((entry && entry.schema) || {});
    } catch (error) {
      schema = "";
    }
    if (schema.indexOf(UI_FOLLOWS_FIELD) >= 0 && schema.indexOf(STACK_DIALOG_FIELD) >= 0) {
      return true;
    }
    var values = (entry && (entry.value || entry.user || entry.base)) || {};
    return (
      Object.prototype.hasOwnProperty.call(values, UI_FOLLOWS_FIELD) &&
      Object.prototype.hasOwnProperty.call(values, STACK_DIALOG_FIELD)
    );
  };

  /**
   * The profile entry id the `configForms` dialect addresses settings by.
   *
   * Up to 0.1.5-rc.x a namespace is a name the plugin registers; from
   * 0.1.7-alpha.x the settings service derives a form per composed entry and
   * keys it by that entry's id — which the installing profile's patch decides,
   * so nothing here may hard-code it. The served view is the only honest
   * answer: while it has not arrived this returns null, and the caller waits
   * for it instead of guessing a name whose form could never be written.
   * @param {object} forms - the `configForms` service.
   * @returns {string|null} the entry id, or null while the host has not served it.
   */
  var formsNamespace = function (forms) {
    var view = null;
    try {
      view = forms.describe ? forms.describe().getSnapshot().view : null;
    } catch (error) {
      view = null;
    }
    var served = (view && view.namespaces) || [];
    if (globalThis.__DFP_PROBE__ === true) {
      console.log(
        "[dfp-probe] served namespaces " +
          JSON.stringify(
            served.map(function (item) {
              return item && item.ns;
            })
          )
      );
    }
    for (var index = 0; index < served.length; index += 1) {
      if (isOurNamespace(served[index])) {
        if (globalThis.__DFP_PROBE__ === true) {
          console.log("[dfp-probe] matched by served schema: " + String(served[index].ns));
        }
        return served[index].ns;
      }
    }
    return null;
  };

  /**
   * A scope that adopts the host's scope the moment the host serves it.
   *
   * The alpha's `configForms` can be asked for a form before its describe view
   * has arrived — `get(id)` then answers with a not-ready controller for that
   * id, and every write through it is refused. This stands in for the scope
   * until the real one is identifiable, forwards the card's subscription to it
   * on adoption, and lets the card re-read immediately afterwards.
   * @returns {object} the pending scope, with an `adopt` seat for the caller.
   */
  var createPendingScope = function () {
    var target = null;
    var listeners = [];
    return {
      getSnapshot: function () {
        return target === null
          ? {
              status: "loading",
              value: undefined,
              base: undefined,
              user: undefined,
              revision: undefined,
              writable: false,
              mode: "pending",
            }
          : target.getSnapshot();
      },
      subscribe: function (listener) {
        if (target !== null) return target.subscribe(listener);
        listeners.push(listener);
        return function () {
          var at = listeners.indexOf(listener);
          if (at >= 0) listeners.splice(at, 1);
        };
      },
      set: function (field, value) {
        if (target === null) {
          return Promise.reject(new Error("the settings service is still starting"));
        }
        return target.set(field, value);
      },
      /**
       * The one-call batch, when the adopted scope has it.
       *
       * Answered at CALL time, not at bind time: the seat is decided while the host
       * is still describing itself, and the older `settingsScope` dialect has no
       * `mutate` at all. `canMutate` is what the card asks first, so a host without
       * it takes the one-field-per-call path instead of an error.
       */
      canMutate: function () {
        return target !== null && typeof target.mutate === "function";
      },
      mutate: function (ops) {
        if (target === null) {
          return Promise.reject(new Error("the settings service is still starting"));
        }
        if (typeof target.mutate !== "function") {
          return Promise.reject(new Error("this host writes one field at a time"));
        }
        return target.mutate(ops);
      },
      unset: function (field) {
        if (target === null) {
          return Promise.reject(new Error("the settings service is still starting"));
        }
        return target.unset(field);
      },
      /** Hand over the real scope once it is identifiable; true when taken. */
      adopt: function (next) {
        if (target !== null || next === null || next === undefined) return false;
        target = next;
        var pending = listeners.slice();
        listeners.length = 0;
        for (var index = 0; index < pending.length; index += 1) {
          target.subscribe(pending[index]);
          pending[index]();
        }
        return true;
      },
    };
  };

  /**
   * Bind the settings scope in whichever dialect the running host speaks: the
   * `settingsScope` service up to 0.1.5-rc.x (`bind({namespace})`), the
   * `configForms` service from 0.1.7-alpha.x (`get(entryId)`). Both expose the
   * same snapshot/`set`/`unset` face, so one card covers them.
   * @returns {object|null} the bound scope, or null when neither dialect answered.
   */
  var pickSettingsScope = function () {
    var settingsScope = getService("settingsScope");
    if (settingsScope && typeof settingsScope.bind === "function") {
      try {
        var bound = settingsScope.bind({ namespace: NAMESPACE });
        if (bound) return bound;
      } catch (error) {
        // fall through to the newer dialect
      }
    }
    var forms = getService("configForms");
    if (forms && typeof forms.get === "function") {
      var bindAlphaForm = function () {
        var ns = formsNamespace(forms);
        if (ns === null) return null;
        try {
          var form = forms.get(ns);
          return form && typeof form.getSnapshot === "function" ? form : null;
        } catch (error) {
          return null;
        }
      };
      var immediate = bindAlphaForm();
      if (immediate !== null) return immediate;
      var pending = createPendingScope();
      var mirror = null;
      try {
        mirror = typeof forms.describe === "function" ? forms.describe() : null;
      } catch (error) {
        mirror = null;
      }
      var offMirror = null;
      var adopt = function () {
        var form = bindAlphaForm();
        if (form === null) return;
        if (!pending.adopt(form)) return;
        if (typeof offMirror === "function") offMirror();
      };
      if (mirror && typeof mirror.subscribe === "function") {
        offMirror = mirror.subscribe(adopt);
        if (typeof mirror.ensure === "function") mirror.ensure();
      }
      adopt();
      return pending;
    }
    return null;
  };

  var scope = pickSettingsScope() || MEMORY_SCOPE;
  if (globalThis.__DFP_PROBE__ === true) {
    var probeSnapshot = scope.getSnapshot ? scope.getSnapshot() : {};
    console.log(
      "[dfp-probe] scope " +
        JSON.stringify({
          mode: probeSnapshot.mode,
          status: probeSnapshot.status,
          revision: probeSnapshot.revision,
          writable: probeSnapshot.writable,
          value: probeSnapshot.value,
        })
    );
  }
  var appliedOverrides = "";

  /**
   * Hand the family variables to the official theme layer, so the presenter
   * owns them on body's inline style and nothing — theme switches included —
   * can delete them. Only the two family pairs ride this; the size/weight
   * axes stay on the stylesheet, where their `!important` rules already win.
   * @param {unknown} config - the current configuration.
   */
  var applyTokenOverrides = function (config) {
    if (typeof ctx.get !== "function") return;
    var theme = ctx.get("theme");
    if (theme === undefined || theme === null) return;
    if (typeof theme.overrideTokens !== "function") return;
    var sets = resolveAxes(config);
    var tokens = {};
    var uiLight = formatStack(parseStack(sets.light[SANS_FIELD]));
    var uiDark = formatStack(parseStack(sets.dark[SANS_FIELD]));
    if (uiLight !== "" && uiDark !== "") {
      tokens["--dsw-font-family"] = { light: uiLight, dark: uiDark };
    }
    var monoLight = formatStack(parseStack(sets.light[MONO_FIELD]));
    var monoDark = formatStack(parseStack(sets.dark[MONO_FIELD]));
    if (monoLight !== "" || monoDark !== "") {
      var fallback = readDefaultFamily("--ds-font-family-code");
      var light = monoLight !== "" ? monoLight : fallback;
      var dark = monoDark !== "" ? monoDark : fallback;
      if (light !== "" && dark !== "") {
        tokens["--dsw-font-mono"] = { light: light, dark: dark };
        tokens["--ds-font-family-code"] = { light: light, dark: dark };
      }
    }
    var signature = JSON.stringify(tokens);
    if (signature === appliedOverrides) return;
    appliedOverrides = signature;
    try {
      theme.overrideTokens("dsh-fonttune", tokens);
    } catch (error) {
      // A teaching error (a bad pair shape) must not break the page; the
      // stylesheet rules below still apply the same values.
    }
  };

  var sync = function () {
    var snapshot = scope.getSnapshot();
    if (snapshot.value === undefined) return;
    // A move the card already painted wins until the document echoes it, so a late
    // echo of an OLDER value neither steps the page backwards nor costs a repaint.
    pendingLocalValues = shared.reconcilePendingValues(
      pendingLocalValues,
      snapshot.value,
      Date.now(),
      PAINT_PATIENCE_MS
    );
    // Light and dark share one value set in this release: the stored flag (if
    // any) is ignored, so no prefixed dark rules are ever emitted.
    var unified = normalizeConfig(shared.overlayPendingValues(snapshot.value, pendingLocalValues));
    unified[PER_THEME_FIELD] = false;
    probeLog("sync", {
      overlay: Object.keys(pendingLocalValues).map(function (key) {
        return key + "=" + String(pendingLocalValues[key].value);
      }),
      dialog: unified[WEIGHT_DIALOG_FIELD],
      followed: unified[WEIGHT_FIELD],
      size: unified[SIZE_DIALOG_FIELD],
    });
    applyCss(unified);
    applyTokenOverrides(unified);
    // Measure the weight shapes off this sync — and off every later font
    // change — so opening the card never stalls on its own first frame.
    scheduleWeightWarm(resolveAxes(unified).light);
  };
  ctx.effect(
    function () {
      return scope.subscribe(sync);
    },
    "dsh-fonttune: settings adoption"
  );
  sync();
  // The card paints a move the moment the user lets go; this is that painter.
  repaint = sync;

  // Which selectors the sheet can be narrowed to depends on what the page
  // contains, and the conversation renders AFTER this bundle activates: the
  // first harvest sees an empty shell and falls back to the wide attribute
  // hooks (correct, but an attribute scan per element per rule). Re-harvest
  // when the DOM grows. The applier returns untouched when the resulting CSS
  // is unchanged, so a redundant re-sync costs one string compare.
  ctx.effect(
    function () {
      if (typeof document === "undefined") return undefined;
      if (typeof MutationObserver !== "function" || !document.body) return undefined;
      var pending = null;
      var observer = new MutationObserver(function () {
        if (pending !== null) return;
        pending = globalThis.setTimeout(function () {
          pending = null;
          sync();
        }, 1000);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return function () {
        if (pending !== null) globalThis.clearTimeout(pending);
        observer.disconnect();
      };
    },
    "dsh-fonttune: scope re-harvest"
  );

  // DSH writes its tokens (and its content font size) after this bundle
  // activates, and the host's own boot row only covers the first frame; the
  // size axis therefore re-reads the live values and reapplies when they
  // moved. The theme/change event makes that immediate: the official
  // font-size preference flows through it, so a slider change is followed
  // within a frame instead of the polling interval.
  var scheduleRecheck = null;
  ctx.effect(
    function () {
      if (typeof document === "undefined") return undefined;
      var lastSignature = "";
      var lastGate = null;
      var ticks = 0;
      // Reading the base tokens walks every property of every rule of every
      // stylesheet — far too much to repeat every four seconds forever. This
      // gate covers everything that moves those tokens in DSH: the theme
      // writes its content font size inline on `body`, a light/dark switch
      // swaps the class on `html`, and a lazily loaded view adds a stylesheet.
      // A full sweep still runs every Nth tick, which is what catches an
      // in-place rewrite inside the CSS-in-JS sheet.
      var GATE_TICKS_PER_SWEEP = 8;
      var gate = function () {
        var inline = "";
        var root = null;
        try {
          inline = document.body ? document.body.getAttribute("style") || "" : "";
          root = document.documentElement;
        } catch (error) {
          inline = "";
        }
        return (
          inline +
          "|" +
          (root ? root.className || "" : "") +
          "|" +
          document.styleSheets.length
        );
      };
      var recheck = function (force) {
        ticks += 1;
        var current = gate();
        if (force !== true && ticks % GATE_TICKS_PER_SWEEP !== 0 && current === lastGate) return;
        lastGate = current;
        var next = readBaseTokens();
        var signature = "";
        var name;
        for (name in next) {
          if (!Object.prototype.hasOwnProperty.call(next, name)) continue;
          signature += name + "=" + next[name] + ";";
        }
        if (signature === lastSignature) return;
        lastSignature = signature;
        for (name in next) {
          if (!Object.prototype.hasOwnProperty.call(next, name)) continue;
          tokens[name] = next[name];
        }
        sync();
      };
      scheduleRecheck = recheck;
      var timer = globalThis.setTimeout(function () {
        recheck(true);
      }, 500);
      var interval = globalThis.setInterval(recheck, 4000);
      return function () {
        globalThis.clearTimeout(timer);
        globalThis.clearInterval(interval);
      };
    },
    "dsh-fonttune: token refresh"
  );
  ctx.effect(
    function () {
      // Compositions without an event seat (the offline stand-ins) simply skip
      // this hook; the polling recheck still covers theme changes there.
      if (typeof ctx.on !== "function") return undefined;
      return ctx.on("theme/change", function () {
        // Forced: the theme may have moved without touching the cheap gate.
        if (scheduleRecheck !== null) scheduleRecheck(true);
      });
    },
    "dsh-fonttune: theme change adoption"
  );

  var t = function (key, params) {
    var locale = "en";
    try {
      locale = ctx.locale.getLocale().active;
    } catch (error) {
      // A composition without the locale service still gets English copy.
    }
    return translate(locale, key, params);
  };
  // The card reads these when a seat renders it without the injected face.
  cardScope = scope;
  cardT = t;
  ctx.effect(
    function () {
      return ctx.locale.register(NAMESPACE, DICTS);
    },
    "dsh-fonttune: dictionaries"
  );

  // The floating panel itself: the master switch gates it — a hidden panel
  // stays hidden. It opens and closes from its own dot; there is no hotkey.
  ctx.effect(
    function () {
      var panel = mountFloatPanel(scope, t, ctx);
      return function () {
        panel.destroy();
      };
    },
    "dsh-fonttune: floating panel"
  );

  /**
   * Offer the card in one slot seat.
   *
   * Which seat a host declares is a line difference, not a preference, and the
   * three are not alternatives to pick from — each is simply inert where a host
   * never declares it:
   *
   *  * `settings.plugin.item` — up to 0.1.5-rc.x, a keyed cell under
   *    Settings → Plugins → Plugin configuration (keyed by the namespace);
   *  * `plugins.item` — 0.1.7-alpha.x's own entry in the Plugins page's
   *    official list, which is how EVERY plugin page is contributed there (the
   *    built-in settings pages do the same), and the seat that needs no
   *    installed package behind it;
   *  * `plugins.bundle.config` — the alpha's per-package page, keyed by the npm
   *    package name, for a profile that installed this plugin as a bundle.
   *
   * @param {string} seat - the slot name.
   * @param {object} options - the registration options that seat looks up.
   * @param {Function} [component] - the component to register; the card itself
   *   unless a seat hands it props the card does not read.
   */
  var offerCard = function (seat, options, component) {
    ctx.slots.inject(seat, function () {
      var registration = {
        name: seat,
        locale: NAMESPACE,
        inject: function () {
          return { scope: scope, t: t };
        },
      };
      for (var field in options) {
        if (Object.prototype.hasOwnProperty.call(options, field)) {
          registration[field] = options[field];
        }
      }
      return ctx.slots.register(registration, component === undefined ? FontCard : component);
    });
  };
  if (scope !== MEMORY_SCOPE) {
    offerCard("settings.plugin.item", { key: NAMESPACE });
    offerCard("plugins.bundle.config", { key: "dsh-fonttune" });
    offerCard(
      "plugins.item",
      {
        id: "fonttune",
        order: 40,
        label: function () {
          return t("card.title");
        },
      },
      FontCardPage
    );
  }
}

exports.apply = apply;
exports.inject = inject;

exports.apply = apply;
exports.inject = inject;

		return module.exports;
	}
});
