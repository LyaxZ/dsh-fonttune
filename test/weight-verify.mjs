/**
 * Verify in a real browser that the body and code WEIGHT axes are independent.
 *
 *   node test/weight-verify.mjs <url-with-token>
 *
 * Weight has no token chain to ride (no shipped rule reads a `-font-weight`
 * token), so this axis is a pair of `!important` rules and the whole question is
 * which one wins on the code surfaces. This script therefore builds the code
 * surfaces DSH itself builds — a markdown block (`pre` with the code `font`
 * shorthand), inline code, the tool code body and the terminal body (plain divs
 * that only a class name identifies) — inside the REAL page, with DSH's real
 * stylesheets loaded, and reads back the computed weight of each.
 *
 * The namespace's original user layer is restored before the process exits.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: node test/weight-verify.mjs <url-with-token>");
  process.exit(2);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9343;
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
   * — plus a `<span>` inside a block and inside the terminal, because the body
   * axis is a blanket `body, body *` rule that would otherwise win on every
   * descendant.
   */
  const measure = () =>
    evalJs(`(() => {
      const host = document.createElement("div");
      host.id = "dfp-weight-probe";
      host.innerHTML =
        '<p id="w-body">body text</p>' +
        '<p id="w-body-span"><span>nested body</span></p>' +
        '<pre id="w-pre" style="font: var(--dsw-font-markdown-code-block)">code<span id="w-pre-span">nested code</span></pre>' +
        '<code id="w-inline" style="font: var(--dsw-font-markdown-code)">inline</code>' +
        '<div id="w-tool" class="o3BgMG_codeBody" style="font: var(--dsw-font-markdown-code-block)">tool</div>' +
        '<div id="w-terminal" class="CY-8Ka_terminalBody" style="font: var(--dsw-font-markdown-code-block-small)">term<span id="w-term-span">nested term</span></div>' +
        '<div id="w-cm" class="cm-editor" style="font: var(--dsw-font-markdown-code-block)">editor</div>';
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
        ourCss: [...document.querySelectorAll('style[data-plugin-css="dsh-fonttune"]')]
          .map((tag) => (tag.textContent || "").length)
          .reduce((a, b) => a + b, 0),
      };
      host.remove();
      return JSON.stringify(out);
    })()`);

  const before = JSON.parse(await readNamespace());
  const original = before.user ?? {};
  console.log("original user layer:", JSON.stringify(original));

  /** Apply one weight combination (after a reload, so the state is self-consistent). */
  const step = async (label, weight, weightCode) => {
    const result = await mutate([
      { op: "set", path: ["weight"], value: weight },
      { op: "set", path: ["weightCode"], value: weightCode },
    ]);
    await send("Page.navigate", { url });
    await sleep(9000);
    const seen = JSON.parse(await measure());
    console.log(`\n${label} (body ${weight}, code ${weightCode})`);
    console.log("  user layer:", result);
    console.log(
      `  body=${seen.body} bodySpan=${seen.bodySpan} | pre=${seen.pre} preSpan=${seen.preSpan} inline=${seen.inline} tool=${seen.tool} terminal=${seen.terminal} termSpan=${seen.termSpan} editor=${seen.editor}`
    );
    console.log(`  injected css: ${seen.ourCss} B`);
    return seen;
  };

  const base = await step("baseline", 0, 0);
  const bodyOnly = await step("body only", 560, 0);
  const codeOnly = await step("code only", 0, 320);
  const both = await step("both", 560, 320);

  console.log("\nchecks");
  const CODE_KEYS = ["pre", "preSpan", "inline", "tool", "terminal", "termSpan", "editor"];
  check(
    "the baseline leaves DSH's own weights alone",
    base.body === base.pre && base.pre === base.inline,
    `${base.body} / ${base.pre} / ${base.inline}`
  );
  check(
    "a code-only weight moves every code surface",
    CODE_KEYS.every((key) => codeOnly[key] === "320"),
    CODE_KEYS.map((key) => `${key}=${codeOnly[key]}`).join(" ")
  );
  check(
    "a code-only weight leaves body text alone",
    codeOnly.body === base.body && codeOnly.bodySpan === base.bodySpan,
    `${codeOnly.body} / ${codeOnly.bodySpan}`
  );
  check(
    "a body-only weight moves body text, not code",
    bodyOnly.body === "560" &&
      bodyOnly.bodySpan === "560" &&
      CODE_KEYS.every((key) => bodyOnly[key] === base[key]),
    `body=${bodyOnly.body} ` + CODE_KEYS.map((key) => `${key}=${bodyOnly[key]}`).join(" ")
  );
  check(
    "both axes at once: body 560, code 320",
    both.body === "560" &&
      both.bodySpan === "560" &&
      CODE_KEYS.every((key) => both[key] === "320"),
    `body=${both.body} ` + CODE_KEYS.map((key) => `${key}=${both[key]}`).join(" ")
  );

  const restoreOps = [];
  for (const key of Object.keys(original)) {
    restoreOps.push({ op: "set", path: [key], value: original[key] });
  }
  for (const key of ["sans", "mono", "sizeOffset", "sizeOffsetCode", "weight", "weightCode"]) {
    if (!Object.prototype.hasOwnProperty.call(original, key)) {
      restoreOps.push({ op: "unset", path: [key] });
    }
  }
  console.log("\nrestore:", await mutate(restoreOps));
  await sleep(600);
  const after = JSON.parse(await readNamespace());
  console.log("user layer after restore:", JSON.stringify(after.user));
  check(
    "the user layer is back to its original shape",
    JSON.stringify(after.user) === JSON.stringify(original),
    `${JSON.stringify(after.user)} vs ${JSON.stringify(original)}`
  );

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

main().catch((error) => {
  console.error("verify failed:", error);
  child.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
