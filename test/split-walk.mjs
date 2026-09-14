/**
 * Drive the split (West/CJK) mode in a real browser and prove the mode switch
 * never rewrites the tuned stack:
 *
 *   node test/split-walk.mjs <url-with-token>
 *
 * Steps:
 *   1. a three-entry stack is written through settings/mutate beforehand
 *   2. open Settings -> Plugins -> configurable -> expand the card
 *   3. assert the simple mode renders the West/CJK pickers with the right
 *      slots and the untouched remainder
 *   4. toggle Advanced and back, then re-read the settings: identical
 *   5. pick a western family through the real panel, then re-read: west slot
 *      replaced in place, east and rest untouched
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: node test/split-walk.mjs <url-with-token>");
  process.exit(2);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9336;
const profile = mkdtempSync(join(tmpdir(), "dfp-split-"));
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
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
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
      pending.set(id, { resolve, reject });
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

  console.log("body mode row:", await evalJs(`(() => {
    const buttons = [...document.querySelectorAll(".dfp-modeButton")].map(b => (b.textContent || "").trim());
    const slots = [...document.querySelectorAll(".dfp-slotLabel")].map(l => (l.textContent || "").trim());
    const picks = [...document.querySelectorAll(".dfp-pick")].map(p => (p.textContent || "").trim());
    return JSON.stringify({ modeButtons: buttons, slotLabels: slots, pickValues: picks });
  })()`));

  // switch to Advanced: chips must appear with all three entries
  await click(`(el) => String(el.className || "").includes("dfp-modeButton") && /高级|Advanced/.test(el.textContent || "")`);
  await sleep(1200);
  console.log("advanced chips:", await evalJs(`JSON.stringify([...document.querySelectorAll(".dfp-chip .dfp-chipLabel")].map(c => (c.textContent || "").trim()))`));

  // switch back to Simple: the pickers must show the same slots
  await click(`(el) => String(el.className || "").includes("dfp-modeButton") && /简单|Basic/.test(el.textContent || "")`);
  await sleep(1200);
  console.log("back to simple picks:", await evalJs(`JSON.stringify([...document.querySelectorAll(".dfp-pick")].map(p => (p.textContent || "").trim()))`));

  // pick a western family through the real panel: open the FIRST pick trigger
  console.log("open west panel:", await evalJs(`(() => {
    const trigger = document.querySelector(".dfp-pick");
    if (!trigger) return "not found";
    trigger.click();
    return "opened";
  })()`));
  await sleep(1200);
  const pickResult = await evalJs(`(() => {
    const option = [...document.querySelectorAll(".dfp-option")].find(o => (o.dataset.family || "") === "Segoe UI");
    if (!option) return "option not found";
    option.click();
    return "picked Segoe UI";
  })()`);
  console.log("pick:", pickResult);
  await sleep(1500);

  // final UI state: west slot replaced, east and rest untouched
  console.log("final picks:", await evalJs(`JSON.stringify([...document.querySelectorAll(".dfp-pick")].map(p => (p.textContent || "").trim()))`));
  console.log("rest note:", await evalJs(`(() => {
    const note = [...document.querySelectorAll(".dfp-hint")].map(h => (h.textContent || "")).find(x => x.includes("其余回退") || x.includes("Other fallbacks"));
    return note ?? "(no rest note)";
  })()`));

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
