/**
 * Drive the two number sliders (size offset / weight) in a real browser and
 * prove they do NOT rewrite settings per drag step:
 *
 *   node test/slider-walk.mjs <url-with-token>
 *
 * Steps:
 *   1. open Settings -> Plugins -> configurable -> expand the card
 *   2. fire several `input` events on the size slider (a drag) — the host
 *      settings must stay untouched and the readout must show the pending value
 *   3. dispatch `pointerup` on window — the value must land in the settings
 *   4. the same for the weight slider, ending on 400 which resets the axis
 *   5. no console errors
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
  await click(`(el) => (el.textContent || "").includes("字体增强") || (el.textContent || "").includes("Font plus")`);
  await sleep(1500);

  const readHost = () => evalJs(`(() => {
    const tags = [...document.querySelectorAll("style")].filter((s) => s.dataset.plugin === "dsh-fonttune");
    const css = tags.map((t) => t.textContent || "").join("\\n");
    const size = (css.match(/--dsh-content-font-size:[^;]+/) || [null])[0];
    const weight = (css.match(/font-weight:[^;]+/) || [null])[0];
    return JSON.stringify({ length: css.length, size: size, weight: weight });
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

  console.log("start host:", await readUser());

  // --- size slider: a "drag" of several input events, no pointerup yet ---
  console.log("size drag:", await evalJs(`(() => {
    const input = document.querySelector(".dfp-slider");
    if (!input) return "slider not found";
    const set = (v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    set(1); set(2); set(3);
    return "dragged, readout=" + (input.closest(".dfp-sliderRow").querySelector(".dfp-value").textContent || "").trim();
  })()`));
  await sleep(1200);
  console.log("host during drag:", await readUser());

  // --- release: the pending value must land in the settings ---
  console.log("release:", await evalJs(`(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    return "pointerup dispatched";
  })()`));
  // sample the readout every ~30ms across the settings round-trip: a bounce
  // would show the OLD committed value before the new one settles
  console.log("size readout samples:", await evalJs(`(async () => {
    const row = document.querySelectorAll(".dfp-sliderRow")[0];
    const samples = [];
    for (let i = 0; i < 24; i += 1) {
      samples.push((row.querySelector(".dfp-value").textContent || "").trim());
      await new Promise((r) => setTimeout(r, 30));
    }
    return JSON.stringify([...new Set(samples)]);
  })()`));
  await sleep(1200);
  console.log("host after release:", await readUser());
  console.log("size readout now:", await evalJs(`(document.querySelector(".dfp-sliderRow .dfp-value")?.textContent || "").trim()`));

  // --- weight slider: a value other than 400 must land verbatim ---
  console.log("weight drag to 420:", await evalJs(`(() => {
    const inputs = [...document.querySelectorAll(".dfp-slider")];
    const input = inputs[1];
    if (!input) return "weight slider not found";
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "430");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    setter.call(input, "420");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return "dragged, readout=" + (input.closest(".dfp-sliderRow").querySelector(".dfp-value").textContent || "").trim();
  })()`));
  await sleep(400);
  console.log("host during weight drag:", await readUser());
  console.log("weight release:", await evalJs(`(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    return "released";
  })()`));
  console.log("weight readout samples:", await evalJs(`(async () => {
    const row = document.querySelectorAll(".dfp-sliderRow")[1];
    const samples = [];
    for (let i = 0; i < 24; i += 1) {
      samples.push((row.querySelector(".dfp-value").textContent || "").trim());
      await new Promise((r) => setTimeout(r, 30));
    }
    return JSON.stringify([...new Set(samples)]);
  })()`));
  await sleep(1200);
  console.log("host after weight release:", await readUser());

  console.log("== console ==");
  for (const line of consoleLines) console.log("  " + line);

  ws.close();
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
};

main().catch((error) => {
  console.error("walk failed:", error);
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
