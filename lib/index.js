/**
 * dsh-fonttune — host half.
 *
 * Two jobs, both small:
 *
 * 1. Register the `dsh-fonttune` settings namespace so the durable values live
 *    in the Host user-settings document next to every other preference. The
 *    plugin's own composition entry is the base layer, so a value the user
 *    clears falls back to the profile's config rather than to nothing.
 * 2. Contribute a `<style>` row to the served index. The browser half applies
 *    the same declarations once it activates, but that is after the shell has
 *    already painted; injecting here is what keeps the first frame from
 *    flashing DSH's default typography.
 *
 * @module dsh-fonttune
 */
import z from "@deepseek-ai/schemastery";
// Default import, not named: `shared.cjs` is a CommonJS module, and Node's
// CJS-to-ESM interop only guarantees `module.exports` as the default binding
// (staticky-detected named exports would break this half at boot).
import shared from "./shared.cjs";

const {
  buildFontCss,
  FALLBACK_TOKENS,
  MONO_FIELD,
  NAMESPACE,
  normalizeConfig,
  SANS_FIELD,
  SIZE_FIELD,
  SIZE_MAX,
  SIZE_MIN,
  WEIGHT_FIELD,
  WEIGHT_MAX,
  WEIGHT_MIN,
  WEIGHT_UNSET,
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
 * The durable settings section.
 *
 * Every field defaults to "leave DSH alone": an empty stack injects no family
 * rule, a zero offset injects no size rule, and a zero weight injects no
 * weight rule. Installing the plugin therefore changes nothing until the user
 * asks for something.
 */
export const Config = z.object({
  [SANS_FIELD]: z
    .string()
    .max(MAX_STACK)
    .pattern(SAFE_STACK)
    .default("")
    .description("CSS font-family list for the UI and conversation text"),
  [MONO_FIELD]: z
    .string()
    .max(MAX_STACK)
    .pattern(SAFE_STACK)
    .default("")
    .description("CSS font-family list for code and monospaced text"),
  [SIZE_FIELD]: z
    .number()
    .min(SIZE_MIN)
    .max(SIZE_MAX)
    .default(0)
    .description(
      `Global font-size offset in px (${SIZE_MIN}..${SIZE_MAX}, 0 keeps DSH's own sizes)`
    ),
  [WEIGHT_FIELD]: z
    .number()
    .min(WEIGHT_UNSET)
    .max(WEIGHT_MAX)
    .default(WEIGHT_UNSET)
    .description(
      `Global font weight (${WEIGHT_MIN}..${WEIGHT_MAX}, ${WEIGHT_UNSET} keeps DSH's own weights)`
    ),
});

/**
 * One row of the structured index injection table.
 * @typedef {{kind: "style", text: string}} StyleRow
 */

/**
 * The style row carrying one configuration.
 * @param {unknown} resolved - the current settings section.
 * @returns {StyleRow} the row the web server renders into `<head>`.
 */
function styleRow(resolved) {
  const text = buildFontCss(normalizeConfig(resolved), FALLBACK_TOKENS);
  return { kind: "style", text };
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
