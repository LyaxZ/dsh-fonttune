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
