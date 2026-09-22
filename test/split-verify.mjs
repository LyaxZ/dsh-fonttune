/**
 * Verify in a real browser that the conversation and code size axes are
 * independent — and that the RETIRED interface size axis moves nothing.
 *
 *   node test/split-verify.mjs <url-with-token>
 *
 * Writes `sizeOffsetDialog` / `sizeOffsetCode` (and, for the retirement check,
 * the retired `sizeOffset`) through `settings/mutate`, then measures, for each
 * combination:
 *   - body's computed `--dsh-content-font-size` (the source of the conversation chain)
 *   - body's computed `--dsw-font-markdown-code-block` (the code shorthand)
 *   - probe elements consuming those tokens through `font:` — exactly how the
 *     shipped stylesheets size a code block (`font: var(--dsw-font-markdown-code-block)`)
 *   - any real `pre` / `code` element the page happens to have loaded
 *
 * Ratios are taken against the untouched baseline, so the numbers stay valid
 * whatever DSH's own font-size slider is set to. The original user layer of the
 * namespace is restored before the process exits.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: node test/split-verify.mjs <url-with-token>");
  process.exit(2);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9339;
const profile = mkdtempSync(join(tmpdir(), "dfp-split-"));
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

/** Assertion helper that reports instead of throwing, so the report is complete. */
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

  // --- settings plumbing, done inside the page so the cookie applies --------
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
      return mine ? JSON.stringify({ user: mine.user, revision: mine.revision }) : "section not found";
    })()`);

  /**
   * `settings/mutate` takes a plain `args` OBJECT (`{ns, ops}`) — the
   * positional array form is rejected with "Remote payload must contain
   * exactly one plain-object args field".
   */
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

  const measure = () =>
    evalJs(`(() => {
      const probe = (font) => {
        const el = document.createElement("div");
        el.style.font = font;
        el.textContent = "probe";
        document.body.appendChild(el);
        const style = getComputedStyle(el);
        const out = { size: style.fontSize, lineHeight: style.lineHeight, family: style.fontFamily };
        el.remove();
        return out;
      };
      const bodyStyle = getComputedStyle(document.body);
      const real = [...document.querySelectorAll("pre, code")]
        .filter((el) => el.textContent && el.textContent.trim().length > 0)
        .slice(0, 3)
        .map((el) => ({ tag: el.tagName, size: getComputedStyle(el).fontSize }));
      // The host half's first-paint row is served inside the HTML and is not
      // rewritten for an already-loaded page, so report which untagged styles
      // carry a size declaration — that is the only way it can win.
      const hostRows = [...document.querySelectorAll("style")]
        .filter((tag) => !tag.dataset.pluginCss && (tag.textContent || "").includes("--dsh-content-font-size"))
        .map((tag) => (tag.textContent || "").replace(/\\s+/g, " ").slice(0, 150));
      return JSON.stringify({
        contentSize: bodyStyle.getPropertyValue("--dsh-content-font-size").trim(),
        codeToken: bodyStyle.getPropertyValue("--dsw-font-markdown-code-block").trim().slice(0, 90),
        body: probe("var(--dsw-font-markdown-base)"),
        code: probe("var(--dsw-font-markdown-code-block)"),
        inlineCode: probe("var(--dsw-font-markdown-code)"),
        real: real,
        hostRows: hostRows,
        ourCss: [...document.querySelectorAll('style[data-plugin-css="dsh-fonttune"]')]
          .map((t) => (t.textContent || "").length)
          .reduce((a, b) => a + b, 0),
      });
    })()`);

  const before = JSON.parse(await readNamespace());
  console.log("original user layer:", JSON.stringify(before.user));
  const original = before.user ?? {};

  const px = (value) => Number.parseFloat(value);
  const ratio = (now, base) => (base > 0 ? now / base : 0);
  const round = (value) => Math.round(value * 1000) / 1000;

  /** Run one combination, then report the measured ratios against the baseline. */
  const step = async (label, dialogOffset, codeOffset, baseline, retiredOffset) => {
    const ops = [
      { op: "set", path: ["sizeOffsetDialog"], value: dialogOffset },
      { op: "set", path: ["sizeOffsetCode"], value: codeOffset },
      // The interface size axis is RETIRED: it must move nothing at all. The
      // step that writes it proves that in the real page.
      { op: "set", path: ["sizeOffset"], value: retiredOffset ?? 0 },
    ];
    const result = await mutate(ops);
    // Reload: the host half's first-paint row is baked into the served HTML, so
    // a reload is what makes every combination a clean, self-consistent state.
    await send("Page.navigate", { url });
    await sleep(9000);
    const seen = JSON.parse(await measure());
    console.log(`\n${label} (conversation ${dialogOffset}, code ${codeOffset}, retired ${retiredOffset ?? 0})`);
    console.log("  user layer:", result);
    console.log(
      `  --dsh-content-font-size=${seen.contentSize}  code shorthand=${seen.codeToken}`
    );
    console.log(
      `  body probe: ${seen.body.size}/${seen.body.lineHeight}  code block: ${seen.code.size}/${seen.code.lineHeight}  inline code: ${seen.inlineCode.size}`
    );
    console.log(`  real pre/code elements: ${JSON.stringify(seen.real)}  injected css: ${seen.ourCss} B`);
    console.log(`  untagged size rows: ${JSON.stringify(seen.hostRows)}`);
    if (baseline) {
      const bodyRatio = round(ratio(px(seen.body.size), px(baseline.body.size)));
      const codeRatio = round(ratio(px(seen.code.size), px(baseline.code.size)));
      console.log(`  ratio vs baseline: body ×${bodyRatio}  code ×${codeRatio}`);
      return { seen, bodyRatio, codeRatio };
    }
    return { seen, bodyRatio: 1, codeRatio: 1 };
  };

  const base = await step("baseline", 0, 0, null);
  const bodyOnly = await step("conversation only", 3, 0, base.seen);
  const codeOnly = await step("code only", 0, 3, base.seen);
  const both = await step("both, opposite signs", 3, -3, base.seen);
  const retired = await step("retired interface size only", 0, 0, base.seen, 4);

  console.log("\nchecks");
  // The conversation offset is added to the LIVE official content size (the
  // theme's own font-size preference), while the code axis scales the shipped
  // shorthands over DSH's 16px reference — so the two expectations differ
  // whenever the machine is not on DSH's default size.
  const dialogBase = px(base.seen.contentSize);
  const codeBase = 16;
  const scaleUp = round((dialogBase + 3) / dialogBase);
  const codeUp = round((codeBase + 3) / codeBase);
  const scaleDown = round((dialogBase - 3) / dialogBase);
  const codeDown = round((codeBase - 3) / codeBase);
  check("baseline body probe resolved", px(base.seen.body.size) > 0, base.seen.body.size);
  check("baseline code probe resolved", px(base.seen.code.size) > 0, base.seen.code.size);
  check(
    "conversation offset +3 moves the conversation chain only",
    bodyOnly.bodyRatio === scaleUp && bodyOnly.codeRatio === 1,
    `body ×${bodyOnly.bodyRatio} (want ${scaleUp}), code ×${bodyOnly.codeRatio}`
  );
  check(
    "code offset +3 moves the code chain only",
    codeOnly.bodyRatio === 1 && codeOnly.codeRatio === codeUp,
    `body ×${codeOnly.bodyRatio}, code ×${codeOnly.codeRatio} (want ${codeUp})`
  );
  check(
    "opposite offsets move independently",
    both.bodyRatio === scaleUp && both.codeRatio === codeDown,
    `body ×${both.bodyRatio} (want ${scaleUp}), code ×${both.codeRatio} (want ${codeDown})`
  );
  check(
    "the retired interface size axis moves nothing",
    retired.bodyRatio === 1 && retired.codeRatio === 1,
    `body ×${retired.bodyRatio}, code ×${retired.codeRatio}`
  );
  const inlineRatio = round(ratio(px(both.seen.inlineCode.size), px(base.seen.inlineCode.size)));
  check(
    "the inline-code token rides the same code axis",
    inlineRatio === codeDown,
    `inline code ×${inlineRatio} (want ${codeDown})`
  );
  check(
    "the code shorthand keeps its family list",
    /\)\s+(?:"[^"]+"|[A-Za-z][\w-]*)/.test(both.seen.codeToken),
    both.seen.codeToken
  );

  // --- restore -------------------------------------------------------------
  const restoreOps = [];
  for (const key of Object.keys(original)) {
    restoreOps.push({ op: "set", path: [key], value: original[key] });
  }
  for (const key of [
    "sans",
    "mono",
    "sizeOffset",
    "sizeOffsetDialog",
    "sizeOffsetCode",
    "weight",
  ]) {
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

  console.log(`\n${failures === 0 ? "SPLIT OK" : failures + " check(s) failed"}`);
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
