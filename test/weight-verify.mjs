/**
 * Verify in a real browser that the interface, conversation and code WEIGHT
 * axes are independent.
 *
 *   node test/weight-verify.mjs <url-with-token>
 *
 * Weight has no token chain to ride (no shipped rule reads a `-font-weight`
 * token), so these axes are `!important` rules and the whole question is which
 * one wins on which surface. This script therefore builds the surfaces DSH
 * itself builds — a markdown block (`pre` with the code `font` shorthand),
 * inline code, the tool code body and the terminal body (plain divs that only a
 * class name identifies), plus a conversation markdown container with the
 * paragraphs / strong / headings inside it — inside the REAL page, with DSH's
 * real stylesheets loaded, and reads back the computed weight of each.
 *
 * All three weight axes are OFFSETS on each element's own weight (DSH keeps 700
 * for h1..h3, 600 for h4..h6/strong, 500 for `th` and 400 for the rest inside its
 * `font` shorthands, and 400 for the code surfaces).
 * The checks below therefore expect `base + offset`, and two of them exist
 * purely to catch a regression to a flat `font-weight` over the markdown scope,
 * which used to erase that hierarchy in one direction and invert it in the
 * other. The probe container carries both the real markdown class and the
 * `data-dss-prose` hint, because that attribute is what the conversation ladder
 * is scoped by.
 *
 * The interface axis is the one that has to reach the whole page, so its rule is
 * `body` plus an element table with the conversation markdown subtree excluded.
 * That exclusion is measured here directly: the script counts how many page
 * elements the injected CSS moved, split into "inside a markdown container" and
 * "outside".
 *
 * The namespace's original user layer is restored before the process exits.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9343;
const BACKUP = join(tmpdir(), "dfp-weight-verify-original.json");
/** Set once the original layer is known, so a failure can still put it back. */
let restoreHook = null;
let restored = false;

/**
 * Put a parked original layer back: `--restore` exists because the settings
 * file write is debounced, so a run killed right after its restore can leave
 * the mutations behind.
 */
if (process.argv[2] === "--restore") {
  const url = process.argv[3];
  if (!url) {
    console.error("usage: node test/weight-verify.mjs --restore <url-with-token>");
    process.exit(2);
  }
  const parked = JSON.parse(readFileSync(BACKUP, "utf8"));
  console.log("restoring user layer:", JSON.stringify(parked));
  const profileDir = mkdtempSync(join(tmpdir(), "dfp-restore-"));
  const browser = execFile(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let target = null;
  for (let i = 0; i < 20 && target === null; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === "page" && t.url?.startsWith("about:blank")) ?? null;
    } catch {}
    if (target === null) await sleepMs(300);
  }
  if (target === null) {
    console.error("no CDP target");
    browser.kill();
    process.exit(1);
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const waiting = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const slot = waiting.get(message.id);
    if (!slot) return;
    waiting.delete(message.id);
    if (message.error) slot.reject(new Error(message.error.message));
    else slot.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      waiting.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleepMs(8000);
  const ops = [];
  for (const key of Object.keys(parked)) ops.push({ op: "set", path: [key], value: parked[key] });
  for (const key of ["weight", "weightCode", "weightDialog", "uiFollowsDialog"]) {
    if (!Object.prototype.hasOwnProperty.call(parked, key)) ops.push({ op: "unset", path: [key] });
  }
  const result = await send("Runtime.evaluate", {
    expression: `(async () => {
      const body = await (await fetch("/api/settings/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "client-request",
          rpcId: "restore",
          method: "settings/mutate",
          payload: { args: { ns: "dsh-fonttune", ops: ${JSON.stringify(ops)} } },
        }),
      })).json();
      return JSON.stringify(body.result && body.result.value ? body.result.value.user ?? body.result.value : body);
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log("result:", result.result?.value ?? JSON.stringify(result));
  socket.close();
  browser.kill();
  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch {}
  process.exit(0);
}

const url = process.argv[2];
if (!url) {
  console.error("usage: node test/weight-verify.mjs <url-with-token> | --restore <url-with-token>");
  process.exit(2);
}
const profile = mkdtempSync(join(tmpdir(), "dfp-weight-"));
const child = execFile(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--window-size=1400,1000",
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`);
  }
}

const main = async () => {
  let target = null;
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page" && t.url?.startsWith("about:blank"));
      if (page) {
        target = page;
        break;
      }
    } catch {}
    await sleep(300);
  }
  if (!target) throw new Error("no CDP target");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const consoleLines = [];
  let seq = 0;
  const pendingCalls = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined && pendingCalls.has(msg.id)) {
      const { resolve, reject } = pendingCalls.get(msg.id);
      pendingCalls.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const details = msg.params.exceptionDetails;
      consoleLines.push(`[exception] ${details.text} ${details.exception?.description ?? ""}`);
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level !== "info") {
      consoleLines.push(`[${msg.params.entry.level}] ${msg.params.entry.text}`);
    }
  });
  const send = (method, params = {}) => {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pendingCalls.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  const evalJs = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      return `THREW: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ""}`;
    }
    return result.result.value;
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleep(10000);

  const readNamespace = () =>
    evalJs(`(async () => {
      const res = await fetch("/api/settings/describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "client-request", rpcId: "r" + Math.random(), method: "settings/describe", payload: { args: {} } }),
      });
      const body = await res.json();
      const list = (body.result && body.result.value && body.result.value.namespaces) || [];
      const mine = list.find((entry) => entry.ns === "dsh-fonttune");
      return mine ? JSON.stringify({ user: mine.user }) : "section not found";
    })()`);

  const mutate = (ops) =>
    evalJs(`(async () => {
      const body = await (await fetch("/api/settings/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "client-request",
          rpcId: "m" + Math.random(),
          method: "settings/mutate",
          payload: { args: { ns: "dsh-fonttune", ops: ${JSON.stringify(ops)} } },
        }),
      })).json();
      const value = body.result && body.result.value;
      return JSON.stringify(value ? value.user ?? value : body);
    })()`);

  /**
   * Build the code surfaces DSH builds and read every computed weight back.
   *
   * Every probe element copies the `font` shorthand DSH's own stylesheet gives
   * that surface, so the weight under test is the one the real cascade produces
   * — plus a `<span>` inside a block and inside the terminal, because the
   * interface rule reaches those through its element table. The conversation
   * block carries BOTH scopes: the real markdown container class (so DSH's own
   * markdown `font` shorthands apply, which is where the 700/600/500/400 bases
   * live) and `data-dss-prose`, which is the hint the plugin harvests for its
   * conversation ladder — without it the ladder would not match a detached
   * probe and the headings would read DSH's own weights instead of base+offset.
   */
  const measure = () =>
    evalJs(`(() => {
      let containerClass = null;
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = [...sheet.cssRules]; } catch { continue; }
        for (const rule of rules) {
          const hit = (rule.selectorText || "").match(/^\\.(_markdown_[A-Za-z0-9_-]+)$/);
          if (hit && /markdown-base/.test(rule.cssText)) { containerClass = hit[1]; break; }
        }
        if (containerClass) break;
      }
      const host = document.createElement("div");
      host.id = "dfp-weight-probe";
      host.innerHTML =
        '<p id="w-body">body text</p>' +
        '<p id="w-body-span"><span>nested body</span></p>' +
        '<pre id="w-pre" style="font: var(--dsw-font-markdown-code-block)">code<span id="w-pre-span">nested code</span></pre>' +
        '<code id="w-inline" style="font: var(--dsw-font-markdown-code)">inline</code>' +
        '<div id="w-tool" class="o3BgMG_codeBody" style="font: var(--dsw-font-markdown-code-block)">tool</div>' +
        '<div id="w-terminal" class="CY-8Ka_terminalBody" style="font: var(--dsw-font-markdown-code-block-small)">term<span id="w-term-span">nested term</span></div>' +
        '<div id="w-cm" class="cm-editor" style="font: var(--dsw-font-markdown-code-block)">editor</div>' +
        (containerClass === null
          ? ""
          : '<div class="' + containerClass + '" data-dss-prose id="w-conv-host">' +
            '<p id="w-conv">paragraph</p><strong id="w-conv-strong">strong</strong>' +
            '<h2 id="w-conv-h2">heading</h2><code id="w-conv-code">inline</code></div>');
      document.body.appendChild(host);
      const weightOf = (id) => {
        const el = document.getElementById(id);
        return el === null ? null : getComputedStyle(el).fontWeight;
      };
      const out = {
        body: weightOf("w-body"),
        bodySpan: weightOf("w-body-span"),
        pre: weightOf("w-pre"),
        preSpan: weightOf("w-pre-span"),
        inline: weightOf("w-inline"),
        tool: weightOf("w-tool"),
        terminal: weightOf("w-terminal"),
        termSpan: weightOf("w-term-span"),
        editor: weightOf("w-cm"),
        conv: weightOf("w-conv"),
        convStrong: weightOf("w-conv-strong"),
        convH2: weightOf("w-conv-h2"),
        convCode: weightOf("w-conv-code"),
        containerClass,
        ourCss: [...document.querySelectorAll('style[data-plugin-css="dsh-fonttune"]')]
          .map((tag) => (tag.textContent || "").length)
          .reduce((a, b) => a + b, 0),
      };
      host.remove();
      return JSON.stringify(out);
    })()`);

  /**
   * Where the weight actually lands, as a histogram.
   *
   * The plugin's stylesheet is injected twice — the host half renders one copy
   * into the served `<head>` for the first frame and the browser half keeps a
   * second one in sync — so "remove the tag and look" cannot answer this. The
   * histogram can: the probe block gives a controlled conversation (the real
   * markdown container class) and a controlled interface paragraph, and the page
   * sweep counts the real chrome by weight.
   */
  const distribution = () =>
    evalJs(`(() => {
      let containerClass = null;
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = [...sheet.cssRules]; } catch { continue; }
        for (const rule of rules) {
          const hit = (rule.selectorText || "").match(/^\\.(_markdown_[A-Za-z0-9_-]+)$/);
          if (hit && /markdown-base/.test(rule.cssText)) { containerClass = hit[1]; break; }
        }
        if (containerClass) break;
      }
      const host = document.createElement("div");
      host.id = "dfp-dist";
      // data-dss-prose on the probe container for the same reason as in
      // measure(): it is the scope the conversation ladder hangs on.
      host.innerHTML =
        (containerClass === null
          ? ""
          : '<div class="' + containerClass + '" data-dss-prose id="dfp-dist-md">' +
            '<p id="dfp-dist-md-p">p</p><strong id="dfp-dist-md-strong">s</strong>' +
            '<h2 id="dfp-dist-md-h2">h</h2><code id="dfp-dist-md-code">c</code></div>') +
        '<p id="dfp-dist-ui">interface</p><p id="dfp-dist-ui-nested"><span>nested</span></p>';
      document.body.appendChild(host);
      const bump = (bucket, weight) => { bucket[weight] = (bucket[weight] ?? 0) + 1; };
      const probe = { byWeight: {}, markdownByWeight: {} };
      for (const el of host.querySelectorAll("*")) {
        const weight = getComputedStyle(el).fontWeight;
        if (el.closest("#dfp-dist-md") !== null) bump(probe.markdownByWeight, weight);
        else bump(probe.byWeight, weight);
      }
      const page = { byWeight: {}, markdownByWeight: {}, sampled: 0 };
      for (const el of document.querySelectorAll("body *")) {
        if (!(el.textContent || "").trim()) continue;
        if (el.closest("#dfp-dist") !== null) continue;
        page.sampled += 1;
        if (el.closest('[class*="_markdown_" i]') !== null) bump(page.markdownByWeight, getComputedStyle(el).fontWeight);
        else bump(page.byWeight, getComputedStyle(el).fontWeight);
      }
      host.remove();
      return JSON.stringify({ probe, page });
    })()`);

  /**
   * The stylesheet elements this plugin owns, and the raw index the server sent.
   *
   * The plugin's CSS reaches the page twice by design — the host half renders a
   * first-frame copy into the served index (which now carries the plugin's stamp
   * so the browser half can adopt it) and the browser half keeps it in sync.
   * Two elements would mean the browser half appended instead of adopting, and
   * then a rule the settings no longer produce would keep applying from the
   * stale served copy until the next reload.
   */
  const stylesheets = () =>
    evalJs(`(async () => {
      const tags = [...document.querySelectorAll('style[data-plugin-css="dsh-fonttune"]')];
      const index = await (await fetch("/")).text();
      return JSON.stringify({
        count: tags.length,
        stamped: tags.filter((tag) => tag.dataset.plugin === "dsh-fonttune").length,
        inServedIndex: index.includes('<style data-plugin="dsh-fonttune" data-plugin-css="dsh-fonttune">'),
        bytes: tags.map((tag) => (tag.textContent || "").length),
      });
    })()`);

  const before = JSON.parse(await readNamespace());
  const original = before.user ?? {};
  console.log("original user layer:", JSON.stringify(original));

  /**
   * The walk writes the plugin's own fields, and the settings file write is
   * debounced on the host side, so the original layer is also parked on disk:
   * if a run is killed before its restore flushes, `--restore` puts it back.
   */
  const BACKUP_LOCAL = BACKUP;
  writeFileSync(BACKUP_LOCAL, JSON.stringify(original, null, 2), "utf8");
  console.log(`original layer parked at ${BACKUP_LOCAL} (run with --restore to put it back)`);

  /** The ops that put one user layer back exactly as it was. */
  const restoreOpsFor = (layer) => {
    const ops = [];
    for (const key of Object.keys(layer)) ops.push({ op: "set", path: [key], value: layer[key] });
    for (const key of [
      "sans",
      "mono",
      "sizeOffset",
      "sizeOffsetCode",
      "weight",
      "weightCode",
      "weightDialog",
      "uiFollowsDialog",
    ]) {
      if (!Object.prototype.hasOwnProperty.call(layer, key)) ops.push({ op: "unset", path: [key] });
    }
    return ops;
  };
  let restored = false;
  const restoreOriginal = async () => {
    restored = true;
    const result = await mutate(restoreOpsFor(original));
    console.log("\nrestore:", result);
    return result;
  };
  restoreHook = restoreOriginal;

  /**
   * Apply one weight combination (after a reload, so the state is
   * self-consistent). Follow is switched off so each of the three axes stands on
   * its own value; the last steps turn it back on to check what following hands
   * the interface.
   *
   * All three weight axes are OFFSETS on each element's own weight (range
   * −100…+200, 0 = leave it alone). The expected computed values below are
   * therefore `base + offset`: 700 for h1..h3, 600 for h4..h6/strong, 500 for th,
   * 400 for everything else in the conversation, and 400 for the interface and
   * for the code surfaces.
   */
  const step = async (label, weight, weightCode, weightDialog, follows) => {
    const result = await mutate([
      { op: "set", path: ["weight"], value: weight },
      { op: "set", path: ["weightCode"], value: weightCode },
      { op: "set", path: ["weightDialog"], value: weightDialog },
      { op: "set", path: ["uiFollowsDialog"], value: follows },
    ]);
    await send("Page.navigate", { url });
    await sleep(9000);
    const seen = JSON.parse(await measure());
    const split = JSON.parse(await distribution());
    console.log(`\n${label} (interface offset ${weight}, code ${weightCode}, conversation offset ${weightDialog}, follows ${follows})`);
    console.log("  user layer:", result);
    console.log(
      `  interface=${seen.body}/${seen.bodySpan} | code pre=${seen.pre} inline=${seen.inline} tool=${seen.tool} terminal=${seen.terminal} editor=${seen.editor}` +
        ` | conversation p=${seen.conv} strong=${seen.convStrong} h2=${seen.convH2} code=${seen.convCode}`
    );
    console.log(
      `  injected css: ${seen.ourCss} B | probe weights interface ${JSON.stringify(split.probe.byWeight)} markdown ${JSON.stringify(split.probe.markdownByWeight)}`
    );
    console.log(
      `  page weights (${split.page.sampled} text elements) interface ${JSON.stringify(split.page.byWeight)} markdown ${JSON.stringify(split.page.markdownByWeight)}`
    );
    return { ...seen, split };
  };

  const base = await step("baseline", 0, 0, 0, false);
  const bodyOnly = await step("interface only", 160, 0, 0, false);
  const codeOnly = await step("code only", 0, -80, 0, false);
  const both = await step("interface + code", 160, -80, 0, false);
  const conversationOnly = await step("conversation only", 0, 0, 180, false);
  const lighter = await step("lighter conversation", 0, 0, -100, false);
  const following = await step("following the conversation", -60, 0, 180, true);

  // The two-copy trap: the served first-frame stylesheet is only rebuilt on the
  // next index render, so before the browser half started adopting it, a switch
  // that REMOVES a rule (turn following off, reset a weight) kept applying the
  // old value from the served copy until the user reloaded the page.
  console.log("\nwithout a reload: following on -> off");
  await mutate([
    { op: "set", path: ["weight"], value: 0 },
    { op: "set", path: ["weightDialog"], value: 180 },
    { op: "set", path: ["uiFollowsDialog"], value: true },
  ]);
  await send("Page.navigate", { url });
  await sleep(9000);
  const followOn = JSON.parse(await measure());
  const sheetsFollowOn = JSON.parse(await stylesheets());
  await mutate([{ op: "set", path: ["uiFollowsDialog"], value: false }]);
  await sleep(1500);
  const followOff = JSON.parse(await measure());
  const sheetsFollowOff = JSON.parse(await stylesheets());
  console.log(`  interface ${followOn.body} -> ${followOff.body} (no reload)`);
  console.log(`  stylesheets: ${JSON.stringify(sheetsFollowOff)}`);

  console.log("\nchecks");
  const CODE_KEYS = ["pre", "preSpan", "inline", "tool", "terminal", "termSpan", "editor"];
  const CONV_KEYS = ["conv", "convStrong", "convH2"];
  const sameWeights = (left, right, keys) => keys.every((key) => left[key] === right[key]);
  /** The weight one base group must resolve to for a given offset. */
  const at = (baseWeight, offset) => String(Math.min(900, Math.max(100, baseWeight + offset)));
  check(
    "the baseline leaves DSH's own weights alone",
    base.body === base.pre && base.pre === base.inline,
    `${base.body} / ${base.pre} / ${base.inline}`
  );
  check(
    "the probe found the real markdown container",
    typeof base.containerClass === "string" && base.containerClass.startsWith("_markdown_"),
    String(base.containerClass)
  );
  check(
    "a code offset moves every code surface",
    CODE_KEYS.every((key) => codeOnly[key] === at(400, -80)),
    CODE_KEYS.map((key) => `${key}=${codeOnly[key]}`).join(" ")
  );
  check(
    "a code offset leaves body text alone",
    codeOnly.body === base.body && codeOnly.bodySpan === base.bodySpan,
    `${codeOnly.body} / ${codeOnly.bodySpan}`
  );
  check(
    "an interface offset moves the interface, not the conversation",
    bodyOnly.body === at(400, 160) &&
      bodyOnly.bodySpan === at(400, 160) &&
      sameWeights(bodyOnly, base, CONV_KEYS) &&
      bodyOnly.convCode === base.convCode,
    `interface=${bodyOnly.body} conversation=${CONV_KEYS.map((key) => `${key}=${bodyOnly[key]}`).join(" ")}`
  );
  check(
    "an interface offset moves interface elements and nothing inside markdown",
    (bodyOnly.split.page.byWeight[at(400, 160)] ?? 0) > 20 &&
      (bodyOnly.split.probe.byWeight[at(400, 160)] ?? 0) >= 3 &&
      Object.keys(bodyOnly.split.probe.byWeight).length === 1 &&
      JSON.stringify(bodyOnly.split.probe.markdownByWeight) ===
        JSON.stringify(base.split.probe.markdownByWeight) &&
      bodyOnly.split.probe.markdownByWeight[at(400, 160)] === undefined &&
      bodyOnly.split.page.markdownByWeight[at(400, 160)] === undefined,
    `probe interface=${JSON.stringify(bodyOnly.split.probe.byWeight)} probe markdown=${JSON.stringify(bodyOnly.split.probe.markdownByWeight)}` +
      ` page interface@${at(400, 160)}=${bodyOnly.split.page.byWeight[at(400, 160)] ?? 0} page markdown@${at(400, 160)}=${bodyOnly.split.page.markdownByWeight[at(400, 160)] ?? 0}`
  );
  check(
    "a dormant weight leaves both histograms at DSH's own values",
    base.split.page.byWeight[at(400, 160)] === undefined &&
      base.split.probe.byWeight[at(400, 160)] === undefined &&
      (base.split.page.byWeight["400"] ?? 0) > 20,
    `page=${JSON.stringify(base.split.page.byWeight)}`
  );
  check(
    "an interface offset takes code back out when the code axis is unset",
    CODE_KEYS.every((key) => bodyOnly[key] === base[key]),
    CODE_KEYS.map((key) => `${key}=${bodyOnly[key]}`).join(" ")
  );
  check(
    "a conversation offset moves the conversation, not the interface",
    conversationOnly.conv === at(400, 180) &&
      conversationOnly.convStrong === at(600, 180) &&
      conversationOnly.convH2 === at(700, 180) &&
      conversationOnly.body === base.body &&
      conversationOnly.pre === base.pre,
    `conversation=${conversationOnly.conv} interface=${conversationOnly.body}`
  );
  // The regression this verifier exists for: a flat weight on the markdown
  // scope used to erase the heading hierarchy (DSH keeps 700/600/500 inside its
  // `font` shorthands, and an `!important` long-hand beat them). With the
  // ladder, every group keeps its own base plus the offset — in BOTH directions.
  check(
    "the conversation keeps its hierarchy at a positive offset",
    Number(conversationOnly.convH2) > Number(conversationOnly.convStrong) &&
      Number(conversationOnly.convStrong) > Number(conversationOnly.conv) &&
      conversationOnly.convH2 === at(700, 180) &&
      conversationOnly.conv === at(400, 180),
    `h2=${conversationOnly.convH2} strong=${conversationOnly.convStrong} p=${conversationOnly.conv}`
  );
  check(
    "the conversation keeps its hierarchy at a negative offset",
    Number(lighter.convH2) > Number(lighter.convStrong) &&
      Number(lighter.convStrong) > Number(lighter.conv) &&
      lighter.convH2 === at(700, -100) &&
      lighter.convStrong === at(600, -100) &&
      lighter.conv === at(400, -100),
    `h2=${lighter.convH2} strong=${lighter.convStrong} p=${lighter.conv}`
  );
  check(
    "an offset never leaves the legal weight range",
    [lighter, conversationOnly, following].every((seen) =>
      [seen.conv, seen.convStrong, seen.convH2, seen.body].every(
        (value) => Number(value) >= 100 && Number(value) <= 900
      )
    ),
    `lighter=${lighter.convH2} conversation=${conversationOnly.convH2} following=${following.convH2}`
  );
  check(
    "both axes at once: interface 560, code 320",
    both.body === at(400, 160) &&
      both.bodySpan === at(400, 160) &&
      CODE_KEYS.every((key) => both[key] === at(400, -80)) &&
      sameWeights(both, base, CONV_KEYS),
    `interface=${both.body} ` + CODE_KEYS.map((key) => `${key}=${both[key]}`).join(" ")
  );
  check(
    "following hands the conversation's offset to the interface",
    following.body === at(400, 180) && following.conv === at(400, 180),
    `interface=${following.body} conversation=${following.conv}`
  );
  check(
    "following keeps the conversation itself on its own offset",
    sameWeights(following, conversationOnly, CONV_KEYS),
    CONV_KEYS.map((key) => `${key}=${following[key]}`).join(" ")
  );
  check(
    "the served index carries the stamped first-frame stylesheet",
    sheetsFollowOn.inServedIndex === true,
    JSON.stringify(sheetsFollowOn)
  );
  check(
    "the browser half adopts it instead of appending a copy",
    sheetsFollowOn.count === 1 && sheetsFollowOff.count === 1,
    `on=${sheetsFollowOn.count} off=${sheetsFollowOff.count}`
  );
  check(
    "turning following off drops the followed offset without a reload",
    followOn.body === at(400, 180) && followOff.body === base.body && followOff.pre === base.pre,
    `interface ${followOn.body} -> ${followOff.body} (baseline ${base.body})`
  );

  await restoreOriginal();
  await sleep(600);
  const after = JSON.parse(await readNamespace());
  console.log("user layer after restore:", JSON.stringify(after.user));
  check(
    "the user layer is back to its original shape",
    JSON.stringify(after.user) === JSON.stringify(original),
    `${JSON.stringify(after.user)} vs ${JSON.stringify(original)}`
  );
  // The restore landed, so the parked copy is stale: a later `--restore` must
  // never put an old layer back over newer user edits.
  try {
    rmSync(BACKUP, { force: true });
  } catch {}

  console.log("\n== console ==");
  for (const line of consoleLines) console.log("  " + line);
  check("no console errors", consoleLines.length === 0, consoleLines.join(" | "));

  console.log(`\n${failures === 0 ? "WEIGHT OK" : failures + " check(s) failed"}`);
  ws.close();
  child.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(failures === 0 ? 0 : 1);
};

main().catch(async (error) => {
  console.error("verify failed:", error);
  if (restoreHook !== null && !restored) {
    try {
      await restoreHook();
      console.log("the original user layer was put back after the failure");
    } catch (restoreError) {
      console.error("restore also failed:", restoreError.message);
    }
  }
  child.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
