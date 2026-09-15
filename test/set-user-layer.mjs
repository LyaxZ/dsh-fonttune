/**
 * Write the plugin namespace's user layer in a running instance.
 *
 *   node test/set-user-layer.mjs <url-with-token> '{"sans":"Inter","sizeOffset":1}'
 *   '{"sans":"Inter"}' | node test/set-user-layer.mjs <url-with-token>
 *
 * Sets the keys given and unsets every other field of the namespace, so the
 * layer ends up exactly as described. This is the tool that puts a machine's
 * own preferences back after a walk script has driven the real controls.
 *
 * Prefer the stdin form on Windows: PowerShell 5.1 drops the double quotes when
 * it passes a JSON literal as an argument, and pipes avoid that entirely.
 *
 * The RPC payload must be a plain `args` OBJECT (`{ns, ops}`); the positional
 * array form is rejected with "Remote payload must contain exactly one
 * plain-object args field".
 */
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error('usage: node test/set-user-layer.mjs <url-with-token> \'{"sans":"Inter"}\'');
  process.exit(2);
}

/** The layer description: an argument, a file path, or stdin. */
function readWanted() {
  const argument = process.argv[3];
  if (argument === undefined || argument === "-") {
    try {
      return readFileSync(0, "utf8").trim();
    } catch {
      return "";
    }
  }
  try {
    return readFileSync(argument, "utf8").trim();
  } catch {
    return argument;
  }
}

const wantedText = readWanted();
if (wantedText === "") {
  console.error("no JSON given (argument, file path, or stdin)");
  process.exit(2);
}
const target = JSON.parse(wantedText);
const FIELDS = ["sans", "mono", "sizeOffset", "sizeOffsetCode", "weight"];
const ops = [];
for (const [key, value] of Object.entries(target)) ops.push({ op: "set", path: [key], value });
for (const key of FIELDS) {
  if (!Object.prototype.hasOwnProperty.call(target, key)) ops.push({ op: "unset", path: [key] });
}

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9341;
const profile = mkdtempSync(join(tmpdir(), "dfp-layer-"));
const child = execFile(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" }
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  let target_ = null;
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page" && t.url?.startsWith("about:blank"));
      if (page) {
        target_ = page;
        break;
      }
    } catch {}
    await sleep(300);
  }
  if (!target_) throw new Error("no CDP target");

  const ws = new WebSocket(target_.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
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
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleep(9000);

  console.log(
    "applied:",
    await evalJs(`(async () => {
      const res = await fetch("/api/settings/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "client-request",
          rpcId: "l" + Math.random(),
          method: "settings/mutate",
          payload: { args: { ns: "dsh-fonttune", ops: ${JSON.stringify(ops)} } },
        }),
      });
      const body = await res.json();
      const value = body.result && body.result.value;
      return JSON.stringify(value ? { user: value.user } : body);
    })()`)
  );
  await sleep(600);
  console.log(
    "now:",
    await evalJs(`(async () => {
      const res = await fetch("/api/settings/describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "client-request", rpcId: "d" + Math.random(), method: "settings/describe", payload: { args: {} } }),
      });
      const body = await res.json();
      const list = (body.result && body.result.value && body.result.value.namespaces) || [];
      const mine = list.find((entry) => entry.ns === "dsh-fonttune");
      return JSON.stringify(mine ? mine.user : "section not found");
    })()`)
  );

  ws.close();
  child.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(0);
};

main().catch((error) => {
  console.error("failed:", error);
  child.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
