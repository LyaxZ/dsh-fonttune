/**
 * Drive a real headless Edge against the smoke DSH instance via CDP and run
 * the diagnostics the browser console would answer:
 *
 *   node test/browser-probe.mjs <base-url-with-token> [--open-settings]
 *
 * Checks, in order:
 *   1. the boot graph the page actually received contains dsh-fonttune
 *   2. the plugin's style tags exist (apply() ran end to end)
 *   3. every console error / failed request the page produced
 *   4. optionally: open Settings -> Plugins -> configurable tab and dump the
 *      card list text
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [, , urlArg, openFlag] = process.argv;
if (!urlArg) {
  console.error("usage: node test/browser-probe.mjs <url-with-token> [--open-settings]");
  process.exit(2);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), "dfp-edge-"));

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

async function findTarget(retries = 20) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page" && t.url?.startsWith("about:blank"));
      if (page) return page;
    } catch {}
    await sleep(300);
  }
  throw new Error("headless browser did not expose a CDP target");
}

class Cdp {
  constructor() {
    this.pending = new Map();
    this.console = [];
    this.ws = null;
  }

  async connect(url) {
    this.seq = 0;
    this.ws = new WebSocket(url);
    const pending = this.pending;
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        const text = (msg.params.args ?? [])
          .map((a) => a.value ?? a.description ?? a.type)
          .join(" ");
        this.console.push(`[console.${msg.params.type}] ${text}`);
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        this.console.push(`[exception] ${d.text} ${d.exception?.description ?? ""}`);
      } else if (msg.method === "Log.entryAdded") {
        this.console.push(`[${msg.params.entry.level}] ${msg.params.entry.text}`);
      }
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const main = async () => {
  const target = await findTarget();
  const cdp = new Cdp();
  await cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.enable");

  await cdp.send("Page.navigate", { url: urlArg });
  await sleep(9000); // let the SPA boot, plugins materialize, fonts apply

  const probe = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      return `THREW: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ""}`;
    }
    return result.result.value;
  };

  console.log("== boot graph ==");
  console.log(JSON.stringify(await probe(
    `(globalThis.__DSH_BOOT__?.modules ?? []).filter(r => String(r.id||"").includes("font"))`
  )));

  console.log("== plugin style tags ==");
  console.log(JSON.stringify(await probe(
    `[...document.querySelectorAll("style[data-plugin-css]")].map(s => s.dataset.pluginCss)`
  )));

  console.log("== our card stylesheet size ==");
  console.log(await probe(
    `document.querySelector('style[data-plugin-css="dsh-fonttune-card"]')?.textContent.length ?? -1`
  ));

  if (openFlag === "--open-settings") {
    console.log("== settings dom walk ==");
    console.log(JSON.stringify(await probe(`(() => {
      // open settings via the sidebar trigger, if it exists
      const triggers = [...document.querySelectorAll("button,[role=button],a")];
      const trigger = triggers.find(el => /设置|Settings/.test(el.getAttribute("aria-label") || el.textContent || ""));
      if (trigger) trigger.click();
      return trigger ? "clicked: " + (trigger.getAttribute("aria-label") || trigger.textContent) : "no settings trigger found";
    })()`)));
    await sleep(1600);
    console.log(await probe(`(() => {
      const tabs = [...document.querySelectorAll('[role="tab"],button')].map(b => (b.textContent||"").trim()).filter(Boolean);
      return JSON.stringify(tabs.filter(t => /插件|Plugin/.test(t)));
    })()`));
    await sleep(900);
    console.log(await probe(`(() => {
      const tab = [...document.querySelectorAll('[role="tab"],button')].find(b => /插件配置|Plugin configuration/.test(b.textContent||""));
      if (!tab) return "configurable tab button not found";
      tab.click();
      return "clicked configurable tab";
    })()`));
    await sleep(1400);
    console.log(await probe(`document.body.innerText.includes("字体增强") || document.body.innerText.includes("Font plus") ? "CARD VISIBLE" : "CARD NOT IN DOM — body text near plugins: " + (document.body.innerText.match(/插件[\\s\\S]{0,300}/)?.[0] ?? "(none)")`));
  }

  console.log("== console messages ==");
  for (const line of cdp.console) console.log("  " + line);

  cdp.ws.close();
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
};

main().catch((error) => {
  console.error("probe failed:", error);
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
