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
var ACTIVE_PRESET_FIELD = shared.ACTIVE_PRESET_FIELD;
var UI_FOLLOWS_FIELD = shared.UI_FOLLOWS_FIELD;
var VALUE_FIELDS = shared.VALUE_FIELDS;
var SIZE_MIN = shared.SIZE_MIN;
var SIZE_MAX = shared.SIZE_MAX;
var WEIGHT_MIN = shared.WEIGHT_MIN;
var WEIGHT_MAX = shared.WEIGHT_MAX;
var WEIGHT_UNSET = shared.WEIGHT_UNSET;
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
var resolveAxes = shared.resolveAxes;
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
 * Cap on how many enumerated families the picker lists at once: a machine can
 * report well over a thousand, which would make the panel useless.
 */
var MAX_VISIBLE_FONTS = 240;

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
    "split.unset": "Not set",
    "split.remove": "Remove {name}",
    "split.rest": "Other fallbacks (reorder them in Advanced): {names}",

    "size.bodyLabel": "Interface font size offset",
    "size.bodyHint":
      "Adds {offset} to interface text sizes, on top of DSH's own font-size setting. 0 keeps DSH's sizes.",
    "size.dialogLabel": "Conversation font size offset",
    "size.dialogHint":
      "Adds {offset} to the conversation text sizes, on top of DSH's own font-size setting. 0 keeps DSH's sizes.",
    "size.codeLabel": "Code font size offset",
    "size.codeHint":
      "Adds {offset} to code blocks and inline code only; the interface offset does not reach them. 0 keeps DSH's sizes.",
    "size.unit": "px",

    "weight.uiLabel": "Interface font weight",
    "weight.uiHint":
      "Sets the weight of the whole interface (sidebars, settings, buttons, headings). The conversation keeps its own.",
    "weight.dialogLabel": "Conversation font weight",
    "weight.dialogHint":
      "Sets the weight of the conversation markdown; unset keeps DSH's own weights.",
    "weight.codeLabel": "Code font weight",
    "weight.codeHint":
      "Overrides code blocks, inline code and terminal output only. 400 or unset keeps DSH's own weight.",

    "line.bodyLabel": "Interface line height",
    "line.bodyHint":
      "Scales every interface line height by {ratio}. 100% keeps DSH's own line heights.",
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

    "synth.label": "Refuse synthetic styles",
    "synth.italic": "No faux italic",
    "synth.italicHint":
      "CJK faces have no italic, so the browser tilts them. On keeps marked text upright.",
    "synth.bold": "No faux bold",
    "synth.boldHint":
      "For faces without a real bold: bold text stops being thickened artificially.",
    "synth.simple": "No faux italic / faux bold",
    "synth.simpleHint":
      "Stops synthetic italic and synthetic bold everywhere; switch to Advanced to set them apart.",

    "section.ui": "Interface",
    "section.dialog": "Conversation",
    "section.code": "Code",
    "section.fine": "Global fine-tuning",
    "section.presets": "Presets",
    "section.uiHint":
      "Sidebars, headings, buttons and every other chrome text.",
    "section.dialogHint":
      "The conversation markdown: paragraphs, tables and headings.",
    "section.codeHint": "Code blocks, inline code and terminal output.",
    "section.fineHint":
      "Settings that apply to the whole page.",
    "section.open": "Expand {name}",
    "section.close": "Collapse {name}",

    "ui.follow": "Follows the conversation",
    "ui.followHint": "Font and weight",
    "ui.own": "Own values",
    "dialog.default": "DSH defaults",

    "theme.label": "Per-theme values",
    "theme.on": "Light and dark keep separate values",
    "theme.edit": "Editing theme",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.mismatch":
      "The page is in {active} mode; the preview below shows the values being edited.",

    "dialog.label": "Conversation font",
    "dialog.hint":
      "Applies to the conversation markdown (paragraphs, tables, headings); code surfaces keep the code font.",
    "dialogWest.label": "Conversation · Western",
    "dialogEast.label": "Conversation · CJK",

    "preset.save": "Save current",
    "preset.namePlaceholder": "Preset name",
    "preset.apply": "Apply",
    "preset.overwrite": "Overwrite",
    "preset.delete": "Delete",
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
    "preset.saved": "Saved “{name}”.",
    "preset.applied": "Applied “{name}”.",
    "preset.deleted": "Deleted “{name}”.",
    "preset.updated": "Overwrote “{name}”.",
    "preset.exported": "Presets copied to the clipboard.",
    "preset.imported": "Imported {count} preset(s).",
    "preset.importBad": "That text is not a valid preset export.",
    "preset.full": "The preset list is full ({max}).",
    "preset.empty": "No presets saved yet.",
    "preset.nameTaken": "“{name}” already exists — saving overwrites it.",

    "preview.label": "Preview",
    "preview.sansCaption": "Interface",
    "preview.dialogCaption": "Conversation",
    "preview.monoCaption": "Code",
    "preview.sample":
      "The quick brown fox jumps over the lazy dog — 中文排版预览，标点符号，数字 0123456789。",
    "preview.code": "const greet = (name) => `hello ${name}`; // => != >= -> 代码预览",

    "footnote.local":
      "Stored in the Host settings document. Every change applies immediately.",
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
    "split.unset": "未选择",
    "split.remove": "移除 {name}",
    "split.rest": "其余回退项（在高级模式中排序）：{names}",

    "size.bodyLabel": "界面字号偏移",
    "size.bodyHint":
      "给界面文字统一加 {offset}，与设置里的「字号大小」叠加；0 表示保持原样。",
    "size.dialogLabel": "对话字号偏移",
    "size.dialogHint":
      "给对话文字统一加 {offset}，与设置里的「字号大小」叠加；0 表示保持 DSH 原样。",
    "size.codeLabel": "代码字号偏移",
    "size.codeHint":
      "只作用于代码块与行内代码，与界面字号互不影响；0 表示保持原样。",
    "size.unit": "px",

    "weight.uiLabel": "界面字重",
    "weight.uiHint":
      "设置整个界面的字重（侧栏、设置、按钮、标题）；对话 Markdown 不受影响。",
    "weight.dialogLabel": "对话字重",
    "weight.dialogHint": "设置对话 Markdown 的粗细；未设置时保持 DSH 原本的粗细。",
    "weight.codeLabel": "代码字重",
    "weight.codeHint":
      "只覆盖代码块、行内代码与终端输出；400 或未设置表示保持 DSH 原样。",

    "line.bodyLabel": "界面行高",
    "line.bodyHint": "把界面行高整体缩放为 {ratio}；100% 表示保持原样。",
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

    "synth.label": "拒绝合成样式",
    "synth.italic": "禁用伪斜体",
    "synth.italicHint":
      "中文字体没有斜体，浏览器会把标记文本硬掰歪；开启后保持直立。",
    "synth.bold": "禁用伪粗体",
    "synth.boldHint": "没有真实粗体的字体不再被人为加粗。",
    "synth.simple": "禁用伪斜体/伪粗体",
    "synth.simpleHint":
      "整页停用合成斜体与合成粗体；切到高级模式可分开设置。",

    "section.ui": "界面",
    "section.dialog": "对话",
    "section.code": "代码",
    "section.fine": "全局微调",
    "section.presets": "预设方案",
    "section.uiHint": "侧栏、标题、按钮等界面文字。",
    "section.dialogHint": "会话里的 Markdown：段落、表格与标题。",
    "section.codeHint": "代码块、行内代码与终端输出。",
    "section.fineHint": "作用于整页的选项。",
    "section.open": "展开{name}",
    "section.close": "收起{name}",

    "theme.label": "分主题数值",
    "theme.on": "深浅色各存一套数值",
    "theme.edit": "正在编辑",
    "theme.light": "浅色",
    "theme.dark": "深色",
    "theme.mismatch": "当前页面是{active}主题，下方预览显示的是正在编辑的那套数值。",

    "ui.follow": "跟随对话设置",
    "ui.followHint": "字体与字重",
    "ui.own": "独立数值",
    "dialog.default": "DSH 默认",

    "dialog.label": "对话字体",
    "dialog.hint":
      "作用于会话里的 Markdown（段落、表格、标题）；代码表面仍用代码字体。",
    "dialogWest.label": "对话 · 西文字体",
    "dialogEast.label": "对话 · 中文字体",

    "preset.save": "保存当前",
    "preset.namePlaceholder": "方案名称",
    "preset.apply": "应用",
    "preset.overwrite": "覆盖",
    "preset.delete": "删除",
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
    "preset.saved": "已保存“{name}”。",
    "preset.applied": "已应用“{name}”。",
    "preset.deleted": "已删除“{name}”。",
    "preset.updated": "已覆盖“{name}”。",
    "preset.exported": "方案已复制到剪贴板。",
    "preset.imported": "已导入 {count} 个方案。",
    "preset.importBad": "这段内容不是有效的方案导出。",
    "preset.full": "方案列表已满（{max}）。",
    "preset.empty": "还没有保存方案。",
    "preset.nameTaken": "“{name}”已存在，保存将覆盖它。",

    "preview.label": "预览",
    "preview.sansCaption": "界面",
    "preview.dialogCaption": "对话",
    "preview.monoCaption": "代码",
    "preview.sample":
      "The quick brown fox jumps over the lazy dog —— 中文排版预览，标点符号，数字 0123456789。",
    "preview.code": "const greet = (name) => `hello ${name}`; // => != >= -> 代码预览",

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
  ".dfp-drop{position:fixed;z-index:1200;box-sizing:border-box;min-width:160px;max-height:260px;overflow-y:auto;padding:4px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:10px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px #00000024)}",
  ".dfp-miniButton{appearance:none;font:inherit;cursor:pointer;white-space:nowrap;flex:none;border-radius:6px;padding:3px 8px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);background:0 0;border:.5px solid var(--dsw-alias-border-l3)}",
  ".dfp-miniButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-specific-sidebar-nav-item-hover)}",
  ".dfp-miniButton:disabled{opacity:.4;cursor:default}",
  ".dfp-presetForm{align-items:center;gap:8px;margin-top:10px;display:flex}",
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
  ".dfp-chipButton{align-items:center;justify-content:center;width:20px;height:20px;padding:0;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:4px;display:inline-flex;font-size:13px;line-height:1}",
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

  // the per-section preview: an inline box at the end of the expanded
  // section body, showing only that section's own sample
  ".dfp-previewBox{margin-top:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:10px}",
  ".dfp-previewCaption{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin-bottom:4px}",
  ".dfp-previewText{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;word-break:break-word}",
  ".dfp-previewCode{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
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
    var css = buildFontCss(config, tokens());
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
  var step = typeof props.step === "number" && props.step > 0 ? props.step : 1;
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
        step: step,
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
 */
function sectionSummaries(axis, uiFollows, t) {
  var sign = function (value) {
    return value > 0 ? "+" + value : String(value);
  };
  // The conversation owns every axis, so its summary is always its values.
  var dialogParts = [];
  if (axis[STACK_DIALOG_FIELD] !== "") dialogParts.push(firstFamily(axis[STACK_DIALOG_FIELD]));
  if (axis[SIZE_DIALOG_FIELD] !== 0) dialogParts.push(sign(axis[SIZE_DIALOG_FIELD]) + "px");
  if (axis[LINE_HEIGHT_DIALOG_FIELD] !== LINE_HEIGHT_MIN) {
    dialogParts.push(axis[LINE_HEIGHT_DIALOG_FIELD] + "%");
  }
  if (axis[WEIGHT_DIALOG_FIELD] !== WEIGHT_UNSET) {
    dialogParts.push(String(axis[WEIGHT_DIALOG_FIELD]));
  }
  // The interface either follows (nothing of its own to report) or shows the
  // two axes it owns.
  var uiParts = [];
  if (!uiFollows) {
    var family = axis[SANS_FIELD] === "" ? null : firstFamily(axis[SANS_FIELD]);
    if (family !== null) uiParts.push(family);
    if (axis[WEIGHT_FIELD] !== WEIGHT_UNSET) uiParts.push(String(axis[WEIGHT_FIELD]));
  }
  var codeParts = [];
  if (axis[MONO_FIELD] !== "") codeParts.push(firstFamily(axis[MONO_FIELD]));
  if (axis[CODE_SIZE_FIELD] !== 0) codeParts.push(sign(axis[CODE_SIZE_FIELD]) + "px");
  if (axis[CODE_LINE_HEIGHT_FIELD] !== 0) codeParts.push(sign(axis[CODE_LINE_HEIGHT_FIELD]) + "px");
  if (axis[CODE_WEIGHT_FIELD] !== WEIGHT_UNSET) codeParts.push(String(axis[CODE_WEIGHT_FIELD]));
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

/* ------------------------------------------------------------------ *
 * the card
 * ------------------------------------------------------------------ */

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
  var t = props.t;
  var scope = props.scope;
  var [open, setOpen] = useState(false);
  var [view, setView] = useState(readViewMode);
  var [expanded, setExpanded] = useState(null);
  var [presetName, setPresetName] = useState("");
  // The transient preset message: `{text, id}` — the id makes two identical
  // messages (two exports in a row) two distinct events, so the auto-hide
  // effect runs again instead of ignoring the second one.
  var [presetStatus, setPresetStatus] = useState({ text: "", id: 0 });
  var [statusShown, setStatusShown] = useState(false);
  var [renaming, setRenaming] = useState(false);
  var [importOpen, setImportOpen] = useState(false);
  /** True while the card itself writes a whole preset's values: the edits
   * must not mirror back into the very preset being applied. */
  var applyingRef = useRef(false);
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
   * contract: with a preset selected, every change the user makes IS that
   * preset from now on. Skipped while the card itself applies a whole preset.
   * @param {string} field - an axis field name.
   * @param {string|number|boolean} value - the value to store.
   */
  var mirrorPreset = function (field, value) {
    if (!writable || applyingRef.current === true) return;
    var index = -1;
    for (var i = 0; i < presetList.length; i += 1) {
      if (presetList[i].name === activeName) index = i;
    }
    if (index < 0) return;
    var entry = presetList[index];
    var values = {};
    for (var key in entry.values) {
      if (Object.prototype.hasOwnProperty.call(entry.values, key)) values[key] = entry.values[key];
    }
    values[field] = value;
    var next = presetList.slice();
    next[index] = { name: entry.name, values: values, savedAt: Date.now() };
    writePresets(next);
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
  var submit = function (field, value) {
    var result = scope.set(field, value);
    if (result && typeof result.catch === "function") {
      result.catch(function () {
        // A failed write reloads the Host state through the scope itself.
      });
    }
  };
  var clear = function (field) {
    var result = scope.unset(field);
    if (result && typeof result.catch === "function") {
      result.catch(function () {});
    }
  };
  var overridden = function (field) {
    return Object.prototype.hasOwnProperty.call(user, field);
  };

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
  var weightField = function (props) {
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
        min: WEIGHT_MIN,
        max: WEIGHT_MAX,
        value: props.value === WEIGHT_UNSET ? NEUTRAL_WEIGHT : props.value,
        disabled: !writable,
        label: t(props.labelKey),
        // "Unset" IS 400 here: that is the weight DSH uses for body text, the
        // slider already sits at 400, and the hint says 400 keeps DSH's own.
        // Printing "unset" made the readout disagree with the control.
        readout: String(props.value === WEIGHT_UNSET ? NEUTRAL_WEIGHT : props.value),
        minLabel: String(WEIGHT_MIN),
        maxLabel: String(WEIGHT_MAX),
        onChange: function (value) {
          // 400 is DSH's own body weight, so choosing it means "leave the axis
          // alone" rather than "write 400 on every element".
          if (value === NEUTRAL_WEIGHT) resetField(props.field);
          else setField(props.field, value);
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

  var writePresets = function (next) {
    if (next.length > shared.MAX_PRESETS) next = next.slice(0, shared.MAX_PRESETS);
    submit(PRESETS_FIELD, JSON.stringify(next));
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

  var exportPresets = function () {
    var text = JSON.stringify(presetList);
    var navigator = globalThis.navigator;
    if (navigator !== undefined && navigator.clipboard !== undefined) {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          showStatus(t("preset.exported"));
        })
        .catch(function () {
          showStatus(text.slice(0, 200) + "…");
        });
    } else {
      showStatus(text.slice(0, 120) + "…");
    }
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

  var summaries = sectionSummaries(editing, uiFollows, t);

  // The interface owns one axis now (its family); its preview shows that and
  // nothing else — the weight, size and line height all come from the
  // conversation section.
  var previewUiStyle = {};
  if (editing[SANS_FIELD] !== "") {
    previewUiStyle.fontFamily = formatStack(parseStack(editing[SANS_FIELD]));
  }
  var previewDialogStyle = {};
  if (editing[STACK_DIALOG_FIELD] !== "") {
    previewDialogStyle.fontFamily = formatStack(parseStack(editing[STACK_DIALOG_FIELD]));
  } else {
    // Independent and unset: the conversation keeps DSH's own family, so the
    // preview shows the theme's default rather than the interface stack the
    // page rule would otherwise paint into this box.
    var dialogFallback = FALLBACK_TOKENS["--dsw-font-family"];
    if (typeof dialogFallback === "string" && dialogFallback !== "") {
      previewDialogStyle.fontFamily = dialogFallback;
    }
  }
  previewDialogStyle.fontSize = 13 + editing[SIZE_DIALOG_FIELD] + "px";
  if (editing[LINE_HEIGHT_DIALOG_FIELD] !== LINE_HEIGHT_MIN) {
    previewDialogStyle.lineHeight = String(editing[LINE_HEIGHT_DIALOG_FIELD] / 100);
  }
  if (editing[WEIGHT_DIALOG_FIELD] !== WEIGHT_UNSET) {
    previewDialogStyle.fontWeight = editing[WEIGHT_DIALOG_FIELD];
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
    // Light and dark share one value set in this release: the stored flag (if
    // any) is ignored, so no prefixed dark rules are ever emitted.
    var unified = normalizeConfig(snapshot.value);
    unified[PER_THEME_FIELD] = false;
    applyCss(unified);
    applyTokenOverrides(unified);
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
  // size axis therefore re-reads the live values and reapplies when they
  // moved. The theme/change event makes that immediate: the official
  // font-size preference flows through it, so a slider change is followed
  // within a frame instead of the polling interval.
  var scheduleRecheck = null;
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
      scheduleRecheck = recheck;
      var timer = globalThis.setTimeout(recheck, 500);
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
        if (scheduleRecheck !== null) scheduleRecheck();
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

exports.apply = apply;
exports.inject = inject;
