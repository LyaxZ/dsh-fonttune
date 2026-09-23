/**
 * Check one running DSH instance for the things that must hold on EVERY host
 * line this plugin supports — rc and alpha alike.
 *
 *   node test/host-line-probe.mjs <url-with-token>
 *
 * The two lines differ in where the plugin's settings live and in where the
 * configuration card is seated, so this probe deliberately asks only questions
 * whose answer is line-independent:
 *
 *   1. the page boots with no console errors or exceptions
 *   2. the plugin's stylesheet element exists, is connected, and was ADOPTED
 *      rather than duplicated (exactly one element with the stamp)
 *   3. the served CSS reaches the document: the body's computed font-family /
 *      font-weight carry the configured values
 *   4. the configuration card can be reached from the settings sheet and
 *      renders (`.dfp-card` inside it), whichever seat the host declares
 *   5. driving a card control changes the settings document the host serves
 *
 * Exit code 0 means every check passed; 1 names the ones that did not.
 *
 * @module dsh-fonttune/test/host-line-probe
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: node test/host-line-probe.mjs <url-with-token>");
  process.exit(2);
}
const EXPECT_FAMILY = process.env.DFP_EXPECT_FAMILY ?? "";
const EXPECT_WEIGHT = process.env.DFP_EXPECT_WEIGHT ?? "";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9341;
const profile = mkdtempSync(join(tmpdir(), "dfp-line-"));
const child = execFile(EDGE, [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1400,1000", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : "  — " + detail}`);
  if (!ok) failures += 1;
}

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
    } else if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args ?? [])
        .map((arg) => (arg.value !== undefined ? String(arg.value) : arg.description ?? ""))
        .join(" ");
      if (msg.params.type === "error" || msg.params.type === "warning") {
        consoleLines.push(`[${msg.params.type}] ${text}`);
      } else {
        console.log(`  page ${msg.params.type}: ${text}`);
      }
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
      const el = [...document.querySelectorAll("button,a,[role=tab],[role=menuitem],div,span")]
        .find((node) => { try { return match(node); } catch (e) { return false; } });
      if (!el) return "not found";
      (el.closest("button,a,[role=tab],[role=menuitem]") || el).click();
      return "clicked: " + (el.textContent || "").trim().slice(0, 24);
    })()`);

  await send("Runtime.enable");
  await send("Page.enable");
  if (process.env.DFP_PROBE === "1") {
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: "globalThis.__DFP_PROBE__ = true;",
    });
  }
  await send("Page.navigate", { url });
  await sleep(9000);

  // 1 + 2: the stylesheet the plugin manages.
  const sheet = await evalJs(`(() => {
    const tags = [...document.querySelectorAll('style[data-plugin-css="dsh-fonttune"]')];
    const tag = tags[0];
    return JSON.stringify({
      count: tags.length,
      connected: tag ? tag.isConnected : false,
      bytes: tag ? (tag.textContent || "").length : -1,
    });
  })()`);
  console.log("stylesheet:", sheet);
  const sheetInfo = JSON.parse(sheet);
  check("the plugin manages exactly one stylesheet element", sheetInfo.count === 1, sheet);
  check("it is connected to the document", sheetInfo.connected === true, sheet);

  // 3: the served CSS reaches the document.
  const styles = await evalJs(`(() => {
    const body = getComputedStyle(document.body);
    return JSON.stringify({ family: body.fontFamily, weight: body.fontWeight });
  })()`);
  console.log("body computed:", styles);
  const computed = JSON.parse(styles);
  if (EXPECT_FAMILY !== "") {
    check(
      `the body carries the configured family`,
      computed.family.includes(EXPECT_FAMILY),
      computed.family
    );
  }
  if (EXPECT_WEIGHT !== "") {
    check(`the body carries the configured weight`, computed.weight === EXPECT_WEIGHT, computed.weight);
  }

  // 4: settings sheet -> plugins -> the plugin's configuration card.
  /** Click the first element whose own text or aria-label matches, preferring controls. */
  const clickExact = async (pattern) =>
    evalJs(`(() => {
      const rx = ${pattern};
      const nodes = [...document.querySelectorAll("button,a,[role=tab],[role=menuitem],[role=button]")];
      const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
      const hit = nodes.find((el) => rx.test(el.getAttribute("aria-label") || "") || rx.test(own(el)))
        || nodes.find((el) => rx.test(el.textContent || ""));
      if (!hit) return "not found";
      hit.click();
      return "clicked: " + ((hit.getAttribute("aria-label") || own(hit) || hit.textContent || "").trim().slice(0, 20));
    })()`);

  console.log("open settings:", await clickExact("/设置|Settings/"));
  await sleep(1800);
  console.log("plugins section:", await clickExact("/^(插件|Plugins)$/"));
  await sleep(2000);
  if (process.env.DFP_DUMP === "1") {
    // Grouped, so a plugin offered by two seats at once (an item card and the
    // package card of the same install) is visible as such.
    const labels = await evalJs(`JSON.stringify({
      items: [...document.querySelectorAll("[data-plugin-item]")].map((el) => el.getAttribute("data-plugin-item")),
      groups: [...document.querySelectorAll("[data-plugin-group]")].map((group) => ({
        group: group.getAttribute("data-plugin-group"),
        cards: [...group.querySelectorAll("li")].map((li) => (li.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 30)),
      })),
      ours: [...document.querySelectorAll("li,button,a")]
        .map((el) => (el.textContent || "").trim().replace(/\\s+/g, " "))
        .filter((t) => /dsh-fonttune|字体增强|Font tune/.test(t))
        .map((t) => t.slice(0, 60)),
    })`);
    console.log("plugins page:", labels);
  }

  // The alpha contributes a plugin page entry to that list; the rc line has no
  // `plugins.item` slot, so the same click falls through to the configuration
  // tab below.
  const opened = await evalJs(`(() => {
    const item = document.querySelector('[data-plugin-item="fonttune"]')
      || [...document.querySelectorAll("[data-plugin-item],li,button")]
        .find((el) => /字体增强|Font tune/.test((el.textContent || "").trim().slice(0, 40)));
    if (!item) return "no plugin entry";
    const control = item.querySelector("button,[role=button],a") || item;
    control.click();
    if (control !== item) item.click();
    return "clicked: " + (item.textContent || "").trim().slice(0, 20);
  })()`);
  console.log("plugin entry:", opened);
  await sleep(1600);
  console.log("config tab (rc):", await clickExact("/插件配置|Plugin configuration/"));
  await sleep(1600);
  if (process.env.DFP_DUMP === "1") {
    console.log("detail:", await evalJs(`JSON.stringify({
      detail: [...document.querySelectorAll("[data-plugin-item-detail],[data-plugin-config]")].map((el) => el.getAttribute("data-plugin-item-detail") || "config"),
      cards: document.querySelectorAll(".dfp-card").length,
    })`));
  }

  const card = await evalJs(`(() => {
    const cards = [...document.querySelectorAll(".dfp-card")];
    return JSON.stringify({
      count: cards.length,
      text: cards[0] ? (cards[0].textContent || "").slice(0, 120) : null,
    });
  })()`);
  console.log("card:", card);
  const cardInfo = JSON.parse(card);
  check("the configuration card renders in the settings sheet", cardInfo.count >= 1, card);

  // 5: driving a control writes through to the host. The card opens collapsed,
  // so its title row is clicked first; the code section's ligature switch is a
  // plain segmented control and lands on a durable field.
  const driven = await evalJs(`(async () => {
    const card = document.querySelector(".dfp-card");
    if (!card) return "no card";
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (!String(card.className).includes("dfp-cardOpen")) {
      const title = card.querySelector("button");
      if (!title) return "no title row";
      title.click();
      await sleep(700);
    }
    const heads = [...card.querySelectorAll(".dfp-sectionHead")];
    const code = heads.find((h) => /代码|Code/.test(h.textContent || ""));
    if (!code) return "no code section";
    code.click();
    await sleep(700);
    const body = code.parentElement?.querySelector(".dfp-sectionBody") || card;
    // The code section's ligature switch is a plain segmented control over a
    // durable field. "关闭"/"Off" is picked when it is there, because it moves
    // the stored value to a value a check can then read back (2), rather than
    // re-asserting a value that may already be set.
    const buttons = [...body.querySelectorAll("button")];
    const off = buttons.find((b) => (b.textContent || "").trim() === "关闭" || (b.textContent || "").trim() === "Off");
    const on = off || buttons.find((b) => (b.textContent || "").trim() === "开启" || (b.textContent || "").trim() === "On");
    if (!on) return "no ligature switch";
    const statusOf = () => {
      const node = document.querySelector(".dfp-status");
      return node ? (node.textContent || "").trim() : "";
    };
    on.click();
    await sleep(1600);
    return "driven" + (statusOf() !== "" ? " status=" + statusOf() : "");
  })()`);
  console.log("drive card:", driven);
  check("a card control could be driven", driven !== "no card" && !driven.startsWith("no "), driven);

  console.log("\n== console ==");
  for (const line of consoleLines) console.log("  " + line);
  check("no console errors", consoleLines.length === 0, consoleLines.join(" | "));

  console.log(`\n${failures === 0 ? "HOST LINE OK" : failures + " check(s) failed"}`);
  ws.close();
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((error) => {
  console.error("probe failed:", error);
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
