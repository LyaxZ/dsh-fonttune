/**
 * Focused UI walk: Settings -> 插件 section -> 插件配置 tab -> card dump.
 *   node test/ui-walk.mjs <url-with-token>
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: node test/ui-walk.mjs <url-with-token>");
  process.exit(2);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9334;
const profile = mkdtempSync(join(tmpdir(), "dfp-walk-"));
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
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type !== "log") {
      consoleLines.push(`[console.${msg.params.type}] ${(msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(" ")}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
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

  // open settings
  console.log("open settings:", await evalJs(`(() => {
    const trigger = [...document.querySelectorAll("button,[role=button]")].find(el => /设置|Settings/.test(el.getAttribute("aria-label") || el.textContent || ""));
    if (!trigger) return "no trigger";
    trigger.click();
    return "clicked";
  })()`));
  await sleep(1800);

  // settings sections in the left nav
  console.log("sections:", await evalJs(`JSON.stringify([...document.querySelectorAll("button,[role=button],[role=tab]")].map(b => (b.textContent||"").trim()).filter(t => t && t.length < 24))`));

  // click the 插件 section
  console.log("click 插件 section:", await evalJs(`(() => {
    const btn = [...document.querySelectorAll("button,[role=button],[role=tab]")].find(b => (b.textContent||"").trim() === "插件" || (b.textContent||"").trim() === "Plugins");
    if (!btn) return "not found";
    btn.click();
    return "clicked";
  })()`));
  await sleep(1800);

  console.log("tabs now:", await evalJs(`JSON.stringify([...document.querySelectorAll('[role="tab"],button')].map(b => (b.textContent||"").trim()).filter(t => /插件|配置|清单|Plugin/.test(t)).slice(0, 12))`));

  console.log("click 插件配置 tab:", await evalJs(`(() => {
    const tab = [...document.querySelectorAll('[role="tab"],button')].find(b => /插件配置|Plugin configuration/.test(b.textContent||""));
    if (!tab) return "not found";
    tab.click();
    return "clicked";
  })()`));
  await sleep(1800);

  console.log("card check:", await evalJs(`(() => {
    const hit = document.body.innerText.includes("字体增强") || document.body.innerText.includes("Font tune");
    const cards = [...document.querySelectorAll("li")].map(li => (li.querySelector("button")?.textContent || "").slice(0, 60)).filter(t => t.trim()).slice(0, 14);
    return JSON.stringify({ fontCardVisible: hit, cardTexts: cards });
  })()`));

  // expand our card and verify the body controls render
  console.log("expand card:", await evalJs(`(() => {
    const header = [...document.querySelectorAll("button")].find(b => (b.textContent||"").includes("字体增强") || (b.textContent||"").includes("Font tune"));
    if (!header) return "header not found";
    header.click();
    return "clicked";
  })()`));
  await sleep(1600);
  console.log("expanded body check:", await evalJs(`(() => {
    const text = document.body.innerText;
    const has = (needle) => text.includes(needle);
    return JSON.stringify({
      sansRow: has("正文字体") || has("Body font"),
      monoRow: has("代码字体") || has("Code font"),
      bodySizeRow: has("正文字号偏移") || has("Body font size offset"),
      bodyWeightRow: has("正文字重") || has("Body font weight"),
      codeSizeRow: has("代码字号偏移") || has("Code font size offset"),
      codeWeightRow: has("代码字重") || has("Code font weight"),
      preview: has("预览") || has("Preview"),
      sliders: document.querySelectorAll('input[type="range"]').length,
      sliderLabels: [...document.querySelectorAll('input[type="range"]')].map((el) => el.getAttribute("aria-label")),
      chips: document.querySelectorAll(".dfp-chip").length,
      resetAll: has("全部重置") || has("Reset all")
    });
  })()`));

  // the segmented control must stay one joined pill (shared border, divider
  // between the options) while the selected option carries a real surface
  console.log("mode toggle styling:", await evalJs(`(() => {
    const buttons = [...document.querySelectorAll(".dfp-modeButton")];
    if (buttons.length < 2) return "mode buttons not found";
    const read = (b) => {
      const s = getComputedStyle(b);
      return { text: (b.textContent || "").trim(), color: s.color, background: s.backgroundColor, dividerLeft: s.borderLeftWidth + " " + s.borderLeftColor, height: s.height };
    };
    const seg = buttons[0].parentElement;
    const segStyle = getComputedStyle(seg);
    const on = buttons.find((b) => b.className.includes("Active"));
    const off = buttons.find((b) => !b.className.includes("Active"));
    return JSON.stringify({
      container: { display: segStyle.display, border: segStyle.borderTopWidth + " " + segStyle.borderTopColor, radius: segStyle.borderTopLeftRadius, overflow: segStyle.overflow, background: segStyle.backgroundColor },
      selected: on ? read(on) : null,
      unselected: off ? read(off) : null,
    });
  })()`));

  // The expand chevron must be the host PluginCard's own 14×14 SVG icon — the
  // same path the other cards on this very page render — not a text glyph
  // (text glyphs are thinner and rotate around the text box, not their own
  // centre). SVG className is an SVGAnimatedString, so match by attribute.
  console.log("chevron check:", await evalJs(`(() => {
    const ours = document.querySelector('svg[class*="dfp-chevron"]');
    if (!ours) return "our chevron not found";
    const oursPath = ours.querySelector("path")?.getAttribute("d") ?? null;
    const rect = ours.getBoundingClientRect();
    // Host-rendered plugin cards: the chevron is a <path> inside an <svg> that
    // is not ours. Compare path data byte for byte.
    const hosts = [...document.querySelectorAll("svg path")]
      .filter((p) => p.closest('[class*="dfp"]') === null)
      .map((p) => p.getAttribute("d"))
      .filter((d) => d && d.startsWith("M11.8486"));
    const matching = hosts.filter((d) => d === oursPath).length;
    return JSON.stringify({
      isSvg: ours.tagName === "svg",
      size: rect.width + "x" + rect.height,
      pathLength: (oursPath || "").length,
      hostChevronsOnPage: hosts.length,
      byteIdenticalToHost: oursPath !== null && matching > 0,
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
  console.error("walk failed:", error);
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
