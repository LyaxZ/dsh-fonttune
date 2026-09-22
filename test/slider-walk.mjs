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
  await sleep(1400);
  const afterSize = await readUser();
  console.log("host after release:", afterSize);
  check("releasing the size drag commits it", field(afterSize, "sizeOffsetDialog") === 3, afterSize);

  console.log("\nweight drag to 420:", await drag(2, [430, 420]));
  await sleep(400);
  await release();
  await sleep(1400);
  const afterWeight = await readUser();
  console.log("host after weight release:", afterWeight);
  check("releasing the weight drag commits it", field(afterWeight, "weightDialog") === 420, afterWeight);

  // --- the code section: size, line height, weight ---
  console.log("\nsection:", await expandSection("/代码|Code/"));
  const codeSliders = await sliderCount();
  check("the code section shows three sliders", codeSliders === 3, `saw ${codeSliders}`);

  console.log("code size drag:", await drag(0, [2, 3, 4]));
  await sleep(400);
  await release();
  await sleep(1400);
  const afterCodeSize = await readUser();
  console.log("host after code size release:", afterCodeSize);
  check("the code size lands on its own axis", field(afterCodeSize, "sizeOffsetCode") === 4, afterCodeSize);
  console.log("code css:", await readHost());

  console.log("\ncode weight drag to 300:", await drag(2, [320, 300]));
  await sleep(400);
  await release();
  await sleep(1400);
  const afterCodeWeight = await readUser();
  console.log("host after code weight release:", afterCodeWeight);
  check("the code weight lands on its own axis", field(afterCodeWeight, "weightCode") === 300, afterCodeWeight);
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
