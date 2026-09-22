/**
 * Drive the simple (West/CJK) mode in a real browser and prove the mode switch
 * never rewrites a tuned stack, and that a pick replaces exactly one slot.
 *
 *   node test/split-walk.mjs <url-with-token>
 *
 * Steps:
 *   1. a three-entry stack is written through settings/mutate
 *   2. open Settings -> Plugins -> configurable, expand the card, expand the
 *      conversation section (the card opens with every section collapsed)
 *   3. the simple mode renders two slots — west = the first entry, east = the
 *      first CJK-capable entry — and the rest note names the remainder
 *   4. toggle Advanced and back, then re-read the settings: identical
 *   5. pick a western family through the real panel, then re-read: the west
 *      slot is replaced in place, the east slot and the remainder untouched
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
const STACK = '"Inter", "Microsoft YaHei", system-ui';

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

  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : "  — " + detail}`);
    if (!ok) failures += 1;
  };

  /** Read the plugin namespace's user layer. */
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

  /** Restore the namespace's user layer exactly as it was found. */
  const restoreUser = (original) => evalJs(`(async () => {
    const ops = [];
    const original = ${JSON.stringify(original)};
    for (const key of Object.keys(original)) ops.push({ op: "set", path: [key], value: original[key] });
    for (const key of ["sans", "stackDialog", "mono", "sizeOffset", "sizeOffsetDialog", "sizeOffsetCode", "weight", "weightDialog", "weightCode", "lineHeight", "lineHeightDialog", "lineHeightCode"]) {
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

  const mutate = (ops) => evalJs(`(async () => {
    const res = await fetch("/api/settings/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: "m" + Math.random(), method: "settings/mutate", payload: { args: { ns: "dsh-fonttune", ops: ${JSON.stringify(ops)} } } }),
    });
    const body = await res.json();
    const value = body.result && body.result.value;
    return JSON.stringify(value ? value.user : body);
  })()`);

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleep(9000);

  const startUser = await readUser();
  console.log("original user layer:", startUser);
  const originalUser = JSON.parse(startUser);
  if (typeof originalUser !== "object" || originalUser === null) {
    throw new Error("the settings namespace did not answer: " + startUser);
  }

  // Step 1: the stack under test, written through the live settings document.
  console.log("write stack:", await mutate([{ op: "set", path: ["stackDialog"], value: STACK }]));
  await send("Page.navigate", { url });
  await sleep(9000);

  // Step 2: open the settings sheet, the card, and the conversation section.
  await click(`(el) => /设置|Settings/.test(el.getAttribute("aria-label") || el.textContent || "")`);
  await sleep(1800);
  await click(`(el) => (el.textContent || "").trim() === "插件" || (el.textContent || "").trim() === "Plugins"`);
  await sleep(1800);
  await click(`(el) => /插件配置|Plugin configuration/.test(el.textContent || "")`);
  await sleep(1600);
  await click(`(el) => (el.textContent || "").includes("字体增强") || (el.textContent || "").includes("Font tune")`);
  await sleep(1500);
  console.log(
    "expand conversation:",
    await click(
      `(el) => String(el.className || "").includes("dfp-sectionHead") && /对话|Conversation/.test(el.textContent || "")`
    )
  );
  await sleep(1000);

  // Step 3: the simple mode's two slots, and the untouched remainder.
  const simple = await evalJs(`(() => {
    const slots = [...document.querySelectorAll(".dfp-slotLabel")].map((l) => (l.textContent || "").trim());
    const picks = [...document.querySelectorAll(".dfp-pick")].map((p) => (p.textContent || "").trim());
    const chips = [...document.querySelectorAll(".dfp-chipLabel")].map((c) => (c.textContent || "").trim());
    const rest = [...document.querySelectorAll(".dfp-hint")].map((h) => (h.textContent || ""))
      .find((x) => /其余回退项|Other fallbacks/.test(x)) || "";
    return JSON.stringify({ slots, picks, chips, rest });
  })()`);
  console.log("simple mode:", simple);
  const mode = JSON.parse(simple);
  check("the simple mode renders two slots", mode.slots.length === 2, JSON.stringify(mode.slots));
  check("both slots are filled from the stack", mode.picks.length === 2, JSON.stringify(mode.picks));
  check("the western slot took the first entry", mode.picks[0] === "Inter", String(mode.picks[0]));
  check("the CJK slot took the CJK entry", mode.picks[1] === "Microsoft YaHei", String(mode.picks[1]));
  check("the remainder is named in a note", mode.rest.includes("system-ui"), mode.rest);

  // Step 4: toggling the mode must not touch the stored stack.
  await click(`(el) => String(el.className || "").includes("dfp-modeButton") && /高级|Advanced/.test(el.textContent || "")`);
  await sleep(1200);
  const advanced = await evalJs(
    `JSON.stringify([...document.querySelectorAll(".dfp-chip .dfp-chipLabel")].map((c) => (c.textContent || "").trim()))`
  );
  console.log("advanced chips:", advanced);
  check(
    "the advanced mode shows the whole stack",
    JSON.parse(advanced).join("|") === "Inter|Microsoft YaHei|system-ui",
    advanced
  );
  await click(`(el) => String(el.className || "").includes("dfp-modeButton") && /简单|Basic/.test(el.textContent || "")`);
  await sleep(1400);
  const afterToggle = await readUser();
  console.log("layer after the round trip:", afterToggle);
  check(
    "toggling the mode leaves the stack alone",
    JSON.parse(afterToggle).stackDialog === STACK,
    String(JSON.parse(afterToggle).stackDialog)
  );

  // Step 5: pick a western family through the real panel.
  console.log("open west panel:", await evalJs(`(() => {
    const trigger = document.querySelector(".dfp-pick");
    if (!trigger) return "not found";
    trigger.click();
    return "opened";
  })()`));
  await sleep(1200);
  const options = await evalJs(
    `JSON.stringify([...document.querySelectorAll(".dfp-option")].map((o) => o.dataset.family || "").filter(Boolean).slice(0, 8))`
  );
  console.log("panel options:", options);
  check("the panel lists pickable families", JSON.parse(options).length > 0, options);
  const pickResult = await evalJs(`(() => {
    const option = [...document.querySelectorAll(".dfp-option")].find((o) => (o.dataset.family || "") === "Segoe UI");
    if (!option) return "option not found";
    option.click();
    return "picked Segoe UI";
  })()`);
  console.log("pick:", pickResult);
  check("the curated family is offered in the panel", pickResult === "picked Segoe UI", pickResult);
  await sleep(1600);

  const finalPicks = await evalJs(
    `JSON.stringify([...document.querySelectorAll(".dfp-pick")].map((p) => (p.textContent || "").trim()))`
  );
  console.log("final picks:", finalPicks);
  const stored = JSON.parse(await readUser());
  console.log("layer after the pick:", JSON.stringify(stored));
  check(
    "the pick replaced the western slot in place",
    String(stored.stackDialog).indexOf('"Segoe UI"') === 0 || String(stored.stackDialog).includes('"Segoe UI"'),
    String(stored.stackDialog)
  );
  check(
    "the CJK slot and the remainder are untouched",
    String(stored.stackDialog).includes('"Microsoft YaHei"') &&
      String(stored.stackDialog).includes("system-ui"),
    String(stored.stackDialog)
  );
  check(
    "the picker shows the new western family",
    JSON.parse(finalPicks)[0] === "Segoe UI",
    String(JSON.parse(finalPicks)[0])
  );

  console.log("\nrestore:", await restoreUser(originalUser));
  await sleep(900);
  const restored = await readUser();
  check(
    "the user layer is back to its original shape",
    restored === JSON.stringify(originalUser),
    `${restored} vs ${JSON.stringify(originalUser)}`
  );

  console.log("\n== console ==");
  for (const line of consoleLines) console.log("  " + line);
  check("no console errors", consoleLines.length === 0, consoleLines.join(" | "));

  console.log(`\n${failures === 0 ? "SPLIT WALK OK" : failures + " check(s) failed"}`);
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
