/**
 * Prove the committed `lib/` artifacts are exactly what the current `src/`
 * produces.
 *
 * Every other suite loads `lib/`, so a source-only edit would otherwise be
 * tested (and shipped) as the previous build. This one renders the artifacts
 * in memory and compares them byte for byte with the files on disk.
 *
 *   node test/artifacts.mjs
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderArtifacts, readSources } from "../build.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : " — " + detail}`);
  }
}

/**
 * The whole body of one generated function, by brace depth.
 *
 * A `/…\\n  \\};/` pattern is only as good as the blank lines inside the function
 * it is aimed at, and every function that grows a comment loses the match (the
 * widened watcher did exactly that). Counting braces from the declaration keeps
 * the assertion about the CODE and not about where the empty lines fell.
 * @param {string} text - the generated bundle.
 * @param {string} name - the `var <name> = function` to lift out.
 * @returns {string} the function, or "" when it is not declared at all.
 */
function bodyOf(text, name) {
  const head = text.indexOf(`var ${name} = function`);
  if (head < 0) return "";
  const open = text.indexOf("{", head);
  if (open < 0) return "";
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    const ch = text[at];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(head, at + 1);
    }
  }
  return "";
}

console.log("\nbuilt artifacts match src/");

const expected = renderArtifacts(await readSources());
for (const [name, text] of Object.entries(expected)) {
  const path = join(ROOT, name);
  if (!existsSync(path)) {
    check(`${name} exists`, false, "run `node build.mjs`");
    continue;
  }
  const actual = await readFile(path, "utf8");
  check(
    `${name} is the current build`,
    actual === text,
    actual === text
      ? ""
      : `stale by ${Math.abs(actual.length - text.length)} bytes — run \`node build.mjs\``
  );
}

// The bundle must stay importable by the host half's runtime, and the host half
// must not gain a bare import the DSH installation does not provide.
check(
  "lib/index.js imports lib/shared.cjs relatively",
  expected["lib/index.js"].includes('from "./shared.cjs"')
);
check(
  "the client bundle registers exactly one factory",
  [...expected["lib/client.js"].matchAll(/__ModuleLoader__\.load\(/g)].length === 1
);
check(
  "no artifact carries a byte-order mark",
  Object.values(expected).every((text) => text.charCodeAt(0) !== 0xfeff)
);

// The fallback notice (the write the document never took) only renders when the
// slider that raised it was handed its text, so the two counts must agree.
const sliders = [...expected["lib/client.js"].matchAll(/h\(NumberSlider, \{/g)].length;
const noticeTexts = [...expected["lib/client.js"].matchAll(/revertedText: t\(/g)].length;
check(
  "every slider carries the fallback notice text",
  sliders > 0 && sliders === noticeTexts,
  `${sliders} slider(s), ${noticeTexts} notice text(s)`
);
check(
  "the fallback notice has a style rule",
  expected["lib/client.js"].includes(".dfp-sliderNotice{")
);

// Everything the card queues (`flushTimer`, `pendingOps`, `pendingOrder`) is a
// binding of ONE render, and a function component gets fresh ones on every render.
// The early-close listeners are registered once, by the render that mounted the
// card, so a listener calling the render's own `flushPendingWrites` closes the
// window that the MOUNT render had — the empty one it started with. Measured live
// before this was fixed: a move queued in render 2, `pagehide` arriving at +91 ms
// flushed render 1's empty queue (ops `[]`), and the write only left at +306 ms
// when the window expired anyway. Hence the flush goes through a ref that every
// render refreshes.
const closeWindow = expected["lib/client.js"].match(/var closeWindow = function \(\) \{[\s\S]{0,400}?\};/);
check(
  "the early-close listeners flush the live queue, not the mount render's",
  closeWindow !== null &&
    closeWindow[0].includes("flushRef.current()") &&
    !closeWindow[0].includes("flushPendingWrites()"),
  closeWindow === null ? "no closeWindow in the bundle" : closeWindow[0].replace(/\s+/g, " ")
);
check(
  "that ref is refreshed on every render",
  expected["lib/client.js"].includes("flushRef.current = flushPendingWrites;")
);

// The host schema carries the panel chrome fields, and the client bundle
// carries the floating panel around them. The "paper mode" overlay and the
// "fitting room" walker were withdrawn: neither a name nor a colour of theirs
// may survive in either half, and the panel's head now offers a settings entry
// beside the round close.
for (const field of ["PANEL_ENABLED_FIELD", "PANEL_POS_FIELD", "PANEL_SIZE_FIELD", "SMOOTHING_FIELD"]) {
  check(
    `the host schema carries ${field}`,
    expected["lib/index.js"].includes(field),
    "run `node build.mjs` after editing src/index.mjs"
  );
}
for (const symbol of [
  "mirrorPresetSnapshot",
  "parsePanelPos",
  "parsePanelSize",
  "floatQuadrant",
  "floatBoundsPick",
  "floatExpandDirection",
  "floatTransformOrigin",
  "floatCardAnchor",
  "floatCardCorner",
  "floatClipStart",
  "floatClipRest",
  "floatSnapCorner",
  "floatDragExceeded",
  "FLOAT_CLOSE_GAP",
  "FLOAT_CARD_PAD",
  "FLOAT_CARD_RADIUS",
  "FLOAT_CLOSE",
  "FLOAT_CLOSE_INSET",
  "FLOAT_SETTINGS_GAP",
  "PLUGIN_BUNDLE_NAME",
  "pluginClickTarget",
]) {
  check(
    `the shared bundle exports ${symbol}`,
    expected["lib/shared.cjs"].includes(symbol),
    "run `node build.mjs` after editing src/shared.cjs"
  );
}
for (const marker of [
  "dfp-floatHost", // the floating panel's host element
  "dfp-floatShadow", // the unclipped layer the card's shadow rides on
  "mountFloatPanel", // the panel's vanilla-DOM mount
  "dfp-floatCardEnter", // the unfold's start frame
  "dfp-floatCardLeave", // the fold's end frame
  "dfp-floatCardArm", // the frame that keeps the start frame from transitioning into itself
  "clip-path:inset(0px 0px 0px 0px round 16px)", // the shape the card rests on
  "--dfp-clipStart", // the dot's own rectangle, measured per render
  "cubic-bezier(.22,1,.28,1)", // the non-linear curve the unfold rides
  "dfp-dotAway", // the dot while the card is up: invisible, takes no pointer
  "dfp-dotBack", // the dot coming back as the card folds
  "prefers-reduced-motion", // the transitions yield to reduced motion
  "dfp-floatClose", // the round close button
  "dfp-floatCloseCross", // the round-capped cross inside the close button
  "dfp-floatSettings", // the round settings button, immediately left of the close
  "dfp-floatSettingsGlyph", // the Host's own Plugins pinwheel (copied paths, no icon library)
  "dfp-floatResize", // the edge resize handles (inside the card's own bounds)
  "data-dfp-expand", // the expand direction the dot's corner decides
  "transformOrigin", // the expand animation starts at the dot's side
  "dfp-floatSnap", // the corner-snap slide
  "suppressClick", // a drag swallows the click on release
  "panelSize", // the persisted card size
  "panelCorner", // the corner the dot LIVES in (its identity, not its coordinates)
]) {
  check(
    `the client bundle carries ${marker}`,
    expected["lib/client.js"].includes(marker),
    "run `node build.mjs` after editing src/client.js"
  );
}
// One gesture is one settings call: the panel's commits and its drag-end
// position write both go through the single-shot path.
const singleShots = [...expected["lib/client.js"].matchAll(/writeSingleShot\(scope,/g)].length;
check(
  "the panel's commits share the single-shot write path",
  singleShots >= 2,
  `${singleShots} single-shot call site(s)`
);
// The settings jump asks the HOST's own navigation first — the plugin
// manager's cross-plugin service or the layout's panel selection — and only
// then falls back to a DOM walk. The entry click lands on the card's title
// button, and a bare list item can never BE the entry: a conversation quoting
// the plugin's name must not swallow the click.
const openSettingsBody = expected["lib/client.js"].slice(
  expected["lib/client.js"].indexOf("var openSettingsScreen = function"),
  expected["lib/client.js"].indexOf("var warnSettingsMissing = function")
);
check(
  "the settings jump reaches the host's navigation before any DOM walk",
  openSettingsBody.indexOf("openPluginPage(tag)") !== -1 &&
    openSettingsBody.indexOf("openPluginPage(tag)") < openSettingsBody.indexOf("findSettingsEntry("),
  "the host route must come first in openSettingsScreen"
);
check(
  "the settings jump opens this package's own page through the host's navigation",
  expected["lib/client.js"].includes("nav.openBundle(shared.PLUGIN_BUNDLE_NAME)") &&
    !expected["lib/client.js"].includes('id: "fonttune",'),
  "one call to the cross-plugin navigation service, and nothing offered to the official list"
);
// A weight write adopts the OFFSET scale before it lands: a fresh document
// would otherwise read the written offset back as one of the old absolute
// weights and convert it away — the "+2 falls straight back" report.
check(
  "a weight write adopts the offset scale before it lands",
  expected["lib/client.js"].includes("var adopting = touchesWeight && raw[WEIGHT_OFFSETS_FIELD] !== true;") &&
    expected["lib/client.js"].includes("paintLocalMove(WEIGHT_OFFSETS_FIELD, true);"),
  "values first, the marker last, exactly like the card's own first weight write"
);
// The panel's readout uses its resting formatter while the slider moves: a raw
// number there is what made the unit blink away mid-drag.
check(
  "the panel's readout keeps its unit while the slider moves",
  expected["lib/client.js"].includes("shown.textContent = format(Number(input.value));"),
  "the same formatter at rest and in motion"
);
// A refused batch is retried ONCE without the preset snapshot: the axis value
// is the product, and a host that declined the whole batch is best asked again
// with only the value in it.
check(
  "a refused batch is retried without the preset snapshot",
  expected["lib/client.js"].includes("if (!retried && mirrorOp !== null)") &&
    expected["lib/client.js"].includes("send(lean);"),
  "one retry, value only — a second refusal is a refusal of the value itself"
);
// No selected preset means no preset write at all, exactly like the card: the
// panel must not invent an active preset out of the first built-in.
check(
  "the panel never invents an active preset",
  !expected["lib/client.js"].includes("if (!known) activeName = list[0].name;"),
  "auto-save follows the selection, not the order of the defaults"
);
check(
  "the shared bundle refuses a bare list item as a navigation entry",
  expected["lib/shared.cjs"].includes('tag !== "button" && tag !== "a" && role !== "button"') &&
    !expected["lib/shared.cjs"].includes('tag !== "button" && tag !== "a" && tag !== "li"'),
  "prose naming the plugin must not become the entry"
);
// The weight-shape measurement — around eighty canvas readbacks per family —
// must never land on the card's first frame again: the settings sync warms the
// cache in idle slices, one axis per slice, and the card resolves its stacks
// through the same helper the warm-up uses so the two cannot drift apart.
check(
  "the settings sync warms the weight shapes off the card's first frame",
  expected["lib/client.js"].includes("scheduleWeightWarm(resolveAxes(unified).light)") &&
    expected["lib/client.js"].includes("var measuredStacks = weightAxisStacks(editing);"),
  "run `node build.mjs` after editing src/client.js"
);
check(
  "the warm-up runs one measurement per axis in idle slices",
  expected["lib/client.js"].includes("requestIdleCallback") &&
    (expected["lib/client.js"].match(/weightProfileFor\(stacks\./g) || []).length === 3,
  "one measurement job per weight axis"
);
// The header's two glyphs are copies of SHIPPED icons, not drawings of mine:
// the settings button carries the Host's own Plugins-entry pinwheel (its four
// arcs verbatim, its 16 box, its one-pixel stroke) and the close carries
// quick-toc's cross (lines spanning 5..19, stroke 3.4, round caps) — so the
// header reads as one family with the sidebar and with quick-toc's buttons.
const glyphBlock = expected["lib/client.js"].slice(
  expected["lib/client.js"].indexOf("var settingsGlyph = function"),
  expected["lib/client.js"].indexOf("var closeCross = function")
);
const crossStart = expected["lib/client.js"].indexOf("var closeCross = function");
const crossBlock = expected["lib/client.js"].slice(
  crossStart,
  expected["lib/client.js"].indexOf("return svg;", crossStart)
);
check(
  "the settings button carries the Host's own Plugins-entry glyph",
  glyphBlock.includes("M7.84457 5.06199") &&
    glyphBlock.includes("M10.7476 7.89535") &&
    glyphBlock.includes('viewBox: "0 0 16 16"') &&
    glyphBlock.includes("String(SETTINGS_GLYPH_STROKE)") &&
    expected["lib/client.js"].includes("var SETTINGS_GLYPH_PX = 16;") &&
    expected["lib/client.js"].includes("var SETTINGS_GLYPH_STROKE = 1.8;"),
  "the pinwheel's paths and box from the sidebar entry's icon, at the asked 1.8px"
);
check(
  "the close carries quick-toc's round-capped cross",
  crossBlock.includes('"stroke-width": "3.4"') &&
    crossBlock.includes('"stroke-linecap": "round"') &&
    crossBlock.includes('x1: "5", y1: "5", x2: "19", y2: "19"') &&
    crossBlock.includes('x1: "19", y1: "5", x2: "5", y2: "19"'),
  "the 5..19 cross at the weight its round buttons carry"
);
check(
  "neither header glyph can be shrunk by a host svg rule",
  expected["lib/client.js"].includes('svg.style.width = SETTINGS_GLYPH_PX + "px"') &&
    expected["lib/client.js"].includes('svg.style.height = CLOSE_ICON_PX + "px"'),
  "the sizes are pinned inline like the buttons' shapes"
);
// The text-rendering preference is a look switch, not an axis: it paints even
// with every axis dormant, it never rides a preset snapshot, and the card
// offers exactly the three modes.
check(
  "the rendering preference paints on its own",
  expected["lib/shared.cjs"].includes("function smoothingRule") &&
    expected["lib/shared.cjs"].includes("var smoothing = smoothingRule(") &&
    expected["lib/shared.cjs"].includes("fontSmoothing: SMOOTHING_AUTO"),
  "the rule survives an all-dormant configuration"
);
check(
  "the card offers the three rendering modes",
  expected["lib/client.js"].includes('label: t("smoothing.label")') &&
    expected["lib/client.js"].includes('t("smoothing.auto")') &&
    expected["lib/client.js"].includes('t("smoothing.sharp")') &&
    expected["lib/client.js"].includes('t("smoothing.smooth")'),
  "follow the system / sharp / smooth"
);
// Compact choices sit ON their label row (pushed right), never under the hint:
// the toggle rows must read as one component family with the synthesis row. There
// are five of them now (synthetic italic, synthetic bold, smoothing, strict line
// breaking, light/dark sync), and the count is the point: a new segmented row that
// forgets `inline` would drop back under its hint.
//
// The light/dark SURFACE picker is the one exception, and it is deliberate: it
// belongs to the sync switch's own block, under the description, and fades in and
// out with it — it was asked for below rather than beside the label.
check(
  "compact choices sit on their label row, never under the hint",
  (expected["lib/client.js"].match(/inline: true,/g) || []).length === 5 &&
    expected["lib/client.js"].includes('h("div", { className: "dfp-inline" }, props.children)'),
  "the five segmented rows share the label-row layout"
);
check(
  "the light/dark picker fades in under the description",
  expected["lib/client.js"].includes('"dfp-themeSplit" + (themesSplit ? " dfp-themeSplitOn" : "")') &&
    expected["lib/client.js"].includes(
      ".dfp-themeSplit{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .24s ease,opacity .24s ease}"
    ) &&
    expected["lib/client.js"].includes(".dfp-themeSplitOn{grid-template-rows:1fr;opacity:1}") &&
    expected["lib/client.js"].includes('h("span", { className: "dfp-themeNote" }, t("theme.splitHint"))'),
  "always mounted, with its height and opacity animated together"
);
// The dot's first corner is a decision: the region's bottom-right, never the
// accident of wherever the page flow placed the unpositioned host.
check(
  "the dot's first corner is the region's bottom-right",
  expected["lib/client.js"].includes("anchor = { x: bounds.right, y: bounds.bottom };") &&
    expected["lib/client.js"].includes("first one is a decision, not a coincidence"),
  "nothing stored yet starts bottom-right"
);
// Nothing of the two withdrawn features may survive in a built half. The names
// are assembled so that this very check does not put them back in the tree.
for (const [half, gone] of [
  ["lib/shared.cjs", ["paper" + "Mode", "PAPER_" + "BACKGROUND", "fitting" + "Candidates"]],
  ["lib/client.js", ["paper" + "Mode", "paper.", "Fitting" + "Room", "dfp-fit", "fitting."]],
  ["lib/index.js", ["paper" + "Mode"]],
]) {
  for (const name of gone) {
    check(
      `${half} carries no trace of "${name}"`,
      expected[half].includes(name) === false,
      "a withdrawn feature is still in the build"
    );
  }
}

// The panel's own chrome, rule by rule. A scrollbar is what the user saw, so
// the card rule must forbid scrolling outright instead of merely capping its
// height, and the resize grips that used to hang past the border — the boxes
// that made the card scrollable — now live inside it.
const floatCard = expected["lib/client.js"].match(/\.dfp-floatCard\{[^}]*\}/);
const floatShadow = expected["lib/client.js"].match(/\.dfp-floatShadow\{[^}]*\}/);
check(
  "the card cannot scroll at all",
  floatCard !== null &&
    floatCard[0].includes("overflow:hidden") &&
    floatCard[0].includes("max-height:calc(100vh - 24px)") &&
    !floatCard[0].includes("overflow:auto") &&
    !expected["lib/client.js"].includes("max-height:70vh"),
  floatCard === null ? "no .dfp-floatCard rule" : floatCard[0]
);
const floatClose = expected["lib/client.js"].match(/\.dfp-floatClose\{[^}]*\}/);
check(
  "the close button is a round icon button",
  floatClose !== null &&
    floatClose[0].includes("border-radius:50%") &&
    floatClose[0].includes("padding:0") &&
    floatClose[0].includes("border:none") &&
    floatClose[0].includes("--dsw-alias-interactive-bg-hover") &&
    floatClose[0].includes("transition:background .15s ease,color .15s ease,opacity .2s ease"),
  floatClose === null ? "no .dfp-floatClose rule" : floatClose[0]
);
check(
  "the round close deepens its background on hover",
  expected["lib/client.js"].includes(
    ".dfp-floatClose:hover{background:var(--dsw-alias-interactive-bg-active,"
  )
);
const floatDot = expected["lib/client.js"].match(/\.dfp-dot\{[^}]*\}/);
check(
  "the dot cross-fades above the card it is anchored on",
  floatDot !== null &&
    floatDot[0].includes("position:relative") &&
    floatDot[0].includes("z-index:2") &&
    floatDot[0].includes("transition:opacity .12s ease"),
  floatDot === null ? "no .dfp-dot rule" : floatDot[0]
);
// While the card is up the dot is invisible and must not take the pointer: a
// real press in its corner belongs to the card head underneath it, and the dot
// has to be exactly where it was the moment the card folds away again.
const dotAway = expected["lib/client.js"].match(/\.dfp-dotAway\{[^}]*\}/);
check(
  "the faded dot is invisible and takes no pointer",
  dotAway !== null && dotAway[0].includes("opacity:0") && dotAway[0].includes("pointer-events:none"),
  dotAway === null ? "no .dfp-dotAway rule" : dotAway[0]
);
// The dot has to fade back in over the WHOLE fold: a shorter fade of its own
// would leave it sitting at full strength while the card is still shrinking into
// it. The fold's own length is the single source, so the two cannot drift apart.
const dotBackRule = expected["lib/client.js"].match(/\.dfp-dotBack\{[^}]*\}/);
const leaveRule = expected["lib/client.js"].match(/\.dfp-floatCardLeave\{[^}]*\}/);
const leaveSeconds = leaveRule === null ? null : (leaveRule[0].match(/transition:clip-path ([\d.]+)s/) || [])[1];
check(
  "the dot comes back over the whole fold, not over a shorter fade of its own",
  dotBackRule !== null &&
    leaveSeconds !== null &&
    dotBackRule[0].includes("transition:opacity " + leaveSeconds + "s"),
  dotBackRule === null ? "no .dfp-dotBack rule" : dotBackRule[0]
);
const resizeGrip = expected["lib/client.js"].match(/\.dfp-floatResizeR\{[^}]*\}/);
check(
  "the resize grips sit inside the card",
  resizeGrip !== null &&
    resizeGrip[0].includes("right:0") &&
    !expected["lib/client.js"].includes("right:-5px") &&
    !expected["lib/client.js"].includes("bottom:-5px"),
  resizeGrip === null ? "no .dfp-floatResizeR rule" : resizeGrip[0]
);
// A live resize sizes the WRAPPER — the layer that owns the geometry — while
// the card fills it, so the grips and the stored size keep describing the same
// box they always did.
const resizeBlock = expected["lib/client.js"].slice(
  expected["lib/client.js"].indexOf("var startResize = function"),
  expected["lib/client.js"].indexOf("var docSize = function")
);
check(
  "the live resize sizes the wrapper the card fills",
  resizeBlock.length > 0 &&
    resizeBlock.includes('box.style.width = "min(" + w + "px,calc(100vw - 32px))"') &&
    !resizeBlock.includes("box.style.height") &&
    expected["lib/client.js"].includes('startResize(event, "w", shadow, card)'),
  resizeBlock.length === 0 ? "no startResize in the bundle" : "the resize no longer sizes the wrapper"
);
// The unfold: the card's anchored corner IS the dot's corner (no slot, no
// FLOAT_DOT_PAD reach past it), the clip start is measured from the live card
// every render, and the six rules that make the animation are all there. The
// arming class is what keeps the measuring read from becoming the "before" of a
// transition: without it the first painted frame is the RESTING card and the
// unfold plays backwards from full size instead of growing out of the dot.
const cardRule = expected["lib/client.js"].match(/\.dfp-floatCard\{[^}]*\}/);
check(
  "the card rests on a real inset() shape, not `none`",
  cardRule !== null && cardRule[0].includes("clip-path:inset(0px 0px 0px 0px round 16px)"),
  cardRule === null ? "no .dfp-floatCard rule" : cardRule[0]
);
// The glass layer, and why every one of these is load-bearing. `backdrop-filter`
// samples the backdrop ROOT, and a backdrop root is any ancestor (or the element
// itself) carrying `filter`, `opacity` below 1 or a blend mode. So:
//  · no ancestor of the glass may carry `filter` — that is where the shadow used
//    to live, and leaving it there would make the blur sample the panel itself;
//  · the glass sits INSIDE the card, so the card's own clip gives it the panel's
//    silhouette for free (a sibling needs its own, in-step clip transition: two
//    of those retargeted a frame apart and the surface raced the panel);
//  · the shadow it displaced rides its own sibling, which nothing clips.
const glassRule = expected["lib/client.js"].match(/\.dfp-floatGlass\{[^}]*\}/);
const shadeRule = expected["lib/client.js"].match(/\.dfp-floatShade\{[^}]*\}/);
check(
  "the glass layer blurs the page from beside the card",
  floatShadow !== null &&
    floatShadow[0].includes("filter") === false &&
    floatShadow[0].includes("clip-path") === false &&
    floatShadow[0].includes("overflow") === false &&
    // a pure paint layer: the card and everything inside it keeps the pointer
    floatShadow[0].includes("pointer-events:none") &&
    floatCard !== null &&
    floatCard[0].includes("filter") === false &&
    floatCard[0].includes("background:transparent") &&
    glassRule !== null &&
    glassRule[0].includes("z-index:0") &&
    // It carries the resting clip AND gets the card's live one copied onto it
    // every frame (two CSS transitions on one property are not one animation).
    glassRule[0].includes("clip-path:inset(0px 0px 0px 0px round 16px)") &&
    expected["lib/client.js"].includes("var mirrorGlassClip = function (card, glass, ms)") &&
    shadeRule !== null &&
    shadeRule[0].includes("box-shadow:") &&
    shadeRule[0].includes("pointer-events:none") &&
    expected["lib/client.js"].includes("backdrop-filter:blur(3px)") &&
    expected["lib/client.js"].includes("shadow.appendChild(glass)") &&
    expected["lib/client.js"].includes('shadow.appendChild(shadeEl)'),
  floatShadow === null ? "no .dfp-floatShadow rule" : floatShadow[0]
);
check(
  "the resting clip is released once the unfold has arrived",
  cardRule !== null &&
    cardRule[0].includes("clip-path:inset(0px 0px 0px 0px round 16px)") &&
    // The clip is what makes the unfold possible, and it is dropped again once
    // the card has arrived: while it is on, it would carve the antialiasing of
    // the card's rounded corners away from the frame the user looks at.
    expected["lib/client.js"].includes('card.style.clipPath = "none"'),
  cardRule === null ? "no .dfp-floatCard rule" : cardRule[0]
);
check(
  "the unfold rides clip, opacity and scale on one non-linear curve",
  cardRule !== null &&
    cardRule[0].includes(
      "transition:clip-path .32s cubic-bezier(.45,0,.25,1),opacity .32s cubic-bezier(.45,0,.25,1),transform .32s cubic-bezier(.45,0,.25,1)"
    ),
  cardRule === null ? "no .dfp-floatCard rule" : cardRule[0]
);
const cardEnter = expected["lib/client.js"].match(/\.dfp-floatCardEnter\{[^}]*\}/);
check(
  "the enter frame is clipped to the dot's rectangle",
  cardEnter !== null &&
    cardEnter[0].includes("clip-path:var(--dfp-clipStart") &&
    cardEnter[0].includes("transform:scale(.985)") &&
    // NO `opacity` on the enter frame, deliberately. The card carries the glass
    // layer, and an element below opacity 1 is a backdrop root: a fade here would
    // switch the blur off for the whole unfold, and the panel would read as a bare
    // translucent box that only becomes the real thing once it lands.
    cardEnter[0].includes("opacity") === false,
  cardEnter === null ? "no .dfp-floatCardEnter rule" : cardEnter[0]
);
check(
  "the leave frame folds back into the same rectangle",
  /\.dfp-floatCardLeave\{[^}]*clip-path:var\(--dfp-clipStart[^}]*opacity:0[^}]*transform:scale\(\.985\)[^}]*pointer-events:none/
    .test(expected["lib/client.js"])
);
check(
  "the arming frame freezes every transition while the card is measured",
  /\.dfp-floatCardArm\{[^}]*transition:none/.test(expected["lib/client.js"]) &&
    expected["lib/client.js"].includes('card.classList.add("dfp-floatCardArm");') &&
    expected["lib/client.js"].includes('card.classList.remove("dfp-floatCardArm");')
);
check(
  "a stalled frame clock can neither park the enter frame nor keep a dead card up",
  expected["lib/client.js"].includes("var FLOAT_SETTLE_MS = 250;") &&
    expected["lib/client.js"].includes("settleTimer = globalThis.setTimeout(settle, FLOAT_SETTLE_MS);") &&
    expected["lib/client.js"].includes("if (settled) return;") &&
    expected["lib/client.js"].includes("globalThis.setTimeout(startLeave, FLOAT_SETTLE_MS);"),
  "both frame steps need the same timer stand-in"
);
check(
  "the card anchors flush on the dot's corner through the shared helper",
  expected["lib/client.js"].includes("shared.floatCardAnchor(quadrant)") &&
    // The anchored edge and the size live on the unclipped wrapper now; the
    // card fills it in normal flow and keeps the clip, the scale and the fade.
    // The local is named `cardCorner` on purpose: a local `corner` would shadow
    // the dot's own identity, which the quadrant above is read from.
    expected["lib/client.js"].includes('shadow.style[cardCorner.h] = "0px"') &&
    expected["lib/client.js"].includes('shadow.style[cardCorner.v] = "0px"') &&
    expected["lib/client.js"].includes("shadow.appendChild(card)") &&
    expected["lib/client.js"].includes("host.appendChild(shadow)")
);
check(
  "the clip start is measured from the live card, per quadrant",
  expected["lib/client.js"].includes("shared.floatClipStart(width, height, quadrant, shared.FLOAT_DOT)") &&
    expected["lib/client.js"].includes('card.style.setProperty(') &&
    expected["lib/client.js"].includes('"--dfp-clipStart"'),
  "the armed rectangle is not built from the card's own measurement"
);
// The dot only ever RESTS on a corner of the conversation, so ONE question — "is
// it on the corner it lives in yet?" — is asked by every path that ends a gesture
// or a panel state: a region change, a position adopted from the document, the
// open (the card grows AWAY from that corner) and a gesture the browser
// cancelled. The corner is the dot's IDENTITY (`panelCorner`, derived once and
// remembered) and never a fresh vote: a region that changed shape moves the dot
// to the new coordinates of the SAME corner, which is what the reported
// "bottom-right, the sidebar opened, and shutting moved it to bottom-left" was
// about. Only a RELEASE the user made picks a corner again, and the identity and
// the position travel to the document together.
//
// A region change is the one caller that SAYS SO (`settleOnCorner(true)`): the
// region moved the corner under the dot, so the dot's new coordinates are the
// region's answer and no document holds them yet — that settle stores what it
// moved, in either DIRECTION (a region that grew leaves the dot inside it, which
// is still a move: the reported "the dot stopped following when the sidebar came
// back"). A position the DOCUMENT handed over is painted on the corner and left
// alone, so the flag is what keeps one writer from arguing with another.
const settle = expected["lib/client.js"].match(
  /var settleOnCorner = function \(regionMoved, instant\) \{[\s\S]*?\n  \};/
);
const cornerHome = expected["lib/client.js"].match(
  /var cornerHome = function \(bounds, at\) \{[\s\S]*?\n  \};/
);
check(
  "the corner the dot rests on is one question, asked by every path that ends a state",
  settle !== null &&
    cornerHome !== null &&
    settle[0].includes("var target = cornerHome(bounds, at);") &&
    settle[0].includes("if (outside || naming) persistIfDirty();") &&
    settle[0].includes("if (regionMoved === true) persistIfDirty();") &&
    expected["lib/client.js"].includes("if (adoptDocPos()) settleOnCorner();") &&
    expected["lib/client.js"].includes("if (wasMoved) settleOnCorner();") &&
    /var reflowIntoBounds = function \(\) \{\n    var bounds = floatBounds\(\);/.test(
      expected["lib/client.js"]
    ) &&
    // the open asks it BEFORE the unfold is armed, so the card grows away from
    // the corner the dot actually rests on; the card's own side is voted in the
    // same breath, and only then is the unfold armed
    /settleOnCorner\(false, true\);\n(?:\s*\/\/[^\n]*\n)*\s*voteCardQuadrant\(\);\n(?:\s*\/\/[^\n]*\n)*\s*playEnter = true;/.test(
      expected["lib/client.js"]
    ),
  settle === null ? "no settleOnCorner in the bundle" : settle[0].slice(0, 120)
);
// The CARD's side is a different question from the dot's, and asked from a
// different place: the room on either side of the dot, measured against the
// conversation. Sharing the dot's rule is what made the card jump when the dot
// crossed a line the card had not, so the two are kept apart on purpose.
check(
  "the card picks its own side, by the room the conversation has for it",
  expected["lib/client.js"].includes("cardQuadrant = shared.floatCardCorner(region, origin.x, origin.y);") &&
    expected["lib/shared.cjs"].includes("var growRight = box.right - x >= x + size - box.left;") &&
    expected["lib/shared.cjs"].includes("var growDown = box.bottom - y >= y + size - box.top;") &&
    // the answer is about the dot and the region only: nothing measures the card
    // it just placed, so it cannot vote itself back and forth
    !expected["lib/client.js"].includes("panelCentre") &&
    !expected["lib/client.js"].includes("cardQuadrantBefore") &&
    // a card with no history of its own still unfolds out of the dot
    expected["lib/client.js"].includes("if (cardQuadrant !== null) {") &&
    // rendering is never a moment a side may change: the vote lives at the open
    // (no card yet) and at a release that lands the dot elsewhere, and a region
    // that changed shape decides it from the target corner before the settle
    (expected["lib/client.js"].match(/voteCardQuadrant\(/g) || []).length === 2 &&
    expected["lib/client.js"].includes("cardQuadrant = shared.floatCardCorner(bounds, home.x, home.y);") &&
    // a side is an anchored EDGE, so a snap that changes it would jump a
    // panel-width and THEN slide. The card is put back where it already was and
    // that offset is released over the dot's own slide: one motion, no middle.
    expected["lib/client.js"].includes('shadow.style.transform = "translate("') &&
    expected["lib/client.js"].includes(
      'shadow.style.transition = "transform " + FLOAT_SNAP_MS + "ms ease";'
    ) &&
    expected["lib/client.js"].includes("var FLOAT_SNAP_MS = 160;") &&
  "the card's side is voted where a side may change, never on every render"
);
// The corner is an identity, not a conclusion drawn from where the dot happens
// to be: it is NAMED in exactly one place (a document that never had one), and
// re-decided in exactly one place (a release the user made). A settle that voted
// for the nearest corner would put the bug back — it is what moved a dot that
// lived bottom-right onto bottom-left the moment a sidebar narrowed the region.
check(
  "the corner is chosen by a release, never re-voted by a change of shape",
  cornerHome !== null &&
    cornerHome[0].includes("if (corner === null) corner = shared.floatNearestCorner(bounds, at.x, at.y);") &&
    // the corner is read from the PANEL's own middle while it is up: a panel
    // dragged by its head hangs a whole card away from the dot
    expected["lib/client.js"].includes("corner = shared.floatQuadrantIn(bounds, ref.x, ref.y);") &&
    expected["lib/client.js"].includes("var ref = cardMiddle();") &&
    expected["lib/client.js"].includes(
      "ref = { x: pos.x + shared.FLOAT_DOT / 2, y: pos.y + shared.FLOAT_DOT / 2 };"
    ) &&
    settle[0].includes("shared.floatNearestCorner") === false &&
    settle[0].includes("shared.floatSnapTo") === false,
  cornerHome === null ? "no cornerHome in the bundle" : cornerHome[0].slice(0, 160)
);
// A region change is only answered if it is NOTICED, and the thing whose size
// change means "the region changed" is every box the bounds can be picked from —
// never the first markdown block's scroll parent. A real session log keeps its
// first block in an off-screen, ZERO-height holder (a virtualised transcript), so
// an observer pointed there never fires again: the sidebar opened and shut with
// the dot left on the coordinates of the other shape (the reported "it stopped
// following"). Every candidate is observed, unusable ones included, because a
// candidate that is a sliver today is the box that GROWS into the region when a
// conversation is laid out.
const regions = expected["lib/client.js"].match(
  /var regionTargets = function \(\) \{[\s\S]*?\n  \};/
);
const watch = expected["lib/client.js"].match(/var watchRegion = function \(\) \{[\s\S]*?\n  \};/);
check(
  "the region is watched where it is measured, not where the first markdown block happens to be",
  regions !== null &&
    watch !== null &&
    regions[0].includes("var list = floatRegions();") &&
    watch[0].includes("var targets = regionTargets();") &&
    watch[0].includes("regionObserver.observe(targets[index]);") &&
    // the whole candidate SET is re-pointed, not one remembered element
    watch[0].includes("sameTargets(observedRegion, targets)") &&
    watch[0].includes("proseElement") === false &&
    watch[0].includes("scrollParentOf") === false,
  watch === null
    ? "no watchRegion in the bundle"
    : `targets ${regions === null ? "missing" : "ok"} | watch ${watch[0].slice(0, 160)}`
);
// The candidate list is built ONCE and read by both the bounds and the watcher
// (`floatBoundsRects` and `regionTargets` each start from `floatRegions()`), so
// "which rectangle is the region" and "which box to watch" cannot drift apart.
check(
  "the bounds and the watched boxes come from one candidate list",
  expected["lib/client.js"].includes(
    "var picked = shared.floatBoundsPick(floatBoundsRects(), floatViewport());"
  ) &&
    expected["lib/client.js"].includes("boundsAreReal = picked.index >= 0;") &&
    (expected["lib/client.js"].match(/var list = floatRegions\(\);/g) || []).length === 2 &&
    expected["lib/shared.cjs"].includes("floatBoundsPick(rects, viewport).bounds"),
  "the region a dot is measured against and the region that is watched are not one list"
);
// The whole window is a STAND-IN for "no conversation measurable right now", and
// a stand-in must never move a dot the document already placed: that move is the
// reported "it sits on the window's left edge instead of the conversation's
// corner". Both paths that move the dot refuse it, and the region observer
// settles the dot for real as soon as a region exists.
check(
  "a whole-window stand-in never moves a dot that already has a home",
  expected["lib/client.js"].includes("if (!boundsAreReal && pos !== null) return pos;") &&
    expected["lib/client.js"].includes("if (!boundsAreReal && pos !== null) return false;"),
  "a stand-in region can still move the dot onto the window's corner"
);
// The candidate set alone cannot be the whole line: a host that REPLACES the
// conversation element leaves every observed box detached, and a detached box
// never reports a size again — while the resolve that would find the new node can
// only run inside the callback that will never arrive. The body is the one box the
// host cannot take away, so it stays in the observed set, next to the candidates.
const watchBody = bodyOf(expected["lib/client.js"], "watchRegion");
const staleAway = bodyOf(expected["lib/client.js"], "targetsUnchanged");
check(
  "the body is always one of the watched boxes: the line a replaced element cannot cut",
  watchBody.includes("var body = document.body === undefined ? null : document.body;") &&
    watchBody.includes("if (body !== null && targets.indexOf(body) < 0) targets.push(body);") &&
    watchBody.includes("observedBody = body;") &&
    watchBody.includes("observedBody === body") &&
    watchBody.includes("targetsUnchanged(targets)") &&
    staleAway.includes("shared.floatTargetsConnected(document, targets)") &&
    expected["lib/shared.cjs"].includes("sameWatchBounds: sameWatchBounds") &&
    expected["lib/shared.cjs"].includes("floatTargetsConnected: floatTargetsConnected"),
  watchBody === ""
    ? "no watchRegion in the bundle"
    : `watch ${watchBody.slice(0, 140)} | stale ${staleAway.slice(0, 100)}`
);
// And a fallback that is OUTSIDE the observer loop: the winning rectangle is read
// straight from the document on a timer, so nothing the host does to the node tree
// can make the panel deaf. It answers a CHANGED rectangle only — the comparison is
// four numbers, and an unchanged shape never reaches a reflow, a render or a write.
const poll = bodyOf(expected["lib/client.js"], "pollRegion");
const sameRead = bodyOf(expected["lib/client.js"], "sameWatchBounds");
check(
  "a low-frequency fallback read re-resolves the region, and answers a change only",
  expected["lib/client.js"].includes("var FLOAT_WATCH_POLL_MS = 500;") &&
    poll.includes("if (document.hidden === true) return;") &&
    poll.includes("if (reflowTimer !== null) return;") &&
    poll.includes("var bounds = floatBounds();") &&
    poll.includes("if (sameWatchBounds(pollBounds, bounds)) return;") &&
    poll.includes("pollBounds = bounds;") &&
    poll.includes("if (armed === false) return;") &&
    poll.includes("scheduleReflow();") &&
    sameRead.includes("shared.sameWatchBounds(a, b)") &&
    expected["lib/shared.cjs"].includes(
      "a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom"
    ) &&
    // armed once at mount, on the same path that resolves the watcher
    expected["lib/client.js"].includes(
      "watchRegion();\n  reflowIntoBounds();\n  // Armed AFTER the mount settle"
    ) &&
    expected["lib/client.js"].includes("pollTimer = globalThis.setInterval(pollRegion, FLOAT_WATCH_POLL_MS);") &&
    expected["lib/client.js"].includes('document.addEventListener("visibilitychange", onVisibility);') &&
    expected["lib/client.js"].includes("globalThis.clearInterval(pollTimer);") &&
    expected["lib/client.js"].includes('document.removeEventListener("visibilitychange", onVisibility);'),
  poll === ""
    ? "no pollRegion in the bundle"
    : `poll ${poll.slice(0, 160)} | same ${sameRead.slice(0, 120)}`
);
// The fallback may never write on its own: the only thing it reaches is the same
// debounced settle every observer callback takes, and the position that settle
// stores goes through the one write path that skips what the document holds.
check(
  "the fallback never writes: it reaches the settle, and the settle writes what moved",
  poll.includes("write") === false &&
    poll.includes("persistIfDirty") === false &&
    poll.includes("render") === false &&
    poll.includes("style") === false &&
    sameRead.includes("write") === false,
  `poll ${poll.slice(0, 200)}`
);
check(
  "the corner and the position are one write, and one read",
  /var writeLivePos = function \(live\) \{[\s\S]*?changes\[PANEL_CORNER_FIELD\] = corner;[\s\S]*?\n  \};/.test(
    expected["lib/client.js"]
  ) &&
    /var persistIfDirty = function \(\) \{[\s\S]*?changes\[PANEL_POS_FIELD\] = cur;[\s\S]*?changes\[PANEL_CORNER_FIELD\] = corner;[\s\S]*?\n  \};/.test(
      expected["lib/client.js"]
    ) &&
    expected["lib/client.js"].includes("corner = shared.parsePanelCorner(cornerText);") &&
    expected["lib/client.js"].includes("lastSeenCorner = readDocCorner();"),
  "the identity and the coordinates are not written (or read) together"
);
check(
  "the content follows the clip a beat behind it, in one small stagger",
  /\.dfp-floatHead,\.dfp-floatRow\{[^}]*transition:opacity \.2s ease \.06s/.test(expected["lib/client.js"]) &&
    /\.dfp-floatCardEnter \.dfp-floatHead,\.dfp-floatCardEnter \.dfp-floatRow\{[^}]*opacity:0/.test(
      expected["lib/client.js"]
    )
);
// The header carries ONE plain strip for the corner-pinned close — the same on
// every side of the viewport — and nothing at all is held open for the dot.
check(
  "the header keeps one plain strip for the two round buttons, with no per-corner math",
  expected["lib/client.js"].includes("shared.FLOAT_CLOSE_INSET +") &&
    expected["lib/client.js"].includes("shared.FLOAT_SETTINGS_GAP +") &&
    expected["lib/client.js"].includes("shared.FLOAT_CLOSE_GAP -") &&
    expected["lib/client.js"].includes("head.style.paddingRight =") &&
    !expected["lib/client.js"].includes("head.style.paddingLeft")
);
check(
  "the close is pinned to the card's own corner",
  floatClose !== null &&
    floatClose[0].includes("position:absolute") &&
    floatClose[0].includes("top:11px") &&
    floatClose[0].includes("right:8px")
);
for (const gone of [
  "FLOAT_DOT_PAD", // the dot's corner slot in the card
  "FLOAT_HEAD_GAP", // the slot's gap
  "dotSlot", // the slot arithmetic in the header
  "closeSlot", // and its close-side twin
  "closeOnRight", // mirroring the close away from the dot's slot
  "head.style.paddingLeft", // the dot's own column in the title row
]) {
  check(
    `the client bundle no longer carries ${gone}`,
    expected["lib/client.js"].includes(gone) === false &&
      expected["lib/shared.cjs"].includes(gone) === false
  );
}
check(
  "the card is rounded on the outside and inside the same scale",
  floatCard !== null &&
    floatCard[0].includes("border-radius:16px") &&
    /\.dfp-previewBox\{[^}]*border-radius:12px/.test(expected["lib/client.js"])
);
// The leave animation has to wait for a paint: a class added in the same task
// that rendered the card paints the end state at once (the close looked instant
// while the open animated).
const leaveStart = expected["lib/client.js"].match(/var startLeave = function \(\) \{[\s\S]{0,2400}?\n  \};/);
check(
  "the leave class waits two frames before it lands",
  expected["lib/client.js"].includes("globalThis.requestAnimationFrame(function () {") &&
    expected["lib/client.js"].includes("globalThis.requestAnimationFrame(startLeave);") &&
    leaveStart !== null &&
leaveStart[0].includes('classList.add("dfp-floatCardLeave")') &&
    leaveStart[0].includes("if (open) return;"),
  leaveStart === null ? "no startLeave in the bundle" : leaveStart[0].replace(/\s+/g, " ")
);
const leaveMs = (expected["lib/client.js"].match(/var FLOAT_LEAVE_MS = (\d+);/) || [])[1];
check(
  "the shut card is dropped by a timer, after a deliberately slow fold",
  expected["lib/client.js"].includes("closeTimer = globalThis.setTimeout(endLeave, FLOAT_LEAVE_MS);") &&
    leaveMs !== undefined &&
    // The fold is meant to read as deliberate: it gets its own, longer curve than
    // the 280 ms unfold it mirrors, and the timer that drops the element must
    // never cut that curve short.
    Number(leaveMs) >= 400 &&
    (leaveSeconds === null || Number(leaveSeconds) * 1000 <= Number(leaveMs)),
  "FLOAT_LEAVE_MS=" + leaveMs + " fold=" + leaveSeconds + "s"
);
check(
  "the invisible card never swallows the clicks underneath it",
  /\.dfp-floatCardLeave\{[^}]*pointer-events:none/.test(expected["lib/client.js"])
);
check(
  "a shut card is not rebuilt under the leave animation",
  expected["lib/client.js"].includes("if (!open && leaving) return;") &&
    expected["lib/client.js"].includes("leaving = true;")
);
// The fold re-measures the dot's rectangle (a resize may have moved the card's
// edges since the render that built it) and brings the dot back in the same
// frame, over the same span, so the two cross-fades end together.
check(
  "the fold re-arms the rectangle and calls the dot back",
  leaveStart !== null &&
    leaveStart[0].includes("armClipStart(card)") &&
    leaveStart[0].includes('classList.remove("dfp-dotAway")') &&
    leaveStart[0].includes('classList.add("dfp-dotBack")'),
  leaveStart === null ? "no startLeave in the bundle" : leaveStart[0].replace(/\s+/g, " ")
);
// The user asked for the panel to animate regardless of the OS motion preference
// (2026-10-01): their own machine reports `prefers-reduced-motion: reduce`, which
// is exactly the case this plugin must NOT go quiet in. So the block stays in the
// sheet with a query that can never match, and the client stops consulting the
// preference. The invariant is that BOTH hold — a well-meaning edit that honours
// the OS setting again would silently turn every animation off on their machine.
const reduced = expected["lib/client.js"].match(
  /@media \(prefers-reduced-motion:reduce\) and \(min-width:2px\) and \(max-width:1px\)\{/
);
check(
  "the panel animates regardless of the OS motion preference",
  reduced !== null &&
    !expected["lib/client.js"].includes(
      'matchMedia("(prefers-reduced-motion: reduce)").matches === true'
    ),
  reduced === null ? "the reduced-motion block is not fenced off" : "ok"
);
// The close button only ever sees a click when a press on it does not start a
// drag: `startDrag` preventDefaults the pointerdown, and that suppresses the
// compatibility click the button waits for.
const headPress = expected["lib/client.js"].match(
  /head\.addEventListener\("pointerdown", function \(event\) \{[\s\S]{0,900}?\}\);/
);
check(
  "a press on a head control never becomes a drag",
  headPress !== null &&
    headPress[0].includes('closest("button,select,input,textarea,a")') &&
    headPress[0].includes("startDrag(event, head, state.writable)"),
  headPress === null ? "no head pointerdown handler" : headPress[0].replace(/\s+/g, " ")
);
// A drag that loses its listeners stops moving the dot (the regression this
// suite exists to catch): all four registrations and the preventDefault must
// still be there, in that order.
const dragBlock = expected["lib/client.js"].slice(
  expected["lib/client.js"].indexOf("var startDrag = function"),
  expected["lib/client.js"].indexOf("var startResize = function")
);
check(
  "the drag still registers all four window listeners, in order",
  dragBlock.length > 0 &&
    [
      'addEventListener("pointermove", move)',
      'addEventListener("pointerup", up)',
      'addEventListener("pointercancel", cancelled)',
      'addEventListener("blur", blurred)',
    ].every(
      (needle, index, all) =>
        dragBlock.includes(needle) &&
        (index === 0 || dragBlock.indexOf(needle) > dragBlock.indexOf(all[index - 1]))
    ) &&
    dragBlock.indexOf("event.preventDefault()") >
      dragBlock.indexOf('addEventListener("blur", blurred)'),
  dragBlock.length === 0 ? "no startDrag in the bundle" : "startDrag slice is incomplete"
);
// The trimmed chrome must not creep back through a stale bundle, and neither
// may the two withdrawn features.
for (const gone of [
  "dfp-floatShut", // the second (round minus) shut
  "dfp-floatSelect", // the preset dropdown
  "dfp-floatButtons", // the reset/row button strip
  "dfp-floatBadge", // the unsaved "trying on" badge
  "panel.collapse", // the shut's label
  "panel.reset", // the reset button's label
  "panel.expand", // never rendered, removed with the same pass
  "dfp-fitName", // the fitting room's candidate name
  "dfp-fitRow", // its prev/next row
  "dfp-fitSample", // its sample block
  "dfp-fitBadge", // its "trying on" badge
  "paper.label", // the paper overlay's switch
  "paper.hint", // its explainer
]) {
  check(
    `the client bundle no longer carries ${gone}`,
    expected["lib/client.js"].includes(gone) === false
  );
}

// FT-060 wiring: a continuous family is probed in the idle warm-up, the probe
// promotes it into the map the stylesheet reads, and the stylesheet declares the
// aliases it leads its stacks with. Each of the three links must survive a rebuild.
check(
  "the weight warm-up probes each axis for continuity",
  expected["lib/client.js"].includes("probeContinuity(stacks.dialog);") &&
    expected["lib/client.js"].includes("probeContinuity(stacks.ui);") &&
    expected["lib/client.js"].includes("probeContinuity(stacks.code);"),
  "the probe runs in the same idle slices as the warm-up"
);
check(
  "a promoted family is read by the stylesheet and the weight profile",
  expected["lib/client.js"].includes("buildFontCss(config, tokens(), harvestScope(), variableFamilies)") &&
    expected["lib/client.js"].includes("shared.buildVariableFaces(variableFamilies)") &&
    expected["lib/client.js"].includes("shared.CONTINUOUS_CANDIDATES"),
  "the map is the single source for both the faces and the notch shape"
);
// A promoted family is measured THROUGH its alias on the fine grid: measuring it
// through the family itself would put every continuous axis back on the stepped
// shape the alias exists to remove.
check(
  "a promoted family's shape is measured through its alias",
  expected["lib/client.js"].includes("var target = promoted ? '\"' + alias + '\"' : resolved;") &&
    expected["lib/client.js"].includes("candidates: shared.CONTINUOUS_CANDIDATES"),
  "the fine notches are measured, not assumed"
);
// A monospace family never changes width with weight. The discriminator therefore
// compares the alias response against the family's own: dropping the comparison
// silently returns every code font to the stepped shape.
check(
  "the discriminator compares the alias response against the family itself",
  expected["lib/client.js"].includes("shared.respondsFinerThan(inks, plainInks)") &&
    expected["lib/client.js"].includes("function inkOfSignature(signature)") &&
    expected["lib/client.js"].includes("sampleWeightSignature('\"' + family + '\"', weight)"),
  "a family that snaps answers identically either way, so it cannot pass"
);
// ONE resolution, everywhere. The panel used to resolve its own stack (the configured
// field alone), which misses the promotion once a stack comes back from the page
// carrying the alias — the panel then kept the coarse notches while the card moved on.
// The previews had the mirror-image gap: they drew through the plain family, so a fine
// notch that moved the conversation did nothing in the box meant to show it.
check(
  "the panel measures the family through the same helper as the card",
  expected["lib/client.js"].includes("var dialogStack = weightAxisStacks(config).dialog;") &&
    !expected["lib/client.js"].includes("var dialogStack = formatStack(parseStack(config[STACK_DIALOG_FIELD]));"),
  "one stack resolution for the card, the panel and the warm-up"
);
check(
  "every preview draws through the same alias the real surfaces use",
  expected["lib/client.js"].includes("previewUiStyle.fontFamily = shared.withVariableFaces(uiStack, variableFamilies)") &&
    expected["lib/client.js"].includes("previewDialogStyle.fontFamily = shared.withVariableFaces(dialogStack, variableFamilies)") &&
    expected["lib/client.js"].includes("shared.withVariableFaces(formatStack(parseStack(editing[MONO_FIELD])), variableFamilies)"),
  "a preview that snaps while the conversation moves is worse than no preview"
);
check(
  "a family name is read through any alias the stack leads with",
  expected["lib/client.js"].includes("if (names[index].indexOf(shared.VARIABLE_ALIAS_PREFIX) !== 0) return names[index];"),
  "the promotion map is keyed by the real family, never by our alias"
);
// A promotion lands after the panel has already rendered its weight row once, and the
// row caches the shape it was built with: rebuilding the stylesheet alone left the
// panel on the coarse notches (measured live: the row kept -1 … +2 while the card moved
// to 25-unit steps). Every mounted panel re-renders on promotion.
check(
  "a promotion redraws whatever is showing a weight shape",
  expected["lib/client.js"].includes("notifyPromoted();") &&
    expected["lib/client.js"].includes("promotionListeners.push(render);") &&
    expected["lib/client.js"].includes("var at = promotionListeners.indexOf(render);"),
  "the panel listens while it is mounted and stops when it is destroyed"
);
// Base token values come from root-scoped declarations only. Another plugin's module
// stylesheet may reuse a token name for its own compact panel, and the line-height axis
// rebuilds the markdown shorthands from these very values — the measured failure was
// every heading dropping to that panel's 13px.
check(
  "a base token value is read from a root-scoped declaration only",
  expected["lib/client.js"].includes("var rootScoped = isRootScopedRule(rule);") &&
    expected["lib/client.js"].includes("shared.isRootScopeSelector(rule.selectorText)") &&
    expected["lib/client.js"].includes("else local[property] = declared;") &&
    expected["lib/client.js"].includes("if (!Object.prototype.hasOwnProperty.call(out, name)) out[name] = local[name];") &&
    expected["lib/shared.cjs"].includes("function isRootScopeSelector(selector)"),
  "a class-scoped token is that panel's local choice, and only ever a fallback"
);
// The shaping axes (tracking, word gap, paragraph gap, indent) and the breaking switch.
// Each one is a FIELD wired to a CONTROL: a row that renders but writes another field, or
// a switch wired to a slider, is invisible in a CSS-only test and obvious to a reader.
check(
  "every shaping axis has a card control wired to its own field",
  expected["lib/client.js"].includes('field: LETTER_SPACING_DIALOG_FIELD,\n              labelKey: "shape.letterLabel"') &&
    expected["lib/client.js"].includes('field: WORD_SPACING_DIALOG_FIELD,\n              labelKey: "shape.wordLabel"') &&
    expected["lib/client.js"].includes('field: PARAGRAPH_SPACING_DIALOG_FIELD,\n              labelKey: "shape.paragraphLabel"') &&
    expected["lib/client.js"].includes('field: INDENT_DIALOG_FIELD,\n              labelKey: "shape.indentLabel"') &&
    expected["lib/client.js"].includes('field: LINE_BREAK_STRICT_FIELD,\n      labelKey: "shape.breakLabel"'),
  "four sliders and a switch, one field each"
);
// The panel carries the two a reader reaches for most often, plus the readout. The card
// and the panel read the same fields, so a value set in one shows in the other (verified
// live: the panel read back 字距 +0.60px and 首行缩进 1.50em straight after the card
// wrote them).
check(
  "the panel offers every conversation axis inside a scrolling body",
  (expected["lib/client.js"].match(/sliderRow\(\n      body,/g) || []).length === 6 &&
    expected["lib/client.js"].includes('var body = el("div", "dfp-floatBody");') &&
    expected["lib/client.js"].includes("card.appendChild(body);") &&
    expected["lib/client.js"].includes(".dfp-floatBody{flex:1 1 auto;min-height:0;overflow-y:auto;") &&
    expected["lib/client.js"].includes("commit({ wordSpacingDialog: next });") &&
    expected["lib/client.js"].includes("commit({ paragraphSpacingDialog: next });"),
  "six slider rows plus the weight row, and the two shaping gaps among them"
);
// The block under the sliders: the three families the page is really rendering with, then
// the weight control's shape — and it folds away, because a panel being used to drag a
// slider does not need four lines of prose under it.
check(
  "the in-force block groups the three families, then the notch count",
  expected["lib/client.js"].includes('t("status.dialog")') &&
    expected["lib/client.js"].includes("state.dialog.family") &&
    expected["lib/client.js"].includes("state.ui.family") &&
    expected["lib/client.js"].includes("state.code.family") &&
    expected["lib/client.js"].includes('t("status.steps", { count: state.notches })') &&
    expected["lib/client.js"].indexOf('t("status.dialog")') < expected["lib/client.js"].indexOf('t("status.weight")'),
  "conversation, interface and code together; the slider's shape below them"
);
// "Follows" belongs to the interface and nowhere else, and a family the reader chose must
// never be labelled as the host's: the conversation takes the interface font when its own
// field is empty (`expandFollow`), so labelling that "DSH default" told a reader who set
// the interface font that the conversation was on DSH's own — measured on the reporting
// machine, where exactly that was on screen.
check(
  "a chosen family is never labelled as the host's own",
  expected["lib/client.js"].includes("own: dialogConfigured || uiConfigured,") &&
    expected["lib/client.js"].includes("own: uiConfigured,") &&
    expected["lib/client.js"].includes("state.dialog.own ? \"\" : hostDefault,") &&
    expected["lib/client.js"].includes('state.ui.follows ? t("status.followDialog") : state.ui.own ? "" : hostDefault,') &&
    expected["lib/client.js"].includes("state.code.own ? \"\" : hostDefault,") &&
    expected["lib/client.js"].includes('"status.hostDefault": "DSH 自带"') &&
    expected["lib/client.js"].includes('"status.hostDefault": "DSH\'s own"') &&
    expected["lib/client.js"].includes('"status.usesInterface": "未单独设置，沿用界面字体"') &&
    expected["lib/client.js"].includes('"status.uiFollowsNote": "界面沿用对话的字体"') &&
    expected["lib/client.js"].includes('"status.followDialog": "跟随对话"') &&
    expected["lib/client.js"].includes('"status.title": "当前生效"'),
  "the reason lives in the tooltip; the visible line stays short"
);
// The panel's height is the CONTENT's. It used to be a stored cap produced by the
// bottom/corner grips; those grips are gone (a press on the panel's own last row
// landed on the grip instead of the control there), so the cap went with them and
// the card leans on its viewport `max-height` while the body owns the scroll.
check(
  "the panel's height follows its content",
  expected["lib/client.js"].includes('card.style.maxHeight = "";') &&
    expected["lib/client.js"].includes("if (resize === null) shadow.style.height = " + String.fromCharCode(34, 34) + ";") &&
    expected["lib/client.js"].includes("max-height:calc(100vh - 24px)") &&
    expected["lib/client.js"].includes(".dfp-floatBody{flex:1 1 auto;min-height:0;overflow-y:auto;") &&
    !expected["lib/client.js"].includes("sized.h > 0") &&
    !expected["lib/client.js"].includes("dfp-floatResizeB"),
  "the card caps itself at the viewport, and only the width grip remains"
);
check(
  "the in-force block folds, with an animated clip",
  expected["lib/client.js"].includes('head.setAttribute("aria-expanded", state.open ? "true" : "false");') &&
    expected["lib/client.js"].includes('block.classList.toggle("dfp-floatInfoOpen", infoOpen);') &&
    expected["lib/client.js"].includes("var infoOpen = true;") &&
    expected["lib/client.js"].includes(".dfp-floatInfoClip{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .24s") &&
    expected["lib/client.js"].includes(".dfp-floatInfoOpen .dfp-floatInfoClip{grid-template-rows:1fr;opacity:1}") &&
    expected["lib/client.js"].includes('glyph.setAttribute("class", "dfp-chevron" + (infoOpen ? " dfp-chevronOpen" : ""));'),
  "a grid-row transition clips the body open and shut"
);
// The panel is plain DOM (`el`/`svgEl`), while the card is React (`h` = createElement). A
// React element appended to a plain node is not a Node at all, and the failure is total:
// the whole panel stops rendering. This cost one debugging round; the pin is cheap.
check(
  "the panel builds its chevron as DOM, never as a React element",
  expected["lib/client.js"].includes('var glyph = svgEl("svg", {\n      class: "dfp-chevron"') &&
    expected["lib/client.js"].includes('glyph.appendChild(svgEl("path", { d: CHEVRON_PATH, fill: "currentColor" }));') &&
    expected["lib/client.js"].includes("var body = el(\"div\", \"dfp-floatBody\");"),
  "the card renders with h(), the panel with el() and svgEl()"
);
// The preview has to show what the conversation shows: the shaping rides the preview's own
// inline style, and the box carries a second paragraph, because a paragraph gap between
// one paragraph and nothing is invisible.
check(
  "the preview carries the shaping axes and a second paragraph",
  expected["lib/client.js"].includes("previewDialogStyle.letterSpacing = String(editing[LETTER_SPACING_DIALOG_FIELD])") &&
    expected["lib/client.js"].includes("previewDialogStyle.wordSpacing = String(editing[WORD_SPACING_DIALOG_FIELD])") &&
    expected["lib/client.js"].includes("previewDialogStyle.textIndent = String(editing[INDENT_DIALOG_FIELD])") &&
    expected["lib/client.js"].includes("shared.PARAGRAPH_BASELINE_PX + previewDialogGap") &&
    expected["lib/client.js"].includes('h("p", { style: previewSecondStyle }, t("preview.sampleSecond"))'),
  "a preview that cannot show the axis is worse than none"
);
// A hint with a placeholder in it must be given its value. The four shaping hints all say
// "adds {offset}", they all render through ONE factory, and a missing parameter ships the
// braces to the screen — which is how this was found (a screenshot of the card), and is
// exactly what no test looked at. Pinning the single call site covers all four.
check(
  "the shaping hints interpolate the value they name",
  expected["lib/client.js"].includes("hint: t(props.hintKey, { offset: shown(value) }),") &&
    expected["lib/client.js"].includes('"shape.letterHint":\n      "Adds {offset} to the conversation') &&
    expected["lib/client.js"].includes('"shape.indentHint":\n      "Indents the first line of each conversation paragraph by {offset}'),
  "one factory, one interpolation, four hints"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
