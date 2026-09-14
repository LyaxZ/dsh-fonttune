/**
 * dsh-fonttune — browser half.
 *
 * Runs inside the DSH web client as a lazy-CJS module bundle (see `build.mjs`).
 * It owns one card in Settings -> Plugins -> Plugin configuration, keyed by the
 * settings namespace the host half registers, and it applies the saved
 * configuration by rewriting a single `<style>` element.
 *
 * Why a style element rather than per-element inline styles: the plugin has to
 * reach elements DSH renders later, and DSH's own font-size slider writes a
 * custom property on `body` at runtime. Reading DSH's typography tokens and
 * re-declaring them multiplied by one ratio keeps the offset composed with
 * that slider instead of replacing it, and keeps every size proportional
 * without compounding through nesting.
 *
 * Module scope stays side-effect free: the loader materializes the factory
 * only when the plugin is first used, and everything that touches the document
 * lives inside `apply`.
 *
 * @module dsh-fonttune/client
 */

var React = require("react");
var createPortal = require("react-dom").createPortal;
var primitives = require("@deepseek-ai/dsh-client-ui-primitives");

var h = React.createElement;
var useCallback = React.useCallback;
var useEffect = React.useEffect;
var useMemo = React.useMemo;
var useRef = React.useRef;
var useState = React.useState;
var useSyncExternalStore = React.useSyncExternalStore;

var shared = require("./shared.cjs");
var NAMESPACE = shared.NAMESPACE;
var SANS_FIELD = shared.SANS_FIELD;
var MONO_FIELD = shared.MONO_FIELD;
var SIZE_FIELD = shared.SIZE_FIELD;
var WEIGHT_FIELD = shared.WEIGHT_FIELD;
var SIZE_MIN = shared.SIZE_MIN;
var SIZE_MAX = shared.SIZE_MAX;
var WEIGHT_MIN = shared.WEIGHT_MIN;
var WEIGHT_MAX = shared.WEIGHT_MAX;
var WEIGHT_UNSET = shared.WEIGHT_UNSET;
var CARD_STYLE_TAG = shared.CARD_STYLE_TAG;
var STYLE_TAG = shared.STYLE_TAG;
var FALLBACK_TOKENS = shared.FALLBACK_TOKENS;
var PRESETS = shared.PRESETS;
var buildFontCss = shared.buildFontCss;
var formatStack = shared.formatStack;
var isFontToken = shared.isFontToken;
var normalizeConfig = shared.normalizeConfig;
var parseStack = shared.parseStack;
var quoteFamily = shared.quoteFamily;
var sanitizeFamily = shared.sanitizeFamily;
var isGenericFamilyName = shared.isGenericFamilyName;
var isCJKFamilyName = shared.isCJKFamilyName;
var setWestEntry = shared.setWestEntry;
var setEastEntry = shared.setEastEntry;
var removeStackEntry = shared.removeStackEntry;

/** Services this bundle waits for before it applies. */
var inject = ["slots", "locale", "settingsScope"];

/** The weight DSH uses for body text; choosing it means "leave it alone". */
var NEUTRAL_WEIGHT = 400;

/** Panel width, kept in one place because positioning reads it too. */
var PANEL_WIDTH = 320;

/** Panel height cap, used to decide whether it opens up or down. */
var PANEL_HEIGHT = 380;

/**
 * Cap on how many enumerated families the picker lists at once: a machine can
 * report well over a thousand, which would make the panel useless.
 */
var MAX_VISIBLE_FONTS = 240;

/* ------------------------------------------------------------------ *
 * copy
 * ------------------------------------------------------------------ */

var DICTS = {
  en: {
    "card.title": "Font plus",
    "card.description":
      "UI and code font families, a global size offset, and font weight",
    "card.expand": "Expand",
    "card.collapse": "Collapse",
    "card.resetAll": "Reset all",
    "card.readOnly": "This deployment keeps settings in memory only.",

    "common.overridden": "Changed",
    "common.reset": "Reset",

    "sans.label": "Body font",
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
    "sansWest.label": "Body · Western",
    "sansEast.label": "Body · CJK",
    "monoWest.label": "Code · Western",
    "monoEast.label": "Code · CJK",
    "split.pick": "Choose…",
    "split.unset": "Not set",
    "split.remove": "Remove {name}",
    "split.rest": "Other fallbacks (reorder them in Advanced): {names}",

    "size.label": "Font size offset",
    "size.hint":
      "Adds {offset} to every size DSH uses, on top of its own font-size setting. 0 keeps DSH's sizes.",
    "size.unit": "px",

    "weight.label": "Font weight",
    "weight.hint": "Overrides text weight everywhere, headings included. Default weight is 400.",
    "weight.unset": "Unset",

    "preview.label": "Preview",
    "preview.sansCaption": "Body",
    "preview.monoCaption": "Code",
    "preview.sample":
      "The quick brown fox jumps over the lazy dog — 中文排版预览，标点符号，数字 0123456789。",
    "preview.code": "const greet = (name) => `hello ${name}`; // 代码预览",

    "footnote.local":
      "Stored in the Host settings document. Every change applies immediately.",
  },
  zh: {
    "card.title": "字体增强",
    "card.description": "正文与代码字体、全局字号偏移、字重",
    "card.expand": "展开",
    "card.collapse": "收起",
    "card.resetAll": "全部重置",
    "card.readOnly": "当前部署只在内存里保存设置。",

    "common.overridden": "已修改",
    "common.reset": "重置",

    "sans.label": "正文字体",
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

    "mode.label": "编辑方式",
    "mode.simple": "简单",
    "mode.advanced": "高级",
    "mode.simpleHint":
      "只管理栈最前面的西文/中文两项；你在高级模式里排好的其余回退原样保留。",
    "sansWest.label": "正文 · 西文字体",
    "sansEast.label": "正文 · 中文字体",
    "monoWest.label": "代码 · 西文字体",
    "monoEast.label": "代码 · 中文字体",
    "split.pick": "选择…",
    "split.unset": "未选择",
    "split.remove": "移除 {name}",
    "split.rest": "其余回退项（在高级模式中排序）：{names}",

    "size.label": "字号偏移",
    "size.hint":
      "给 DSH 使用的每一档字号统一加 {offset}，与设置里的「字号大小」叠加；0 表示保持原样。",
    "size.unit": "px",

    "weight.label": "字重",
    "weight.hint": "覆盖全局文字粗细（含标题）；默认字重为400。",
    "weight.unset": "未设置",

    "preview.label": "预览",
    "preview.sansCaption": "正文",
    "preview.monoCaption": "代码",
    "preview.sample":
      "The quick brown fox jumps over the lazy dog —— 中文排版预览，标点符号，数字 0123456789。",
    "preview.code": "const greet = (name) => `hello ${name}`; // 代码预览",

    "footnote.local": "保存在宿主设置文档里；每次改动立即生效。",
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
  ".dfp-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}",
  ".dfp-chevronOpen{transform:rotate(180deg)}",
  ".dfp-body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}",
  ".dfp-readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}",
  ".dfp-footer{border-top:.5px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}",
  ".dfp-resetAll{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:5px 10px;font-size:13px;line-height:1.5;margin-right:auto;color:var(--dsw-alias-label-secondary);background:0 0;border:1px solid var(--dsw-alias-border-l2)}",
  ".dfp-resetAll:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
  ".dfp-resetAll:disabled{opacity:.4;cursor:default}",

  ".dfp-field{padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
  ".dfp-fieldLast{border-bottom:0}",
  ".dfp-fieldHead{align-items:center;gap:8px;display:flex}",
  ".dfp-fieldLabel{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}",
  ".dfp-overridden{flex:none;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:999px;padding:1px 8px;font-size:11px;line-height:16px}",
  ".dfp-fieldReset{flex:none;margin-left:auto;appearance:none;font:inherit;cursor:pointer;background:0 0;border:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:0}",
  ".dfp-fieldReset:hover{color:var(--dsw-alias-label-primary)}",
  ".dfp-hint{color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;line-height:18px}",

  ".dfp-chips{align-items:center;flex-wrap:wrap;gap:6px;margin-top:10px;display:flex}",
  ".dfp-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
  ".dfp-chip{align-items:center;gap:2px;height:26px;padding:0 2px 0 4px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;display:inline-flex}",
  ".dfp-chipDragging{opacity:.45}",
  ".dfp-chipDrop{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}",
  ".dfp-grip{cursor:grab;color:var(--dsw-alias-label-tertiary);padding:0 2px;font-size:13px;line-height:1;user-select:none}",
  ".dfp-grip:active{cursor:grabbing}",
  ".dfp-chipLabel{max-width:200px;font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".dfp-chipButton{align-items:center;justify-content:center;width:20px;height:20px;padding:0;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:4px;display:inline-flex;font-size:13px;line-height:1}",
  ".dfp-chipButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3)}",
  ".dfp-chipButton:disabled{opacity:.35;cursor:default}",
  ".dfp-add{align-items:center;gap:6px;height:28px;padding:0 10px;color:var(--dsw-alias-label-primary);cursor:pointer;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;display:inline-flex;font-size:13px;line-height:18px}",
  ".dfp-add:hover{background:var(--dsw-alias-bg-layer-3)}",

  ".dfp-modeRow{align-items:center;gap:10px;margin:14px 0 0;display:flex}",
  ".dfp-modeLabel{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}",
  ".dfp-modeSeg{flex:none;display:inline-flex;overflow:hidden;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px}",
  ".dfp-modeButton{appearance:none;font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-left:.5px solid var(--dsw-alias-border-l3);padding:4px 14px;font-size:12px;line-height:18px}",
  ".dfp-modeButton:first-child{border-left:none}",
  ".dfp-modeButton:hover{color:var(--dsw-alias-label-primary)}",
  ".dfp-modeButtonActive{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3)}",
  ".dfp-slotRow{align-items:center;gap:10px;margin-top:10px;display:flex}",
  ".dfp-slotLabel{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;min-width:96px}",
  ".dfp-splitRow{flex:1;align-items:center;gap:4px;display:inline-flex;min-width:0}",
  ".dfp-pick{flex:1;appearance:none;font:inherit;cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;min-height:28px;padding:0 10px;display:inline-flex;align-items:center}",
  ".dfp-pick:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3)}",
  ".dfp-pick:disabled{opacity:.4;cursor:default}",
  ".dfp-pickEmpty{color:var(--dsw-alias-label-tertiary)}",

  ".dfp-panel{box-sizing:border-box;position:fixed;z-index:1200;flex-direction:column;width:320px;max-height:380px;padding:8px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px #00000024);display:flex;gap:6px}",
  ".dfp-search{width:100%;box-sizing:border-box;padding:5px 8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;font:inherit;font-size:13px;line-height:18px}",
  ".dfp-note{padding:4px 2px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}",
  ".dfp-list{flex-direction:column;gap:1px;flex:1;min-height:0;overflow-y:auto;display:flex}",
  ".dfp-group{padding:6px 6px 2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;position:sticky;top:0;background:var(--dsw-alias-bg-layer-2)}",
  ".dfp-option{align-items:center;justify-content:space-between;gap:8px;width:100%;box-sizing:border-box;padding:4px 8px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:6px;display:flex;font-size:13px;line-height:20px}",
  ".dfp-option:hover{background:var(--dsw-alias-bg-layer-3)}",
  ".dfp-optionLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".dfp-optionCheck{flex:none;color:var(--dsw-alias-brand-primary)}",
  ".dfp-footerRow{justify-content:flex-end;display:flex}",

  ".dfp-sliderRow{align-items:center;gap:10px;margin-top:10px;display:flex}",
  ".dfp-slider{flex:1;min-width:0;height:20px;accent-color:var(--dsw-alias-brand-primary)}",
  ".dfp-value{flex:none;min-width:56px;text-align:right;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-variant-numeric:tabular-nums}",
  ".dfp-scale{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;display:flex;justify-content:space-between}",

  ".dfp-previewBox{margin-top:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:10px}",
  ".dfp-previewCaption{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin-bottom:4px}",
  ".dfp-previewText{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;word-break:break-word}",
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
 * Snapshot the typography tokens the size offset scales.
 *
 * Three sources, in rising authority: the embedded fallback map (covers the
 * frame before DSH's runtime tokens exist), declarations read from the
 * same-origin stylesheets — excluding this plugin's own — and the theme's
 * inline writes on `body` (the font-size slider's value lives there and
 * nowhere else). The computed style is deliberately NOT a source: after our
 * rule applies it reports the SCALED values, and feeding those back as bases
 * compounds the offset on every refresh.
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
          if (property.slice(0, 2) !== "--" || !isFontToken(property)) continue;
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
      if (inlineName.slice(0, 2) !== "--" || !isFontToken(inlineName)) continue;
      var inlineValue = inline.getPropertyValue(inlineName).trim();
      if (inlineValue !== "") out[inlineName] = inlineValue;
    }
  } catch (error) {
    // Detached document or no layout engine: the fallback map stands.
  }
  return out;
}

/**
 * Create the writer that keeps one `<style>` element in sync.
 * @param {() => Record<string, string>} tokens - reads the current base tokens.
 * @returns {(config: unknown) => void} the applier.
 */
function createStylesheet(tokens) {
  var tag = null;
  var lastCss = null;
  return function apply(config) {
    if (typeof document === "undefined") return;
    var css = buildFontCss(config, tokens());
    if (css === lastCss) return;
    lastCss = css;
    if (tag === null) {
      tag = document.createElement("style");
      tag.dataset.plugin = "dsh-fonttune";
      tag.dataset.pluginCss = STYLE_TAG;
      document.head.append(tag);
    }
    tag.textContent = css;
  };
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
        : null
    ),
    h("p", { className: "dfp-hint" }, props.hint),
    props.children
  );
}

/**
 * A slider over a whole-number range with a live value readout.
 * Dragging only moves a local value; the change handler runs once the
 * pointer is released (or on blur/keyup), so intermediate steps never
 * rewrite the settings document — the page does not recompute per pixel.
 * @param {object} props - range, value, labels, change handler and an
 *   optional pendingText(v) formatting the readout while dragging.
 * @returns {object} the slider element.
 */
function NumberSlider(props) {
  var [pending, setPending] = useState(null);
  // The value the host has not confirmed yet. Between the release and the
  // settings round-trip the committed prop is still the OLD number — clearing
  // the local value right away would show that old number for one frame
  // (the "bounce back, then settle" the user saw), so the local value stays
  // on screen until the confirmed value arrives.
  var awaitingRef = useRef(null);
  useEffect(
    function () {
      if (awaitingRef.current === null) {
        // idle: any value that arrives from outside (reset, another page) wins
        setPending(null);
        return undefined;
      }
      if (props.value === awaitingRef.current) {
        awaitingRef.current = null;
        setPending(null);
      }
      return undefined;
    },
    [props.value]
  );
  var commit = function (value) {
    awaitingRef.current = value;
    props.onChange(value);
  };
  useEffect(
    function () {
      if (pending === null) return undefined;
      var release = function () {
        // one release per drag; a late pointerup must not rewrite the same value
        if (awaitingRef.current !== null) return;
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
        step: 1,
        value: shown,
        disabled: props.disabled,
        "aria-label": props.label,
        onChange: function (event) {
          setPending(Number(event.target.value));
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
    h(
      "div",
      { className: "dfp-scale" },
      h("span", null, props.minLabel),
      h("span", null, props.maxLabel)
    )
  );
}

/* ------------------------------------------------------------------ *
 * font enumeration
 * ------------------------------------------------------------------ */

/**
 * @typedef {{status: "unsupported"|"loading"|"denied"|"ready", families: string[]}} Catalog
 */

/** Enumeration is session-stable, so it is resolved once and kept. */
var catalogCache = null;

/**
 * Enumerate installed families; the built-in presets stand in when the browser
 * cannot or will not enumerate them.
 * @returns {Promise<Catalog>} the catalog.
 */
async function loadCatalog() {
  if (catalogCache !== null) return catalogCache;
  var host = /** @type {{queryLocalFonts?: () => Promise<Array<{family: string}>>}} */ (
    globalThis
  );
  if (typeof host.queryLocalFonts !== "function") {
    catalogCache = { status: "unsupported", families: [] };
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
        ? { status: "unsupported", families: [] }
        : { status: "ready", families: families };
  } catch (error) {
    // A refused permission is the common case here: `queryLocalFonts` prompts.
    catalogCache = { status: "denied", families: [] };
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
    context.font = '72px ' + quoteFamily(name) + ", monospace";
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

/** Preset groups, in the order the picker lists them. */
var PRESET_GROUPS = [
  { label: "stack.groupMono", families: PRESETS.mono },
  { label: "stack.groupCjk", families: PRESETS.cjk },
  { label: "stack.groupLatin", families: PRESETS.latin },
  { label: "stack.groupGeneric", families: PRESETS.generic },
];

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

  var needle = query.trim().toLowerCase();
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
  var matches = function (name) {
    return needle === "" || name.toLowerCase().indexOf(needle) >= 0;
  };
  var options = [];
  var pushGroup = function (labelKey, names, limit, skipSelected) {
    var rows = [];
    for (var index = 0; index < names.length; index += 1) {
      var name = sanitizeFamily(names[index]);
      if (name === "" || !matches(name)) continue;
      if (skipSelected === true && selectedLower[name.toLowerCase()] === true) continue;
      rows.push(name);
      if (limit !== undefined && rows.length >= limit) break;
    }
    if (rows.length > 0) options.push({ label: labelKey, families: rows });
  };

  var selectedRows = [];
  for (var familyIndex = 0; familyIndex < families.length; familyIndex += 1) {
    if (matches(families[familyIndex])) selectedRows.push(families[familyIndex]);
  }
  if (selectedRows.length > 0) {
    options.push({ label: "stack.groupSelected", families: selectedRows });
  }

  if (catalog.status === "ready") {
    if (needle === "") {
      for (var groupIndex = 0; groupIndex < PRESET_GROUPS.length; groupIndex += 1) {
        pushGroup(PRESET_GROUPS[groupIndex].label, PRESET_GROUPS[groupIndex].families, undefined, !single);
      }
    }
    pushGroup("stack.groupLocal", catalog.families, MAX_VISIBLE_FONTS, !single);
  } else {
    for (var fallbackIndex = 0; fallbackIndex < PRESET_GROUPS.length; fallbackIndex += 1) {
      pushGroup(
        PRESET_GROUPS[fallbackIndex].label,
        PRESET_GROUPS[fallbackIndex].families,
        undefined,
        !single
      );
    }
  }

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
          h(primitives.IconPlusOutline16, null),
          h("span", null, t("stack.add"))
        )
      )
    ),
    families.length > 1 ? h("p", { className: "dfp-hint" }, t("stack.hintOrder")) : null,
    panel
  );
}

/* ------------------------------------------------------------------ *
 * the card
 * ------------------------------------------------------------------ */

/** localStorage key of the card's view mode. */
var MODE_KEY = "dsh-fonttune.mode.v1";

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
 * Render the plugin's card: the settings section dispatches this component
 * under the namespace key, and the host has to serve that namespace for it to
 * appear at all.
 * @param {object} props - slot props (the injected face plus the locale seat).
 * @returns {object} the card element.
 */
function FontCard(props) {
  var t = props.t;
  var scope = props.scope;
  var [open, setOpen] = useState(false);
  var [view, setView] = useState(readViewMode);
  var snapshot = useScopeSnapshot(scope);
  var config = normalizeConfig(snapshot.value);
  var user = snapshot.user !== null && typeof snapshot.user === "object" ? snapshot.user : {};
  var writable = snapshot.writable === true;

  var changeView = function (next) {
    setView(next);
    try {
      globalThis.localStorage.setItem(MODE_KEY, next);
    } catch (error) {
      // Unavailable storage only costs the persistence of the preference.
    }
  };
  // The simple mode edits only the two front slots; the stack value itself is
  // the single source of truth, and switching views writes nothing at all.
  var pickSansWest = function (family) {
    setField(SANS_FIELD, formatStack(setWestEntry(parseStack(config[SANS_FIELD]), family, classifyFamily)));
  };
  var pickSansEast = function (family) {
    setField(SANS_FIELD, formatStack(setEastEntry(parseStack(config[SANS_FIELD]), family, classifyFamily)));
  };
  var dropSansEntry = function (family) {
    setField(SANS_FIELD, formatStack(removeStackEntry(parseStack(config[SANS_FIELD]), family)));
  };
  var pickMonoWest = function (family) {
    setField(MONO_FIELD, formatStack(setWestEntry(parseStack(config[MONO_FIELD]), family, classifyFamily)));
  };
  var pickMonoEast = function (family) {
    setField(MONO_FIELD, formatStack(setEastEntry(parseStack(config[MONO_FIELD]), family, classifyFamily)));
  };
  var dropMonoEntry = function (family) {
    setField(MONO_FIELD, formatStack(removeStackEntry(parseStack(config[MONO_FIELD]), family)));
  };

  var setField = function (field, value) {
    var result = scope.set(field, value);
    if (result && typeof result.catch === "function") {
      result.catch(function () {
        // A failed write reloads the Host state through the scope itself.
      });
    }
  };
  var resetField = function (field) {
    var result = scope.unset(field);
    if (result && typeof result.catch === "function") {
      result.catch(function () {});
    }
  };
  var overridden = function (field) {
    return Object.prototype.hasOwnProperty.call(user, field);
  };

  var offset = config[SIZE_FIELD];
  var weight = config[WEIGHT_FIELD];
  var offsetText = offset > 0 ? "+" + offset : String(offset);

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
        "span",
        { className: "dfp-chevron" + (open ? " dfp-chevronOpen" : ""), "aria-hidden": "true" },
        "⌄"
      )
    ),
    open
      ? h(
          "div",
          { className: "dfp-body" },
          writable ? null : h("p", { className: "dfp-readOnly", role: "status" }, t("card.readOnly")),

          h(
            "div",
            { className: "dfp-modeRow", role: "group", "aria-label": t("mode.label") },
            h("span", { className: "dfp-modeLabel" }, t("mode.label")),
            h(
              "div",
              { className: "dfp-modeSeg" },
              h(
                "button",
                {
                  type: "button",
                  className: "dfp-modeButton" + (view === "simple" ? " dfp-modeButtonActive" : ""),
                  "aria-pressed": view === "simple",
                  onClick: function () {
                    changeView("simple");
                  },
                },
                t("mode.simple")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dfp-modeButton" + (view === "advanced" ? " dfp-modeButtonActive" : ""),
                  "aria-pressed": view === "advanced",
                  onClick: function () {
                    changeView("advanced");
                  },
                },
                t("mode.advanced")
              )
            )
          ),

          view === "simple"
            ? h(SimpleFamilyField, {
                t: t,
                label: t("sans.label"),
                westLabel: "sansWest.label",
                eastLabel: "sansEast.label",
                slots: deriveSlots(config[SANS_FIELD]),
                disabled: !writable,
                onPickWest: pickSansWest,
                onPickEast: pickSansEast,
                onRemoveWest: function () {
                  var slots = deriveSlots(config[SANS_FIELD]);
                  if (slots.west !== null) dropSansEntry(slots.west);
                },
                onRemoveEast: function () {
                  var slots = deriveSlots(config[SANS_FIELD]);
                  if (slots.east !== null) dropSansEntry(slots.east);
                },
              })
            : h(
            FieldShell,
            {
              t: t,
              label: t("sans.label"),
              hint: t("sans.hint"),
              overridden: overridden(SANS_FIELD),
              disabled: !writable,
              onReset: function () {
                resetField(SANS_FIELD);
              },
            },
            h(StackPicker, {
              t: t,
              label: t("sans.label"),
              value: config[SANS_FIELD],
              onChange: function (value) {
                setField(SANS_FIELD, value);
              },
            })
          ),

          view === "simple"
            ? h(SimpleFamilyField, {
                t: t,
                label: t("mono.label"),
                westLabel: "monoWest.label",
                eastLabel: "monoEast.label",
                slots: deriveSlots(config[MONO_FIELD]),
                disabled: !writable,
                onPickWest: pickMonoWest,
                onPickEast: pickMonoEast,
                onRemoveWest: function () {
                  var slots = deriveSlots(config[MONO_FIELD]);
                  if (slots.west !== null) dropMonoEntry(slots.west);
                },
                onRemoveEast: function () {
                  var slots = deriveSlots(config[MONO_FIELD]);
                  if (slots.east !== null) dropMonoEntry(slots.east);
                },
              })
            : h(
            FieldShell,
            {
              t: t,
              label: t("mono.label"),
              hint: t("mono.hint"),
              overridden: overridden(MONO_FIELD),
              disabled: !writable,
              onReset: function () {
                resetField(MONO_FIELD);
              },
            },
            h(StackPicker, {
              t: t,
              label: t("mono.label"),
              value: config[MONO_FIELD],
              onChange: function (value) {
                setField(MONO_FIELD, value);
              },
            })
          ),

          h(
            FieldShell,
            {
              t: t,
              label: t("size.label"),
              hint: t("size.hint", { offset: offsetText }),
              overridden: overridden(SIZE_FIELD) && offset !== 0,
              disabled: !writable,
              onReset: function () {
                resetField(SIZE_FIELD);
              },
            },
            h(NumberSlider, {
              min: SIZE_MIN,
              max: SIZE_MAX,
              value: offset,
              disabled: !writable,
              label: t("size.label"),
              readout: offsetText + " " + t("size.unit"),
              minLabel: SIZE_MIN + " " + t("size.unit"),
              maxLabel: "+" + SIZE_MAX + " " + t("size.unit"),
              pendingText: function (value) {
                return (value > 0 ? "+" + value : String(value)) + " " + t("size.unit");
              },
              onChange: function (value) {
                setField(SIZE_FIELD, value);
              },
            })
          ),

          h(
            FieldShell,
            {
              t: t,
              label: t("weight.label"),
              hint: t("weight.hint"),
              overridden: overridden(WEIGHT_FIELD) && weight !== WEIGHT_UNSET,
              disabled: !writable,
              onReset: function () {
                resetField(WEIGHT_FIELD);
              },
            },
            h(NumberSlider, {
              min: WEIGHT_MIN,
              max: WEIGHT_MAX,
              value: weight === WEIGHT_UNSET ? NEUTRAL_WEIGHT : weight,
              disabled: !writable,
              label: t("weight.label"),
              readout: weight === WEIGHT_UNSET ? t("weight.unset") : String(weight),
              minLabel: String(WEIGHT_MIN),
              maxLabel: String(WEIGHT_MAX),
              onChange: function (value) {
                // 400 is DSH's own body weight, so choosing it means "leave the
                // axis alone" rather than "write 400 on every element".
                if (value === NEUTRAL_WEIGHT) resetField(WEIGHT_FIELD);
                else setField(WEIGHT_FIELD, value);
              },
            })
          ),

          h(
            "div",
            { className: "dfp-field dfp-fieldLast" },
            h(
              "div",
              { className: "dfp-fieldHead" },
              h("span", { className: "dfp-fieldLabel" }, t("preview.label"))
            ),
            h(
              "div",
              { className: "dfp-previewBox" },
              h("div", { className: "dfp-previewCaption" }, t("preview.sansCaption")),
              h(
                "div",
                {
                  className: "dfp-previewText",
                  style:
                    config[SANS_FIELD] === ""
                      ? undefined
                      : { fontFamily: formatStack(parseStack(config[SANS_FIELD])) },
                },
                t("preview.sample")
              ),
              h(
                "div",
                { className: "dfp-previewCaption", style: { marginTop: 10 } },
                t("preview.monoCaption")
              ),
              h(
                "div",
                {
                  className: "dfp-previewText",
                  style:
                    config[MONO_FIELD] === ""
                      ? undefined
                      : { fontFamily: formatStack(parseStack(config[MONO_FIELD])) },
                },
                t("preview.code")
              )
            )
          ),

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
                  resetField(SANS_FIELD);
                  resetField(MONO_FIELD);
                  resetField(SIZE_FIELD);
                  resetField(WEIGHT_FIELD);
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
 * plugin body
 * ------------------------------------------------------------------ */

/**
 * Mount the card and keep the page's typography in sync with the settings.
 * @param {object} ctx - client cordis context.
 */
export function apply(ctx) {
  installCardStyles(ctx);

  var tokens = readBaseTokens();
  var applyCss = createStylesheet(function () {
    return tokens;
  });
  var scope = ctx.settingsScope.bind({ namespace: NAMESPACE });

  var sync = function () {
    var snapshot = scope.getSnapshot();
    if (snapshot.value === undefined) return;
    applyCss(snapshot.value);
  };
  ctx.effect(
    function () {
      return scope.subscribe(sync);
    },
    "dsh-fonttune: settings adoption"
  );
  sync();

  // DSH writes its tokens (and its content font size) after this bundle
  // activates, and the host's own boot row only covers the first frame; the
  // size axis therefore re-reads the live values and reapplies when they moved.
  ctx.effect(
    function () {
      if (typeof document === "undefined") return undefined;
      var lastSignature = "";
      var recheck = function () {
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
      var timer = globalThis.setTimeout(recheck, 500);
      var interval = globalThis.setInterval(recheck, 4000);
      return function () {
        globalThis.clearTimeout(timer);
        globalThis.clearInterval(interval);
      };
    },
    "dsh-fonttune: token refresh"
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
  ctx.effect(
    function () {
      return ctx.locale.register(NAMESPACE, DICTS);
    },
    "dsh-fonttune: dictionaries"
  );

  ctx.slots.inject("settings.plugin.item", function () {
    return ctx.slots.register(
      {
        name: "settings.plugin.item",
        key: NAMESPACE,
        inject: function () {
          return { scope: scope, t: t };
        },
      },
      FontCard
    );
  });
}
