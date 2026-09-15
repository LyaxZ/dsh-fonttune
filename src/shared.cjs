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
 * @module dsh-fonttune/shared
 */
"use strict";

/** Settings namespace registered by the host half. */
var NAMESPACE = "dsh-fonttune";

/** Field carrying the body/UI CSS font-family stack (empty = leave DSH alone). */
var SANS_FIELD = "sans";

/** Field carrying the code CSS font-family stack (empty = leave DSH alone). */
var MONO_FIELD = "mono";

/** Field carrying the body/UI font-size offset in px (0 = leave DSH alone). */
var SIZE_FIELD = "sizeOffset";

/** Field carrying the code font-size offset in px (0 = leave DSH alone). */
var CODE_SIZE_FIELD = "sizeOffsetCode";

/** Field carrying the global font weight (0 = leave DSH alone). */
var WEIGHT_FIELD = "weight";

/** Allowed font-size offset range. The upper bound stays under a 2x scale. */
var SIZE_MIN = -3;
var SIZE_MAX = 6;

/** Allowed font weight range, and the value meaning "do not touch". */
var WEIGHT_MIN = 300;
var WEIGHT_MAX = 600;
var WEIGHT_UNSET = 0;

/** Marker on both injected style tags, used for scoping every rule we write. */
var MARKER = "dfp";

/** `data-plugin-css` value of the tag applying families/offset/weight. */
var STYLE_TAG = "dsh-fonttune";

/** `data-plugin-css` value of the card's own chrome stylesheet. */
var CARD_STYLE_TAG = "dsh-fonttune-card";

/** Composition defaults: every axis dormant, so installing changes nothing. */
var DEFAULTS = {
  sans: "",
  mono: "",
  sizeOffset: 0,
  sizeOffsetCode: 0,
  weight: WEIGHT_UNSET,
};

/**
 * Longest accepted font stack, in characters (mirrored by the host schema).
 */
var MAX_STACK_LENGTH = 200;

/** Longest accepted single family name, in characters. */
var MAX_FAMILY_LENGTH = 64;

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
 * Normalize a configuration-shaped object coming from the settings document,
 * a config layer, or a test fixture.
 * @param {unknown} value - candidate configuration.
 * @returns {{sans: string, mono: string, sizeOffset: number, sizeOffsetCode: number, weight: number}} the normalized config.
 */
function normalizeConfig(value) {
  var source = value !== null && typeof value === "object" ? value : {};
  var size = clampOffset(source[SIZE_FIELD]);
  var codeSize = clampOffset(source[CODE_SIZE_FIELD]);
  var weight = Number(source[WEIGHT_FIELD]);
  if (!isFinite(weight)) weight = WEIGHT_UNSET;
  weight = Math.round(weight);
  if (weight !== WEIGHT_UNSET) {
    weight = Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, weight));
  }
  var config = {};
  config[SANS_FIELD] = sanitize(source[SANS_FIELD]).slice(0, MAX_STACK_LENGTH);
  config[MONO_FIELD] = sanitize(source[MONO_FIELD]).slice(0, MAX_STACK_LENGTH);
  config[SIZE_FIELD] = size;
  config[CODE_SIZE_FIELD] = codeSize;
  config[WEIGHT_FIELD] = weight;
  return config;
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
 * Whether a configuration asks for any change at all.
 * @param {{sans: string, mono: string, sizeOffset: number, sizeOffsetCode: number, weight: number}} config - normalized config.
 * @returns {boolean} true when nothing should be injected.
 */
function isDormant(config) {
  return (
    config[SANS_FIELD] === "" &&
    config[MONO_FIELD] === "" &&
    config[SIZE_FIELD] === 0 &&
    config[CODE_SIZE_FIELD] === 0 &&
    config[WEIGHT_FIELD] === WEIGHT_UNSET
  );
}

/**
 * Build the stylesheet one configuration applies.
 *
 * Families are declared at their SOURCE: DSH's design tokens chain to two
 * variables (`--dsw-font-family` for every sans token, `--ds-font-family-code`
 * for every code token — verified against the shipped theme), so overriding
 * those variables is what reaches the conversation markdown and the sidebar,
 * whose elements declare `font-family: var(--dsw-font-family)` themselves and
 * would never inherit a plain `body` rule. The explicit `body` / `pre,code`
 * rules stay as a second path for elements that hardcode a family.
 *
 * The size offsets rewrite DSH's own design tokens rather than every element:
 * a token whose name ends in `-font-size` or `-line-height` is re-declared as
 * itself multiplied by one scale factor. `baseTokens` supplies the untouched
 * values (read from the live document, falling back to the embedded map), so
 * the ratio composes with DSH's own font-size slider instead of replacing it.
 *
 * Body and code are two independent axes. Body sizes hang off the content-size
 * chain (`--dsh-content-font-size` and the `--dsw-font-*` steps), while every
 * markdown code token is a bare literal (`--dsw-font-markdown-code-block:
 * 11px/19px …`) that the content chain never touches — so the code axis is the
 * only thing that moves it, and the body axis deliberately leaves those tokens
 * alone. Code sizing is consumed through the `font` SHORTHAND tokens (that is
 * what the shipped stylesheets use), which is why those are re-declared too,
 * not just their `-font-size` / `-line-height` parts.
 *
 * @param {{sans: string, mono: string, sizeOffset: number, sizeOffsetCode: number, weight: number}} config - normalized config.
 * @param {Record<string, string>} [baseTokens] - token name to untouched value.
 * @returns {string} declarations for one `<style>` element ("" when dormant).
 */
function buildFontCss(config, baseTokens) {
  var normalized = normalizeConfig(config);
  var sans = formatStack(parseStack(normalized[SANS_FIELD]));
  var mono = formatStack(parseStack(normalized[MONO_FIELD]));
  var offset = normalized[SIZE_FIELD];
  var codeOffset = normalized[CODE_SIZE_FIELD];
  var weight = normalized[WEIGHT_FIELD];
  if (isDormant(normalized)) return "";
  var declarations = [];

  if (sans !== "") {
    declarations.push(":root,body{--dsw-font-family:" + sans + " !important}");
    declarations.push("body{font-family:" + sans + " !important}");
  }
  if (mono !== "") {
    // The theme's code tokens chain to `--ds-font-family-code`; the other name
    // is what dsh-ui-font historically wrote and costs nothing to cover.
    declarations.push(
      ":root,body{--dsw-font-mono:" + mono + " !important;--ds-font-family-code:" + mono + " !important}"
    );
    // Written after the body rule: equal specificity on a code element means
    // the later declaration wins, so code keeps its own family inside the UI.
    declarations.push(
      "pre,code,kbd,samp,var,tt,textarea,.cm-editor .cm-content{font-family:" +
        mono +
        " !important}"
    );
  }
  if (offset !== 0) {
    var scaled = scaleTokens(bodyTokenNames(baseTokens), baseTokens, round(scaleFor(offset), 6));
    if (scaled.length > 0) {
      declarations.push(bodyAndDescendants(scaled.join(";")));
    }
  }
  if (codeOffset !== 0) {
    var scaledCode = scaleCodeTokens(baseTokens, round(scaleFor(codeOffset), 6));
    if (scaledCode.length > 0) {
      declarations.push(bodyAndDescendants(scaledCode.join(";")));
    }
  }
  if (weight !== WEIGHT_UNSET) {
    // Written as the user chose it: a variable font honors every integer, and
    // a static one rounds to its own nearest step by itself.
    declarations.push(bodyAndDescendants("font-weight:" + weight + " !important"));
  }
  return declarations.join("\n");
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
 * Scale one set of tokens by one ratio.
 *
 * A base that itself references another token via var() derives from it:
 * scaling the var target already scales this one, so re-scaling here would
 * compound (markdown-base = var(--dsh-content-font-size) would take the ratio
 * twice). DSH's chain does the work instead.
 *
 * `!important` is required: the theme writes `--dsh-content-font-size` INLINE on
 * body, and an inline declaration outranks a plain stylesheet one — without the
 * flag body itself would keep DSH's own size while every descendant scales,
 * splitting the page in two.
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
 * Re-declare the markdown code tokens at their own ratio.
 *
 * Two shapes exist and both must be covered, because the shipped stylesheets
 * consume the shorthand (`font: var(--dsw-font-markdown-code-block-small)`)
 * while the split tokens exist for anything that asks for a single part:
 * `11px/19px <family>` and a bare `11px`.
 *
 * @param {Record<string, string>} baseTokens - token name to untouched value.
 * @param {number} scale - the ratio to apply.
 * @returns {string[]} declarations.
 */
function scaleCodeTokens(baseTokens, scale) {
  var names = codeTokenNames(baseTokens);
  var out = [];
  for (var index = 0; index < names.length; index += 1) {
    var name = names[index];
    var base = baseTokens[name];
    if (typeof base !== "string" || base === "") continue;
    var shorthand = scaleFontShorthand(base, scale);
    if (shorthand !== null) {
      out.push(name + ":" + shorthand + " !important");
      continue;
    }
    // A part token that derives from another token follows that token's own
    // scaling; re-declaring it here would compound the ratio.
    if (base.indexOf("var(") !== -1) continue;
    if (!isScalableValue(base)) continue;
    out.push(name + ":calc((" + base + ") * " + scale + ") !important");
  }
  return out;
}

/**
 * Multiply the size and the line height inside one `font` shorthand value,
 * leaving the family list (and anything else after it) untouched.
 * @param {string} value - a value shaped like `11px/19px var(--ds-font-family-code)`.
 * @param {number} scale - the ratio to apply.
 * @returns {string|null} the scaled shorthand, or null when the shape differs.
 */
function scaleFontShorthand(value, scale) {
  var slash = value.indexOf("/");
  if (slash <= 0) return null;
  var size = value.slice(0, slash).trim();
  var rest = value.slice(slash + 1).trim();
  var gap = rest.search(/\s/);
  if (gap <= 0) return null;
  var height = rest.slice(0, gap).trim();
  var family = rest.slice(gap + 1).trim();
  if (size === "" || height === "" || family === "") return null;
  if (!isScalableValue(size) || !isScalableValue(height)) return null;
  return (
    "calc((" + size + ") * " + scale + ")/calc((" + height + ") * " + scale + ") " + family
  );
}

/**
 * Match DSH's typography tokens: the design system's sizes plus the content
 * size the theme plugin writes on `body` (whose secondary variant carries a
 * suffix of its own). Line heights scale with sizes so a token's shorthand
 * never disagrees with its parts.
 *
 * Deliberately a shape test rather than an enumeration: DSH generates these
 * tokens at runtime, so whatever a future release names them, a token that
 * ends in a size or a line height is one that must scale.
 */
var TOKEN_PATTERN = /^--(?:dsw-font-[a-z0-9-]*|dsh-content-font)-(?:font-size|line-height)(?:-secondary)?$|^--dsh-content-font-(?:size|line-height)(?:-secondary)?$/;

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
 * Whether one custom-property name is a token this plugin scales.
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean} true when the token carries a size or a line height.
 */
function isFontToken(name) {
  return typeof name === "string" && TOKEN_PATTERN.test(name);
}

/**
 * Match DSH's markdown code tokens, which are their own sizing axis.
 *
 * The theme declares these as literals the content-size chain never reaches
 * (`--dsw-font-markdown-code:12px/19px …`, `-code-block:11px/19px …`,
 * `-code-block-small:11px/16px …`), and the shipped stylesheets consume them
 * through the `font` shorthand. Everything with this prefix therefore belongs
 * to the code offset and to nothing else.
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean} true when the token sizes code.
 */
function isCodeToken(name) {
  return typeof name === "string" && name.indexOf("--dsw-font-markdown-code") === 0;
}

/**
 * Whether a token is one this plugin re-declares at all.
 * @param {string} name - custom property name including the leading dashes.
 * @returns {boolean} true for body sizes, body line heights and code tokens.
 */
function isScaledToken(name) {
  return isFontToken(name) || isCodeToken(name);
}

/**
 * Ordered token names present in a base map, sizes before line heights so a
 * reader of the stylesheet sees each size next to its height.
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {string[]} the names to scale.
 */
function tokenNames(baseTokens) {
  if (baseTokens === null || typeof baseTokens !== "object") return [];
  var names = Object.keys(baseTokens).filter(isScaledToken);
  names.sort(function (left, right) {
    if (left.length !== right.length) return left.length - right.length;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return names;
}

/**
 * The body/UI tokens: everything this plugin scales except the code family,
 * which answers to its own offset.
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {string[]} the names the body offset re-declares.
 */
function bodyTokenNames(baseTokens) {
  return tokenNames(baseTokens).filter(function (name) {
    return !isCodeToken(name);
  });
}

/**
 * The code tokens: the `font` shorthands plus their `-font-size` /
 * `-line-height` parts, when the live stylesheets declare them.
 * @param {Record<string, string>} [baseTokens] - token name to value.
 * @returns {string[]} the names the code offset re-declares.
 */
function codeTokenNames(baseTokens) {
  return tokenNames(baseTokens).filter(isCodeToken);
}

/**
 * Embedded fallback for the tokens the theme plugin defines at runtime.
 *
 * The live document is always preferred; this map only covers the window
 * before those declarations exist (and any token a future release renames
 * away from the pattern). Values mirror the size/line-height pairs shipped in
 * DSH 0.1.5-rc.2.
 */
var FALLBACK_TOKENS = {
  "--dsw-font-xxxs-11-font-size": "11px",
  "--dsw-font-xxxs-11-line-height": "18px",
  "--dsw-font-xxxs-strong-11-font-size": "11px",
  "--dsw-font-xxxs-strong-11-line-height": "18px",
  "--dsw-font-xxs-12-font-size": "12px",
  "--dsw-font-xxs-12-line-height": "20px",
  "--dsw-font-xxs-strong-12-font-size": "12px",
  "--dsw-font-xxs-strong-12-line-height": "20px",
  "--dsw-font-xs-13-font-size": "13px",
  "--dsw-font-xs-13-line-height": "22px",
  "--dsw-font-xs-strong-13-font-size": "13px",
  "--dsw-font-xs-strong-13-line-height": "22px",
  "--dsw-font-s-14-font-size": "14px",
  "--dsw-font-s-14-line-height": "24px",
  "--dsw-font-s-strong-14-font-size": "14px",
  "--dsw-font-s-strong-14-line-height": "24px",
  "--dsw-font-base-16-font-size": "16px",
  "--dsw-font-base-16-line-height": "26px",
  "--dsw-font-base-strong-16-font-size": "16px",
  "--dsw-font-base-strong-16-line-height": "26px",
  "--dsw-font-m-18-font-size": "18px",
  "--dsw-font-m-18-line-height": "28px",
  "--dsw-font-l-20-font-size": "20px",
  "--dsw-font-l-20-line-height": "30px",
  "--dsw-font-xl-24-font-size": "24px",
  "--dsw-font-xl-24-line-height": "34px",
  "--dsw-font-markdown-base-font-size": "14px",
  "--dsw-font-markdown-base-line-height": "24px",
  "--dsw-font-markdown-small-font-size": "13px",
  "--dsw-font-markdown-small-line-height": "22px",
  "--dsw-font-markdown-h1-font-size": "21px",
  "--dsw-font-markdown-h1-line-height": "30px",
  "--dsw-font-markdown-h2-font-size": "19px",
  "--dsw-font-markdown-h2-line-height": "28px",
  "--dsw-font-markdown-h3-font-size": "17px",
  "--dsw-font-markdown-h3-line-height": "26px",
  "--dsw-font-markdown-h4-font-size": "15px",
  "--dsw-font-markdown-h4-line-height": "24px",
  // The code family is consumed through the `font` shorthand, so the shorthand
  // names matter more than their parts — both are listed, at rc.2's values.
  "--dsw-font-markdown-code": "12px/19px var(--ds-font-family-code)",
  "--dsw-font-markdown-code-font-size": "12px",
  "--dsw-font-markdown-code-line-height": "19px",
  "--dsw-font-markdown-code-block": "11px/19px var(--ds-font-family-code)",
  "--dsw-font-markdown-code-block": "11px/19px var(--ds-font-family-code)",
  "--dsw-font-markdown-code-block-font-size": "11px",
  "--dsw-font-markdown-code-block-line-height": "19px",
  "--dsw-font-markdown-code-block-small": "11px/16px var(--ds-font-family-code)",
  "--dsw-font-markdown-code-block-small-font-size": "11px",
  "--dsw-font-markdown-code-block-small-line-height": "16px",
  "--dsw-font-markdown-table-font-size": "13px",
  "--dsw-font-markdown-table-line-height": "22px",
  "--dsh-content-font-size": "14px",
  "--dsh-content-font-size-secondary": "13px",
};

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

var shared = {
  NAMESPACE: NAMESPACE,
  SANS_FIELD: SANS_FIELD,
  MONO_FIELD: MONO_FIELD,
  SIZE_FIELD: SIZE_FIELD,
  CODE_SIZE_FIELD: CODE_SIZE_FIELD,
  WEIGHT_FIELD: WEIGHT_FIELD,
  SIZE_MIN: SIZE_MIN,
  SIZE_MAX: SIZE_MAX,
  WEIGHT_MIN: WEIGHT_MIN,
  WEIGHT_MAX: WEIGHT_MAX,
  WEIGHT_UNSET: WEIGHT_UNSET,
  MARKER: MARKER,
  STYLE_TAG: STYLE_TAG,
  CARD_STYLE_TAG: CARD_STYLE_TAG,
  DEFAULTS: DEFAULTS,
  MAX_STACK_LENGTH: MAX_STACK_LENGTH,
  MAX_FAMILY_LENGTH: MAX_FAMILY_LENGTH,
  FALLBACK_TOKENS: FALLBACK_TOKENS,
  PRESETS: PRESETS,
  sanitize: sanitize,
  sanitizeFamily: sanitizeFamily,
  quoteFamily: quoteFamily,
  normalizeConfig: normalizeConfig,
  formatStack: formatStack,
  parseStack: parseStack,
  scaleFor: scaleFor,
  isDormant: isDormant,
  buildFontCss: buildFontCss,
  isFontToken: isFontToken,
  isCodeToken: isCodeToken,
  isScaledToken: isScaledToken,
  codeTokenNames: codeTokenNames,
  bodyTokenNames: bodyTokenNames,
  scaleFontShorthand: scaleFontShorthand,
  isGenericFamilyName: isGenericFamilyName,
  isCJKFamilyName: isCJKFamilyName,
  setWestEntry: setWestEntry,
  setEastEntry: setEastEntry,
  removeStackEntry: removeStackEntry,
};

if (typeof module !== "undefined" && module.exports) module.exports = shared;
