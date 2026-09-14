/**
 * Verify the applied stylesheet reaches the real document with a real config.
 *
 *   node test/style-verify.mjs <url-with-token>
 *
 * Assumes the smoke instance already has dsh-fonttune configured (sans/mono/
 * sizeOffset/weight written through settings/mutate). Measures:
 *   1. body's computed --dsw-font-family / --ds-font-family-code variables
 *   2. body's computed font-family and font-weight
 *   3. a sidebar text element's computed font-family (inheritance chain)
 *   4. the scaled --dsh-content-font-size
 * and reports console errors.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: node test/style-verify.mjs <url-with-token>");
  process.exit(2);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9335;
const profile = mkdtempSync(join(tmpdir(), "dfp-style-"));
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

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleep(9000);

  const report = await evalJs(`(() => {
    const body = getComputedStyle(document.body);
    const pick = (name) => body.getPropertyValue(name).trim();
    // a real text element somewhere in the app shell (not our card)
    const probe = [...document.querySelectorAll("div,span,p")]
      .find(el => el.textContent?.trim().length > 3 && el.children.length === 0 && el.closest('[data-plugin-css]') === null);
    const ourTag = document.querySelector('style[data-plugin-css="dsh-fonttune"]');
    return JSON.stringify({
      varSans: pick("--dsw-font-family"),
      varCode: pick("--ds-font-family-code"),
      bodyFamily: body.fontFamily,
      bodyWeight: body.fontWeight,
      contentSize: pick("--dsh-content-font-size"),
      sampleTag: probe ? probe.tagName + "." + (probe.className || "") : null,
      sampleFamily: probe ? getComputedStyle(probe).fontFamily : null,
      ourCss: ourTag ? ourTag.textContent.length : -1,
      fullCss: ourTag ? ourTag.textContent : null,
      firstRule: ourTag ? ourTag.textContent.split("\\n")[0].slice(0, 120) : null,
      sizeLines: ourTag ? (ourTag.textContent.match(/^.*--dsh-content-font-size.*$/gm) ?? []).slice(0, 4) : [],
      s14Lines: ourTag ? (ourTag.textContent.match(/^.*--dsw-font-s-14-font-size.*$/gm) ?? []).slice(0, 2) : [],
      bodyInline: (document.body.getAttribute("style") || "").slice(0, 300),
      bodyInlineSize: (document.body.style.getPropertyValue("--dsh-content-font-size") || "") +
        (document.body.style.getPropertyPriority("--dsh-content-font-size") ? " !important" : "")
    });
  })()`);
  console.log("style report:", report);

  // Two refresh cycles later the value must be IDENTICAL — this is the
  // regression check for the compounding bug the field hit.
  await sleep(9500);
  console.log("after 2 refresh cycles:", await evalJs(`(() => {
    const body = getComputedStyle(document.body);
    const ourTag = document.querySelector('style[data-plugin-css="dsh-fonttune"]');
    const text = ourTag ? ourTag.textContent : "";
    return JSON.stringify({
      contentSize: body.getPropertyValue("--dsh-content-font-size").trim(),
      nestedCalc: text.split("calc((").length - 1,
      varRefs: text.split("var(").length - 1
    });
  })()`));

  console.log("== console ==");
  for (const line of consoleLines) console.log("  " + line);

  ws.close();
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
};

main().catch((error) => {
  console.error("verify failed:", error);
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
