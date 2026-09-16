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

/* ------------------------------------------------------------------ *
 * ranges and constants
 * ------------------------------------------------------------------ */

/** Allowed font-size offset range. The upper bound stays under a 2x scale. */
var SIZE_MIN = -3;
var SIZE_MAX = 6;

/** Allowed font weight range, and the value meaning "do not touch". */
var WEIGHT_MIN = 300;
var WEIGHT_MAX = 600;
var WEIGHT_UNSET = 0;

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

/** Marker on both injected style tags, used for scoping every rule we write. */
var MARKER = "dfp";

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
  perTheme: false,
  darkValues: "{}",
  presets: "[]",
  activePreset: "",
  uiFollowsDialog: true,
};

/**
 * The axis fields a preset snapshots: everything the card edits, excluding
 * the storage fields themselves.
 */
var VALUE_FIELDS = [
  SANS_FIELD,
  STACK_DIALOG_FIELD,
  MONO_FIELD,
  SIZE_FIELD,
  SIZE_DIALOG_FIELD,
  CODE_SIZE_FIELD,
  WEIGHT_FIELD,
  WEIGHT_DIALOG_FIELD,
  CODE_WEIGHT_FIELD,
  LINE_HEIGHT_FIELD,
  LINE_HEIGHT_DIALOG_FIELD,
  CODE_LINE_HEIGHT_FIELD,
  LIGATURES_FIELD,
  FEATURES_FIELD,
  NO_SYNTHETIC_ITALIC_FIELD,
  NO_SYNTHETIC_BOLD_FIELD,
  UI_FOLLOWS_FIELD,
];

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

/* ------------------------------------------------------------------ *
 * configuration normalization
 * ------------------------------------------------------------------ */

/** Clamp/validate one field by name (shared by config and value sets). */
function normalizeField(field, value) {
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
      return clampWeight(value);
    case LINE_HEIGHT_FIELD:
    case LINE_HEIGHT_DIALOG_FIELD:
      return clampRatio(value);
    case CODE_LINE_HEIGHT_FIELD:
      return clampLineOffset(value);
    case LIGATURES_FIELD:
      return clampLigatures(value);
    case FEATURES_FIELD:
      return sanitizeFeatures(value);
    case NO_SYNTHETIC_ITALIC_FIELD:
    case NO_SYNTHETIC_BOLD_FIELD:
      return toBool(value);
    case UI_FOLLOWS_FIELD:
      // Absent means the default: the interface follows the conversation.
      return value === undefined || value === null || value === "" ? true : toBool(value);
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
  var config = {};
  for (var index = 0; index < VALUE_FIELDS.length; index += 1) {
    var field = VALUE_FIELDS[index];
    config[field] = normalizeField(field, source[field]);
  }
  config[PER_THEME_FIELD] = toBool(source[PER_THEME_FIELD]);
  config[DARK_VALUES_FIELD] = normalizeDarkValues(source[DARK_VALUES_FIELD]);
  config[PRESETS_FIELD] = normalizePresets(source[PRESETS_FIELD]);
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
 * Validate and normalize one sparse axis-value map (dark overrides, presets).
 * Only known axis fields survive, each clamped.
 * @param {unknown} values - candidate map.
 * @returns {Record<string, string|number|boolean>} the safe subset.
 */
function normalizeValueSet(values) {
  var out = {};
  if (values === null || typeof values !== "object" || Array.isArray(values)) return out;
  for (var index = 0; index < VALUE_FIELDS.length; index += 1) {
    var field = VALUE_FIELDS[index];
    if (!Object.prototype.hasOwnProperty.call(values, field)) continue;
    out[field] = normalizeField(field, values[field]);
  }
  return out;
}

/**
 * Parse and validate the durable `darkValues` JSON string.
 * @param {unknown} value - candidate JSON text or object.
 * @returns {Record<string, string|number|boolean>} the sparse override map.
 */
function normalizeDarkValues(value) {
  if (typeof value === "string") {
    if (value.trim() === "") return {};
    try {
      value = JSON.parse(value);
    } catch (error) {
      return {};
    }
  }
  return normalizeValueSet(value);
}

/**
 * Parse and validate the durable `presets` JSON string.
 * @param {unknown} value - candidate JSON text or array.
 * @returns {{name: string, values: object, savedAt: number}[]}
 */
function normalizePresets(value) {
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
      values: normalizeValueSet(entry.values),
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
    /(?:yahei|jhenghei|pingfang|hiragino|simsun|simhei|nsimsun|kaiti|fangsong|meiryo|yu ?goth|yu ?minch|ms ?gothic|ms ?mincho|noto (?:sans|serif) (?:sc|tc|cjk|jp|kr|hk)|source han|sourcehansc|sourcehanserifc|sarasa|misans|harmonyos|wenquanyi|lxgw|unifont|dengxian)/.test(
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
 * The PART-token suffixes DSH appends for single-axis consumers.
 */
var PART_SUFFIXES = ["-font-size", "-line-height", "-font-family", "-font-weight", "-font-style"];

/**
 * The bare family variables, which are NOT `font` shorthands.
 */
var FAMILY_VARS = { "--dsw-font-family": true, "--dsw-font-mono": true, "--ds-font-family-code": true };

/**
 * A `body, body *` selector list, kept in one place because every global
 * declaration needs the same reach (DSH writes some tokens on descendants).
 * @param {string} declarations - CSS declarations without braces.
 * @returns {string} the rule.
 */
function bodyAndDescendants(declarations) {
  return "body,body *{" + declarations + "}";
}

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
 * Whether one token (name + value) is a `font` shorthand this plugin may
 * rewrite: a bare `--dsw-font-…` name whose value parses as a shorthand.
 * @param {string} name - custom property name.
 * @param {string} value - the token's untouched value.
 * @returns {boolean}
 */
function isShorthandToken(name, value) {
  return isShorthandName(name) && parseShorthand(value) !== null;
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
 * The interface PART size tokens: everything scalable except the code and
 * markdown families and the delta tokens (which the dialog offset shifts
 * additively, never multiplicatively).
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {string[]} the names the interface offset re-declares.
 */
function bodyTokenNames(baseTokens) {
  return tokenNames(baseTokens).filter(function (name) {
    return (
      !isCodeToken(name) &&
      !isMarkdownToken(name) &&
      !isDeltaToken(name) &&
      !isContentToken(name)
    );
  });
}

/**
 * The interface line-height PART tokens (non-code, non-markdown).
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {string[]}
 */
function uiLineTokenNames(baseTokens) {
  return bodyTokenNames(baseTokens).filter(function (name) {
    return name.indexOf("-line-height") >= 0;
  });
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
 * The markdown content-size DELTA tokens present in a base map.
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {string[]}
 */
function deltaTokenNames(baseTokens) {
  if (baseTokens === null || typeof baseTokens !== "object") return [];
  return Object.keys(baseTokens).filter(isDeltaToken);
}

/**
 * The code PART tokens: the `font` shorthands' size/height parts, when the
 * live stylesheets declare them. The shorthands themselves are handled by
 * `codeShorthandTokens`, so they are excluded here to avoid double
 * declarations.
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {string[]}
 */
function codeTokenNames(baseTokens) {
  return tokenNames(baseTokens).filter(function (name) {
    return isCodeToken(name) && !isShorthandName(name);
  });
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
 * The interface (non-markdown, non-code) `font` shorthand tokens.
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {{name: string, parts: object}[]}
 */
function uiShorthandTokens(baseTokens) {
  return shorthandTokens(baseTokens).filter(function (entry) {
    return !isMarkdownToken(entry.name) && !isCodeToken(entry.name);
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
var CODE_SELECTOR = [
  "pre",
  "code",
  "kbd",
  "samp",
  "var",
  "tt",
  "textarea",
  ".cm-editor",
  ".dfp-previewCode",
  '[class*="code" i]',
  '[class*="terminal" i]',
]
  .map(function (selector) {
    return selector + "," + selector + " *";
  })
  .join(",");

/**
 * Everything a code surface must be excluded from a DIALOG-scoped rule:
 * the code elements themselves AND their descendants (a highlight `<span>`
 * inside a `<pre>` is not a `pre`, so the exclusion has to reach through
 * ancestry with complex `:not()` arguments — supported by the Chromium line
 * DSH targets).
 */
var CODE_EXCLUDES = [
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
]
  .map(function (selector) {
    return ":not(" + selector + ")";
  })
  .join("");

/**
 * The dialog surface: DSH renders the conversation markdown in a CSS-module
 * container whose class hashes per release (`_markdown_<hash>_…`). A
 * class-substring match degrades safely — no match means the dialog follows
 * the interface axis, the same behavior as an unknown token name.
 */
var MARKDOWN_SELECTOR =
  '[class*="_markdown_" i]' +
  CODE_EXCLUDES +
  ',[class*="_markdown_" i] *' +
  CODE_EXCLUDES;

/** The dark-theme attribute DSH's ThemePresenter writes on body. */
var DARK_ATTR = "body[data-ds-dark-theme]";

/**
 * Everything the INTERFACE weight rule must stay out of.
 *
 * A weight can only be expressed as a `body, body *` rule: DSH pins its labels
 * with literal weights on class rules (`…_label{font-weight:500}`,
 * `…_heading{font-weight:600}`) that nothing narrower reaches. That rule would
 * otherwise cover the conversation too, so the conversation markdown subtree is
 * excluded here — and with it every code surface, because the code axis owns
 * those and the two rules would otherwise fight over the same elements (the
 * `:not()` arguments raise this rule's specificity above a single class).
 *
 * `dfp-previewDialog` is the card's conversation preview: it carries the
 * conversation's own weight, so the interface rule must not flatten it. The
 * interface's own preview stays inside the rule, and `dfp-previewCode` is a
 * code surface like any other.
 */
var INTERFACE_EXCLUDES =
  CODE_EXCLUDES +
  ":not(.cm-editor):not(.cm-editor *):not(.dfp-previewCode):not(.dfp-previewCode *)" +
  ':not([class*="_markdown_" i]):not([class*="_markdown_" i] *)' +
  ":not(.dfp-previewDialog):not(.dfp-previewDialog *)";

/**
 * Prefix every selector in a comma list, for the per-theme rules.
 * @param {string} selectorList - a comma-separated selector list.
 * @param {string} prefix - the prefix to prepend to each selector.
 * @returns {string} the prefixed list.
 */
function prefixSelector(selectorList, prefix) {
  var parts = selectorList.split(",");
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
    clampWeight(axis[WEIGHT_FIELD]) === WEIGHT_UNSET &&
    clampWeight(axis[WEIGHT_DIALOG_FIELD]) === WEIGHT_UNSET &&
    clampWeight(axis[CODE_WEIGHT_FIELD]) === WEIGHT_UNSET &&
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
function buildAxisCss(axis, baseTokens, isDark) {
  var sans = formatStack(parseStack(axis[SANS_FIELD]));
  var mono = formatStack(parseStack(axis[MONO_FIELD]));
  var declarations = [];

  function blanket(declarations, excludes) {
    // The exclusion reaches the descendants only: `body` itself inherits
    // nothing, and neither the body element nor its dark attribute can be a
    // markdown container or a code surface.
    var suffix = excludes === undefined ? "" : excludes;
    var selector = isDark
      ? DARK_ATTR + "," + DARK_ATTR + " *" + suffix
      : "body,body *" + suffix;
    return selector + "{" + declarations + "}";
  }
  function codeRule(declarations) {
    var selector = isDark ? prefixSelector(CODE_SELECTOR, DARK_ATTR) : CODE_SELECTOR;
    return selector + "{" + declarations + "}";
  }
  function dialogRule(declarations) {
    var selector = isDark ? prefixSelector(MARKDOWN_SELECTOR, DARK_ATTR) : MARKDOWN_SELECTOR;
    return selector + "{" + declarations + "}";
  }
  /**
   * Re-assert the code family inside the dialog: scoped under the markdown
   * container, after the dialog rule and above it in specificity, so a
   * serif conversation keeps monospaced code.
   */
  function pushScopedCodeFamily() {
    var scopedCode = [];
    var surfaces = CODE_SELECTOR.split(",");
    for (var cIndex = 0; cIndex < surfaces.length; cIndex += 1) {
      scopedCode.push('[class*="_markdown_" i] ' + surfaces[cIndex]);
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

  // ---- interface weight ----
  // Measured on rc.2 (live page, computed styles): a `body{font-weight}` rule
  // only reaches the elements that INHERIT their weight, while `body, body *`
  // also reaches the labels DSH pins with a literal weight on a class rule —
  // which is why the axis has to be blanket, and why the rule without the
  // markdown exclusion drags the conversation along with it. With the
  // exclusion the interface still moves and the markdown subtree does not.
  var interfaceWeight = axis[WEIGHT_FIELD];
  var codeWeight = axis[CODE_WEIGHT_FIELD];
  if (interfaceWeight !== WEIGHT_UNSET) {
    declarations.push(
      blanket("font-weight:" + interfaceWeight + " !important", INTERFACE_EXCLUDES)
    );
    if (codeWeight === WEIGHT_UNSET) {
      // Code surfaces are excluded from the blanket rule, so without this they
      // would inherit the interface weight from body. `normal` is what DSH
      // computes for them (the code `font` shorthands carry no weight), so an
      // unset code weight keeps code exactly as DSH shipped it.
      declarations.push(codeRule("font-weight:normal !important"));
    }
  }

  // ---- dialog family (scoped; skipped when it equals the interface) ----
  var dialog = formatStack(parseStack(axis[STACK_DIALOG_FIELD]));
  if (dialog !== "" && dialog !== sans) {
    declarations.push(dialogRule("font-family:" + dialog + " !important"));
    if (mono !== "") {
      // Keep the code family inside the dialog.
      pushScopedCodeFamily();
    }
  }

  // ---- dialog weight (uniform inside the conversation) ----
  var dialogWeight = axis[WEIGHT_DIALOG_FIELD];
  if (dialogWeight !== WEIGHT_UNSET) {
    declarations.push(dialogRule("font-weight:" + dialogWeight + " !important"));
    // The card's conversation preview simulates this surface, so it takes the
    // same weight (and is excluded from the interface rule above).
    declarations.push(
      (isDark ? DARK_ATTR + " " : "") +
        ".dfp-previewDialog{font-weight:" +
        dialogWeight +
        " !important}"
    );
  }

  // ---- dialog size offset (additive, on the official content-size source) ----
  // Every markdown size derives from the official content-size chain, and that
  // chain is COMPUTED ON BODY: custom properties resolve where they are
  // declared, so overriding the size deeper down would leave the derived tokens
  // (secondary size, both deltas, delta-based heading sizes, heights) at their
  // body-computed values. The offset is therefore added once, at the source —
  // `--dsh-content-font-size` becomes "official base + offset" — and the whole
  // ladder follows by derivation, with nothing counted twice. The interface
  // axis never touches this chain (see `bodyTokenNames`), so the conversation
  // moves only when this axis says so, and a dialog that FOLLOWS the interface
  // follows it through this value.
  var dialogOffsetValue = axis[SIZE_DIALOG_FIELD];
  if (dialogOffsetValue !== 0) {
    var contentSources = tokenNames(baseTokens).filter(function (name) {
      if (!isContentToken(name)) return false;
      var base = baseTokens[name];
      // The source token only: the derived ones carry var()/calc() and would
      // add the offset a second time if they were shifted as well.
      return (
        typeof base === "string" &&
        base !== "" &&
        base.indexOf("var(") === -1 &&
        base.indexOf("calc(") === -1
      );
    });
    var contentShift = shiftTokens(contentSources, baseTokens, dialogOffsetValue);
    if (contentShift.length > 0) declarations.push(blanket(contentShift.join(";")));
    // The `small` series is the only markdown family with literal sizes: it
    // does not derive from the chain, so its parts and shorthands shift here.
    var literals = markdownTokenNames(baseTokens).filter(function (name) {
      var base = baseTokens[name];
      return name.indexOf("-font-size") >= 0 && typeof base === "string" && base.indexOf("var(") === -1;
    });
    var literalShift = shiftTokens(literals, baseTokens, dialogOffsetValue);
    if (literalShift.length > 0) declarations.push(blanket(literalShift.join(";")));
    // The shorthands whose size is a literal (the small series) must ride the
    // shift too; the delta-derived shorthands flow through the chain above.
    var sizeShifted = [];
    var markdownEntries = shorthandTokens(baseTokens).filter(function (entry) {
      return isMarkdownToken(entry.name) && entry.parts.size.indexOf("var(") === -1;
    });
    for (var mIndex = 0; mIndex < markdownEntries.length; mIndex += 1) {
      var mEntry = markdownEntries[mIndex];
      var mSize =
        "calc((" + mEntry.parts.size + ") + " + dialogOffsetValue + "px)";
      sizeShifted.push(
        mEntry.name + ":" + rebuildShorthand({ lead: mEntry.parts.lead, size: mSize, height: mEntry.parts.height, family: mEntry.parts.family }) + " !important"
      );
    }
    if (sizeShifted.length > 0) declarations.push(blanket(sizeShifted.join(";")));
  }

  // ---- dialog line height (ratio, through the shorthand heights) ----
  var dialogLine = axis[LINE_HEIGHT_DIALOG_FIELD];
  if (dialogLine !== LINE_HEIGHT_MIN) {
    var dialogFactor = round(dialogLine / LINE_HEIGHT_MIN, 6);
    var markdownLines = markdownTokenNames(baseTokens).filter(function (name) {
      return name.indexOf("-line-height") >= 0;
    });
    var dialogLineDecls = scaleLineTokens(markdownLines, baseTokens, dialogFactor);
    if (dialogLineDecls.length > 0) declarations.push(blanket(dialogLineDecls.join(";")));
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
      declarations.push(blanket(dialogShorthandShifted.join(";")));
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
    if (codeScaled.length > 0) declarations.push(blanket(codeScaled.join(";")));
  }
  var codeWeightRule = axis[CODE_WEIGHT_FIELD];
  if (codeWeightRule !== WEIGHT_UNSET) {
    declarations.push(codeRule("font-weight:" + codeWeightRule + " !important"));
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
    declarations.push(blanket("font-synthesis:none !important"));
  } else {
    if (noItalic) declarations.push(blanket("font-synthesis-style:none !important"));
    if (noBold) declarations.push(blanket("font-synthesis-weight:none !important"));
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
 * @returns {string} declarations for one `<style>` element ("" when dormant).
 */
function buildFontCss(config, baseTokens) {
  var tokens = baseTokens === undefined || baseTokens === null ? FALLBACK_TOKENS : baseTokens;
  var sets = resolveAxes(config);
  if (isDormant(sets.light) && isDormant(sets.dark)) return "";
  var light = buildAxisCss(sets.light, tokens, false);
  if (sameValueSet(sets.light, sets.dark)) return light;
  var dark = buildAxisCss(sets.dark, tokens, true);
  if (dark === "") return light;
  return light + "\n" + dark;
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
 * Legacy single-purpose helper kept for compatibility: scale the size and the
 * height inside one simple `size/height <family>` shorthand.
 * @param {string} value - a value shaped like `11px/19px var(--ds-font-family-code)`.
 * @param {number} scale - the ratio to apply.
 * @returns {string|null} the scaled shorthand, or null when the shape differs.
 */
function scaleFontShorthand(value, scale) {
  var parts = parseShorthand(value);
  if (parts === null || parts.lead !== "") return null;
  return (
    "calc((" + parts.size + ") * " + scale + ")/calc((" + parts.height + ") * " + scale + ") " + parts.family
  );
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
  VALUE_FIELDS: VALUE_FIELDS,
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
  LIGATURES_ON: LIGATURES_ON,
  LIGATURES_OFF: LIGATURES_OFF,
  MARKER: MARKER,
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
  MARKDOWN_SELECTOR: MARKDOWN_SELECTOR,
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
  isDeltaToken: isDeltaToken,
  isShorthandName: isShorthandName,
  isShorthandToken: isShorthandToken,
  isScaledToken: isScaledToken,
  tokenNames: tokenNames,
  codeTokenNames: codeTokenNames,
  markdownTokenNames: markdownTokenNames,
  bodyTokenNames: bodyTokenNames,
  uiLineTokenNames: uiLineTokenNames,
  deltaTokenNames: deltaTokenNames,
  shorthandTokens: shorthandTokens,
  markdownShorthandTokens: markdownShorthandTokens,
  uiShorthandTokens: uiShorthandTokens,
  codeShorthandTokens: codeShorthandTokens,
  scaleFontShorthand: scaleFontShorthand,
  isGenericFamilyName: isGenericFamilyName,
  isCJKFamilyName: isCJKFamilyName,
  setWestEntry: setWestEntry,
  setEastEntry: setEastEntry,
  removeStackEntry: removeStackEntry,
};

if (typeof module !== "undefined" && module.exports) module.exports = shared;
