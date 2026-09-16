/**
 * dsh-fonttune — host half.
 *
 * Two jobs, both small:
 *
 * 1. Register the `dsh-fonttune` settings namespace so the durable values live
 *    in the Host user-settings document next to every other preference. The
 *    plugin's own composition entry is the base layer, so a value the user
 *    clears falls back to the profile's config rather than to nothing.
 * 2. Contribute the first-frame stylesheet to the served index as an `html` row.
 *    The browser half applies the same declarations once it activates, but that
 *    is after the shell has already painted; injecting here is what keeps the
 *    first frame from flashing DSH's default typography. The row carries this
 *    plugin's `data-plugin-css` stamp on purpose: the browser half adopts that
 *    element instead of appending a second copy, because a served copy is only
 *    rebuilt on the next index render and could never drop a rule the settings
 *    no longer produce. When `perTheme` is on, the row carries the dark theme's
 *    rules prefixed with the dark-theme attribute, so the first paint of each
 *    theme already uses that theme's own values.
 *
 * @module dsh-fonttune
 */
import z from "@deepseek-ai/schemastery";
// Default import, not named: `shared.cjs` is a CommonJS module, and Node's
// CJS-to-ESM interop only guarantees `module.exports` as the default binding
// (statically-detected named exports would break this half at boot).
import shared from "./shared.cjs";

const {
  buildFontCss,
  CODE_LINE_HEIGHT_FIELD,
  CODE_SIZE_FIELD,
  CODE_WEIGHT_FIELD,
  DARK_VALUES_FIELD,
  FALLBACK_TOKENS,
  FEATURES_FIELD,
  LIGATURES_FIELD,
  LINE_HEIGHT_DIALOG_FIELD,
  LINE_HEIGHT_FIELD,
  MAX_FEATURES_LENGTH,
  MAX_STACK_LENGTH,
  MONO_FIELD,
  NAMESPACE,
  normalizeConfig,
  NO_SYNTHETIC_BOLD_FIELD,
  NO_SYNTHETIC_ITALIC_FIELD,
  PER_THEME_FIELD,
  SANS_FIELD,
  SIZE_DIALOG_FIELD,
  SIZE_FIELD,
  STACK_DIALOG_FIELD,
  STYLE_TAG,
  WEIGHT_DIALOG_FIELD,
  WEIGHT_FIELD,
} = shared;

/**
 * Characters a declaration cannot survive: they would close the declaration,
 * the rule, or the `<style>` element the row is rendered into.
 */
const SAFE_STACK = /^[^{};<>\\]*$/;

/**
 * Stack length accepted by the durable schema, in characters.
 */
const MAX_STACK = 200;

/**
 * A `font-feature-settings` value may only carry feature tags, on/off/number
 * and the entry separators — anything else cannot appear in a valid value.
 */
const SAFE_FEATURES = /^[a-zA-Z0-9"' ,]*$/;

/**
 * The durable settings section.
 *
 * Every field defaults to "leave DSH alone": an empty stack injects no family
 * rule, a zero offset injects no size rule, a ratio of 100 injects no
 * line-height rule, and a zero weight injects no weight rule (an unset code
 * weight still writes the rule that keeps code out of the interface/dialog
 * weights). A dialog field left at its neutral value follows the interface
 * value. Installing the plugin therefore changes nothing until the user asks
 * for something.
 */
export const Config = z.object({
  [SANS_FIELD]: z
    .string()
    .max(MAX_STACK)
    .pattern(SAFE_STACK)
    .default("")
    .description("CSS font-family list for the interface text"),
  [STACK_DIALOG_FIELD]: z
    .string()
    .max(MAX_STACK)
    .pattern(SAFE_STACK)
    .default("")
    .description(
      "CSS font-family list for the conversation markdown; empty follows the interface stack"
    ),
  [MONO_FIELD]: z
    .string()
    .max(MAX_STACK)
    .pattern(SAFE_STACK)
    .default("")
    .description("CSS font-family list for code and monospaced text"),
  [SIZE_FIELD]: z
    .number()
    .min(shared.SIZE_MIN)
    .max(shared.SIZE_MAX)
    .default(0)
    .description(
      `Interface font-size offset in px (${shared.SIZE_MIN}..${shared.SIZE_MAX}, 0 keeps DSH's own sizes)`
    ),
  [SIZE_DIALOG_FIELD]: z
    .number()
    .min(shared.SIZE_MIN)
    .max(shared.SIZE_MAX)
    .default(0)
    .description(
      "Conversation font-size offset in px; 0 follows the interface offset"
    ),
  [CODE_SIZE_FIELD]: z
    .number()
    .min(shared.SIZE_MIN)
    .max(shared.SIZE_MAX)
    .default(0)
    .description(
      `Code font-size offset in px (${shared.SIZE_MIN}..${shared.SIZE_MAX}, 0 keeps DSH's own sizes; independent of the interface offset)`
    ),
  [WEIGHT_FIELD]: z
    .number()
    .min(shared.WEIGHT_UNSET)
    .max(shared.WEIGHT_MAX)
    .default(shared.WEIGHT_UNSET)
    .description(
      `Interface font weight (${shared.WEIGHT_MIN}..${shared.WEIGHT_MAX}, ${shared.WEIGHT_UNSET} keeps DSH's own weights; code is not affected)`
    ),
  [WEIGHT_DIALOG_FIELD]: z
    .number()
    .min(shared.WEIGHT_UNSET)
    .max(shared.WEIGHT_MAX)
    .default(shared.WEIGHT_UNSET)
    .description(
      "Conversation font weight; 0 follows the interface weight"
    ),
  [CODE_WEIGHT_FIELD]: z
    .number()
    .min(shared.WEIGHT_UNSET)
    .max(shared.WEIGHT_MAX)
    .default(shared.WEIGHT_UNSET)
    .description(
      `Code font weight (${shared.WEIGHT_MIN}..${shared.WEIGHT_MAX}, ${shared.WEIGHT_UNSET} keeps DSH's own weights; independent of the interface weight)`
    ),
  [LINE_HEIGHT_FIELD]: z
    .number()
    .min(shared.LINE_HEIGHT_MIN)
    .max(shared.LINE_HEIGHT_MAX)
    .default(shared.LINE_HEIGHT_MIN)
    .description(
      "Interface line-height ratio in percent (100 keeps DSH's own line heights)"
    ),
  [LINE_HEIGHT_DIALOG_FIELD]: z
    .number()
    .min(shared.LINE_HEIGHT_MIN)
    .max(shared.LINE_HEIGHT_MAX)
    .default(shared.LINE_HEIGHT_MIN)
    .description(
      "Conversation line-height ratio in percent; 100 follows the interface ratio"
    ),
  [CODE_LINE_HEIGHT_FIELD]: z
    .number()
    .min(shared.CODE_LINE_HEIGHT_MIN)
    .max(shared.CODE_LINE_HEIGHT_MAX)
    .default(0)
    .description(
      "Code line-height offset in px (0 keeps DSH's own line heights)"
    ),
  [LIGATURES_FIELD]: z
    .number()
    .min(0)
    .max(2)
    .default(0)
    .description("Code ligatures: 0 DSH default, 1 forced on, 2 forced off"),
  [FEATURES_FIELD]: z
    .string()
    .max(MAX_FEATURES_LENGTH)
    .pattern(SAFE_FEATURES)
    .default("")
    .description("Advanced font-feature-settings value for code"),
  [NO_SYNTHETIC_ITALIC_FIELD]: z
    .boolean()
    .default(false)
    .description("Refuse synthetic italic (stops CJK text from being tilted)"),
  [NO_SYNTHETIC_BOLD_FIELD]: z
    .boolean()
    .default(false)
    .description("Refuse synthetic bold (for faces without a real bold)"),
  [shared.UI_FOLLOWS_FIELD]: z
    .boolean()
    .default(true)
    .description(
      "The interface follows the conversation: its family and weight take the conversation's values (off = the interface keeps its own)"
    ),
  [PER_THEME_FIELD]: z
    .boolean()
    .default(false)
    .description("Keep a separate value set for the dark theme"),
  [DARK_VALUES_FIELD]: z
    .string()
    .max(8000)
    .default("{}")
    .description("Dark theme sparse overrides (JSON map of axis field to value)"),
  [shared.PRESETS_FIELD]: z
    .string()
    .max(20000)
    .default("[]")
    .description("Saved presets (JSON array of {name, values, savedAt})"),
  [shared.ACTIVE_PRESET_FIELD]: z
    .string()
    .max(shared.MAX_PRESET_NAME)
    .default("")
    .description("Name of the preset the card currently edits (edits auto-save into it)"),
});

/**
 * One row of the structured index injection table.
 * @typedef {{kind: "style", text: string} | {kind: "html", placement: "head", html: string}} StyleRow
 */

/**
 * The style row carrying one configuration.
 *
 * Deliberately an `html` row rather than a `style` row: the served `<style>`
 * has to carry the same `data-plugin-css` stamp the browser half writes, so the
 * browser half can ADOPT this element instead of appending a second one. Two
 * copies of the stylesheet cannot be kept in sync — the served row is only
 * rebuilt on the next index render, so a rule the settings no longer produce
 * would keep applying from the stale copy until the user reloads the page.
 * @param {unknown} resolved - the current settings section.
 * @returns {StyleRow} the row the web server renders into `<head>`.
 */
function styleRow(resolved) {
  const cfg = normalizeConfig(resolved);
  // 0.2.0 ships the per-theme editor out; light and dark stay one value set
  // (the dark fields remain in the schema, dormant, for a future release).
  cfg[PER_THEME_FIELD] = false;
  const text = buildFontCss(cfg, FALLBACK_TOKENS);
  // The family sanitizer already refuses `<`, `>` and `/`, so no configuration
  // can close the element early; the guard is here because this row is raw
  // markup and a future input path must not be able to break out of it.
  const safe = text.includes("</style") ? "" : text;
  return {
    kind: "html",
    placement: "head",
    html: `<style data-plugin="${NAMESPACE}" data-plugin-css="${STYLE_TAG}">${safe}</style>`,
  };
}

/**
 * Register the settings section and keep the index in sync with it.
 * @param {object} ctx - host cordis context.
 * @param {unknown} config - the plugin entry's composition config (base layer).
 */
export function apply(ctx, config) {
  let current = () => config;
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, NAMESPACE, Config, config ?? {}, {
      setSource: (source) => {
        current = source;
      },
      // The row table is rebuilt on every index render and every worker boot
      // payload, so each read is already fresh; nothing to invalidate here.
      onChange: () => {},
    });
  });
  ctx.on("webserver/index-inject", (table) => {
    table.push(styleRow(current()));
  });
}
