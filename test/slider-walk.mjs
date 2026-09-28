/**
 * Drive the card's number sliders inside the REAL settings sheet and prove
 * they do not write the settings document per drag step, but do write once on
 * release.
 *
 *   node test/slider-walk.mjs <url-with-token>
 *
 * The card is three collapsed accordion sections (conversation, interface,
 * code) and at most one is open, so each step expands the section it needs and
 * then drags the sliders that section owns — in order: size, line height,
 * weight. The interface section has no sliders (its size and line-height axes
 * are retired), so the four live sliders are the conversation's size and
 * weight and the code section's size and weight.
 *
 * Steps:
 *   1. open Settings -> Plugins -> configurable and expand the card
 *   2. expand the conversation section: exactly three sliders
 *   3. fire several `input` events on a slider (a drag) — the host settings
 *      must stay untouched and the readout must show the pending value
 *   4. dispatch `pointerup` on window — the value must land in the settings
 *   5. the same for the code section's size and weight
 *   6. the namespace's original user layer is restored, so a walk never leaves
 *      the machine's own preferences changed
 *   7. no console errors
 *
 * Every expectation is a CHECK: a walk that cannot find a control fails
 * instead of printing "not found" and exiting zero.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: node test/slider-walk.mjs <url-with-token>");
  process.exit(2);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9337;
const profile = mkdtempSync(join(tmpdir(), "dfp-slider-"));
const child = execFile(EDGE, [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1400,1000", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  let target = null;
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page" && t.url?.startsWith("about:blank"));
      if (page) { target = page; break; }
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
      const d = msg.params.exceptionDetails;
      consoleLines.push(`[exception] ${d.text} ${d.exception?.description ?? ""}`);
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
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      return `THREW: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ""}`;
    }
    return result.result.value;
  };
  const click = async (predicateJs) =>
    evalJs(`(() => {
      const match = ${predicateJs};
      const el = [...document.querySelectorAll("button")].find(match);
      if (!el) return "not found";
      el.click();
      return "clicked: " + (el.textContent || "").trim().slice(0, 30);
    })()`);

  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : "  — " + detail}`);
    if (!ok) failures += 1;
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleep(9000);

  await click(`(el) => /设置|Settings/.test(el.getAttribute("aria-label") || el.textContent || "")`);
  await sleep(1800);
  await click(`(el) => (el.textContent || "").trim() === "插件" || (el.textContent || "").trim() === "Plugins"`);
  await sleep(1800);
  await click(`(el) => /插件配置|Plugin configuration/.test(el.textContent || "")`);
  await sleep(1600);
  await click(`(el) => (el.textContent || "").includes("字体增强") || (el.textContent || "").includes("Font tune")`);
  await sleep(1500);

  const readHost = () => evalJs(`(() => {
    const tags = [...document.querySelectorAll("style")].filter((s) => s.dataset.plugin === "dsh-fonttune");
    const css = tags.map((t) => t.textContent || "").join("\\n");
    const size = (css.match(/--dsh-content-font-size:[^;]+/) || [null])[0];
    const code = (css.match(/--dsw-font-markdown-code-block:[^;]+/) || [null])[0];
    const weight = (css.match(/font-weight:[^;]+/) || [null])[0];
    return JSON.stringify({ length: css.length, size: size, code: code, weight: weight });
  })()`);

  const readUser = () => evalJs(`(async () => {
    const res = await fetch("/api/settings/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: "d" + Math.random(), method: "settings/describe", payload: { args: {} } }),
    });
    const body = await res.json();
    const list = (body.result?.value?.namespaces) || [];
    const mine = list.find((s) => s.ns === "dsh-fonttune");
    return JSON.stringify(mine ? mine.user : "section not found");
  })()`);

  /** Put the namespace's user layer back exactly as it was found. */
  const restoreUser = (original) => evalJs(`(async () => {
    const ops = [];
    const original = ${JSON.stringify(original)};
    for (const key of Object.keys(original)) ops.push({ op: "set", path: [key], value: original[key] });
    for (const key of ["sans", "stackDialog", "mono", "sizeOffset", "sizeOffsetDialog", "sizeOffsetCode", "weight", "weightDialog", "weightCode"]) {
      if (!Object.prototype.hasOwnProperty.call(original, key)) ops.push({ op: "unset", path: [key] });
    }
    const res = await fetch("/api/settings/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: "r" + Math.random(), method: "settings/mutate", payload: { args: { ns: "dsh-fonttune", ops: ops } } }),
    });
    const body = await res.json();
    const value = body.result && body.result.value;
    return JSON.stringify(value ? value.user : body);
  })()`);

  const startUser = await readUser();
  console.log("start host:", startUser);
  const originalUser = JSON.parse(startUser);
  if (typeof originalUser !== "object" || originalUser === null) {
    throw new Error("the settings namespace did not answer: " + startUser);
  }
  const field = (json, name) => {
    try {
      return JSON.parse(json)[name];
    } catch {
      return undefined;
    }
  };
  /**
   * Wait for one field to actually land in the settings document.
   *
   * The release commits through the settings RPC, and the document write is
   * debounced on the host side — on a loaded machine (this sandbox runs the
   * whole browser-verify chain back to back) it can take longer than any fixed
   * sleep, which is what made this walk flap. The contract under test is "the
   * release commits", not "it commits within one second", so the wait polls.
   * @param {string} name - the settings field.
   * @param {unknown} value - the value it must reach.
   * @param {number} [timeoutMs] - how long to keep polling.
   * @returns {Promise<{landed: boolean, seen: unknown, waitedMs: number}>}
   */
  const waitForField = async (name, value, timeoutMs = 9000) => {
    const started = Date.now();
    let seen = field(await readUser(), name);
    while (seen !== value && Date.now() - started < timeoutMs) {
      await sleep(250);
      seen = field(await readUser(), name);
    }
    return { landed: seen === value, seen, waitedMs: Date.now() - started };
  };
  /**
   * Wait for one field to become a DIFFERENT value, and return it.
   *
   * The weight controls count font steps while the document stores weight offsets
   * (and a document written before the axes were relative stores an absolute
   * weight, migrated on read), so "one step landed" cannot be checked against a
   * fixed number — only against "the value moved, and it moved by one step".
   * @param {string} name - field name.
   * @param {unknown} previous - the value to move away from.
   * @param {number} [timeoutMs] - how long to poll for.
   * @returns {Promise<{landed: boolean, seen: unknown, waitedMs: number}>}
   */
  const waitForChange = async (name, previous, timeoutMs = 9000) => {
    const started = Date.now();
    let seen = field(await readUser(), name);
    while (seen === previous && Date.now() - started < timeoutMs) {
      await sleep(250);
      seen = field(await readUser(), name);
    }
    return { landed: seen !== previous, seen: seen, waitedMs: Date.now() - started };
  };

  /** Expand one accordion section by its title. */
  const expandSection = async (pattern) => {
    const result = await click(
      `(el) => String(el.className || "").includes("dfp-sectionHead") && ${pattern}.test(el.textContent || "")`
    );
    await sleep(900);
    return result;
  };
  const sliderCount = async () =>
    Number(await evalJs(`document.querySelectorAll(".dfp-slider").length`));
  /** Drag one slider: several input events, no release yet. */
  const drag = (index, values) => evalJs(`(() => {
    const input = [...document.querySelectorAll(".dfp-slider")][${index}];
    if (!input) return "slider ${index} not found";
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    for (const value of ${JSON.stringify(values)}) {
      setter.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const row = input.closest(".dfp-sliderRow");
    return "dragged, readout=" + (row ? (row.querySelector(".dfp-value").textContent || "").trim() : "?");
  })()`);
  const release = () =>
    evalJs(`(() => { window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); return "released"; })()`);
  /** The value a slider shows while it is being dragged, sampled over time. */
  const readouts = (index) => evalJs(`(async () => {
    const row = document.querySelectorAll(".dfp-sliderRow")[${index}];
    const samples = [];
    for (let i = 0; i < 24; i += 1) {
      samples.push((row.querySelector(".dfp-value").textContent || "").trim());
      await new Promise((r) => setTimeout(r, 30));
    }
    return JSON.stringify([...new Set(samples)]);
  })()`);

  // --- the conversation section: size, line height, weight ---
  console.log("\nsection:", await expandSection("/对话|Conversation/"));
  const dialogSliders = await sliderCount();
  check("the conversation section shows three sliders", dialogSliders === 3, `saw ${dialogSliders}`);

  console.log("size drag:", await drag(0, [1, 2, 3]));
  await sleep(1200);
  const duringSize = await readUser();
  console.log("host during drag:", duringSize);
  check(
    "a drag writes nothing to the settings document",
    field(duringSize, "sizeOffsetDialog") === originalUser.sizeOffsetDialog,
    `${field(duringSize, "sizeOffsetDialog")} vs ${originalUser.sizeOffsetDialog}`
  );
  await release();
  console.log("size readout samples:", await readouts(0));
  const sizeLanded = await waitForField("sizeOffsetDialog", 3);
  const afterSize = await readUser();
  console.log("host after release:", afterSize, `(landed in ${sizeLanded.waitedMs} ms)`);
  check("releasing the size drag commits it", sizeLanded.landed, `saw ${sizeLanded.seen}`);

  // The weight sliders are counted in FONT STEPS now ("-2 -1 0 +1 +2 +3 +4"), not
  // in weight units: how many positions they have is a property of the family,
  // measured on the page. The document still stores a weight offset — and a
  // document written before the axes were relative stores an ABSOLUTE weight that
  // is migrated on read — so the walk never compares the raw document against a
  // step count: it moves by steps and checks that the offsets follow them.
  const shape = JSON.parse(
    await evalJs(`(() => {
      const input = [...document.querySelectorAll(".dfp-slider")][2];
      if (!input) return "null";
      return JSON.stringify({
        min: Number(input.min),
        max: Number(input.max),
        step: Number(input.step),
        value: Number(input.value),
      });
    })()`)
  );
  console.log("weight slider shape:", shape);
  check(
    "the weight slider counts font steps, not weight units",
    shape.step === 1 && shape.min < 0 && shape.max > 0 && Math.abs(shape.max) <= 12 && Math.abs(shape.min) <= 12,
    JSON.stringify(shape)
  );
  const raw0 = field(await readUser(), "weightDialog");
  const up = shape.value + 1 <= shape.max;
  const c1 = up ? shape.value + 1 : shape.value - 1;
  console.log(`weight drag to step ${c1} (from ${shape.value}):`, await drag(2, [c1]));
  await sleep(400);
  await release();
  const first = await waitForChange("weightDialog", raw0);
  console.log("host after weight release:", await readUser(), `(changed in ${first.waitedMs} ms)`);
  check("releasing a one-step weight drag commits it", first.landed, `saw ${first.seen}, was ${raw0}`);
  const unit = typeof first.seen === "number" && c1 !== 0 ? first.seen / c1 : 0;
  check(
    "one slider step is one step of the family, written as a weight offset",
    Number.isFinite(unit) && unit > 0 && unit <= 300,
    `step ${c1} wrote ${first.seen} → ${unit} per step`
  );
  const c2 = up && c1 + 1 <= shape.max ? c1 + 1 : c1 - 1;
  console.log(`weight drag to step ${c2}:`, await drag(2, [c2]));
  await sleep(400);
  await release();
  const second = await waitForChange("weightDialog", first.seen);
  check(
    "two steps write exactly twice one step",
    second.landed && Math.abs(second.seen - c2 * unit) < 0.001,
    `saw ${second.seen} for ${c2} steps at ${unit} each`
  );

  // The notch must be the granularity the family can actually render: one notch
  // has to change the rendering. Measured here with the same canvas probe the
  // card uses, so a broken measurement (which silently degrades to no steps)
  // shows up as a failure instead of a slider that feels dead.
  const notch = await evalJs(`(() => {
    const sample = document.querySelector('[class*="_markdown_" i]') || document.body;
    const family = getComputedStyle(sample).fontFamily;
    const unit = ${typeof unit === "number" ? unit : 0};
    const canvas = document.createElement("canvas");
    canvas.width = 260;
    canvas.height = 56;
    const context = canvas.getContext("2d");
    const ink = (weight) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = weight + " 32px " + family;
      context.textBaseline = "top";
      context.fillStyle = "#000";
      context.fillText("\\u5bf9\\u8bdd Aa 0189", 2, 6);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let index = 3; index < data.length; index += 4) count += data[index];
      return count;
    };
    return JSON.stringify({ unit: unit, family: family, normal: ink(400), bolder: ink(400 + unit) });
  })()`);
  console.log("one notch:", notch);
  let notchOk = false;
  try {
    const parsed = JSON.parse(notch);
    notchOk = parsed.unit !== 0 && parsed.normal !== parsed.bolder;
  } catch (error) {
    notchOk = false;
  }
  check("one notch of the weight slider changes the rendering", notchOk, String(notch).slice(0, 140));

  // Two drags in a row, with the first write still in flight: the second value
  // must reach the document. A confirmation for the first one used to drop the
  // value being dragged (the thumb snapped back), and the release guard used to
  // swallow the second release entirely — so on a slow host that adjustment was
  // silently lost. The document write is debounced, which is exactly the window
  // this exercises. The second drag goes to the far end, so the value it must land
  // is known exactly: the far step count times the measured unit.
  const far = up ? shape.max : shape.min;
  console.log("\nback-to-back drags:", await drag(2, [0]));
  await sleep(150);
  await release();
  console.log(`second drag to step ${far} before the first confirmed:`, await drag(2, [far]));
  await sleep(150);
  await release();
  const backToBack = await waitForField("weightDialog", far * unit);
  check(
    "a second drag lands even while the first write is unconfirmed",
    backToBack.landed,
    `saw ${backToBack.seen} after ${backToBack.waitedMs} ms (${far} steps × ${unit})`
  );

  // --- the code section: size, line height, weight ---
  console.log("\nsection:", await expandSection("/代码|Code/"));
  const codeSliders = await sliderCount();
  check("the code section shows three sliders", codeSliders === 3, `saw ${codeSliders}`);

  console.log("code size drag:", await drag(0, [2, 3, 4]));
  await sleep(400);
  await release();
  const codeSizeLanded = await waitForField("sizeOffsetCode", 4);
  const afterCodeSize = await readUser();
  console.log("host after code size release:", afterCodeSize, `(landed in ${codeSizeLanded.waitedMs} ms)`);
  check("the code size lands on its own axis", codeSizeLanded.landed, `saw ${codeSizeLanded.seen}`);
  console.log("code css:", await readHost());

  // The code weight is a step count as well ("bolder / lighter by n of the code
  // font's steps"), so the drag targets a count and the offset that lands is that
  // count times the code family's own unit.
  const codeRaw = field(await readUser(), "weightCode");
  console.log("\ncode weight drag to step -1:", await drag(2, [0, -1]));
  await sleep(400);
  await release();
  const codeWeight = await waitForChange("weightCode", codeRaw);
  const afterCodeWeight = await readUser();
  console.log("host after code weight release:", afterCodeWeight, `(changed in ${codeWeight.waitedMs} ms)`);
  check(
    "the code offset lands on its own axis",
    codeWeight.landed && typeof codeWeight.seen === "number" && codeWeight.seen < 0,
    `saw ${codeWeight.seen} (was ${codeRaw})`
  );
  console.log("weight css:", await readHost());

  // --- leave the machine as it was found ---
  console.log("\nrestore:", await restoreUser(originalUser));
  await sleep(900);
  const restored = await readUser();
  console.log("host after restore:", restored);
  check(
    "the user layer is back to its original shape",
    restored === JSON.stringify(originalUser),
    `${restored} vs ${JSON.stringify(originalUser)}`
  );

  console.log("\n== console ==");
  for (const line of consoleLines) console.log("  " + line);
  check("no console errors", consoleLines.length === 0, consoleLines.join(" | "));

  console.log(`\n${failures === 0 ? "SLIDER OK" : failures + " check(s) failed"}`);
  ws.close();
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((error) => {
  console.error("walk failed:", error);
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
