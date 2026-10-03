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
  "PLUGIN_PANEL_ID",
  "pluginEntryCard",
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
  "the settings jump is wired to the entry card's title button",
  expected["lib/client.js"].includes("shared.pluginClickTarget(shared.pluginEntryCard(document))"),
  "run `node build.mjs` after editing src/client.js"
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
// the toggle rows must read as one component family with the synthesis row.
check(
  "compact choices sit on their label row, never under the hint",
  (expected["lib/client.js"].match(/inline: true,/g) || []).length === 3 &&
    expected["lib/client.js"].includes('h("div", { className: "dfp-inline" }, props.children)'),
  "the three segmented rows share the label-row layout"
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
    resizeBlock.includes('box.style.height = "min(" + h + "px,calc(100vh - 24px))"') &&
    expected["lib/client.js"].includes("startResize(event, edge.mode, shadow, card)"),
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
check(
  "the card's shadow rides an unclipped wrapper, never the clipped card",
  floatShadow !== null &&
    floatShadow[0].includes("filter:drop-shadow(") &&
    floatShadow[0].includes("box-shadow") === false &&
    // Chromium clips an element's OWN filter output with that element's
    // `clip-path`: a shadow on the card would be carved away for the whole
    // unfold and the whole fold, then pop in on the frame the resting clip is
    // released. The wrapper must therefore carry no clip and no overflow of any
    // kind, or the shadow is clipped a level higher instead.
    floatShadow[0].includes("clip-path") === false &&
    floatShadow[0].includes("overflow") === false &&
    // a pure paint layer: the card and everything inside it keeps the pointer
    floatShadow[0].includes("pointer-events:none") &&
    floatCard !== null &&
    floatCard[0].includes("filter") === false,
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
      "transition:clip-path .28s cubic-bezier(.22,1,.28,1),opacity .28s cubic-bezier(.22,1,.28,1),transform .28s cubic-bezier(.22,1,.28,1)"
    ),
  cardRule === null ? "no .dfp-floatCard rule" : cardRule[0]
);
const cardEnter = expected["lib/client.js"].match(/\.dfp-floatCardEnter\{[^}]*\}/);
check(
  "the enter frame is clipped to the dot's rectangle",
  cardEnter !== null &&
    cardEnter[0].includes("clip-path:var(--dfp-clipStart") &&
    cardEnter[0].includes("opacity:.6") &&
    cardEnter[0].includes("transform:scale(.985)"),
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
  /var settleOnCorner = function \(regionMoved\) \{[\s\S]*?\n  \};/
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
    /var reflowIntoBounds = function \(\) \{\n    if \(!settleOnCorner\(true\)\) return;/.test(
      expected["lib/client.js"]
    ) &&
    // the open asks it BEFORE the unfold is armed, so the card grows away from
    // the corner the dot actually rests on
    /settleOnCorner\(\);\n      playEnter = true;/.test(expected["lib/client.js"]),
  settle === null ? "no settleOnCorner in the bundle" : settle[0].slice(0, 120)
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
    expected["lib/client.js"].includes(
      "corner = shared.floatNearestCorner(floatBounds(), pos.x, pos.y);"
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
    "return shared.floatBoundsFrom(floatBoundsRects(), floatViewport());"
  ) &&
    (expected["lib/client.js"].match(/var list = floatRegions\(\);/g) || []).length === 2 &&
    expected["lib/shared.cjs"].includes("floatBoundsPick(rects, viewport).bounds"),
  "the region a dot is measured against and the region that is watched are not one list"
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
    floatClose[0].includes("top:8px") &&
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
const leaveStart = expected["lib/client.js"].match(/var startLeave = function \(\) \{[\s\S]{0,1200}?\n  \};/);
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
  /head\.addEventListener\("pointerdown", function \(event\) \{[\s\S]{0,600}?\}\);/
);
check(
  "a press on a head button never becomes a drag",
  headPress !== null &&
    headPress[0].includes('closest("button")') &&
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
