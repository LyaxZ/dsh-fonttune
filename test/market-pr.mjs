/**
 * Keep the awesome-dsh-plugin entry in sync and open the listing PR.
 *
 *   node test/market-pr.mjs update    # push the entry file on the fork branch
 *   node test/market-pr.mjs status    # report repo age / existing PR
 *   node test/market-pr.mjs open      # open the PR once upstream CI's
 *                                     # "repository is at least one day old"
 *                                     # prerequisite is satisfied
 *
 * The entry lives at `data/plugins/<owner>__<repo>.yml` in the upstream repo
 * and is a single-file contribution: whatever `description` says there is what
 * the market shows, so it has to be re-pushed when the plugin's description
 * changes. The token comes from git's credential helper (this machine's GitHub
 * login); nothing is read from the environment.
 */
import { execFileSync } from "node:child_process";

const UPSTREAM = "awesome-dsh-plugin/awesome-dsh-plugin";
const FORK = "LyaxZ/awesome-dsh-plugin";
const BRANCH = "fonttune-entry";
const PATH = "data/plugins/LyaxZ__dsh-fonttune.yml";
const REPO = "LyaxZ/dsh-fonttune";

const ENTRY = `url: https://github.com/LyaxZ/dsh-fonttune
name: LyaxZ/dsh-fonttune
category: ui
tarball: https://github.com/LyaxZ/dsh-fonttune/releases/latest/download/dsh-fonttune.tgz
description:
  en: 'Font plugin for the DeepSeek Harness Web GUI: body and code font families, a separate font-size offset for each, a global font weight, and a West/CJK split picker.'
  zh: 'DeepSeek Harness 字体插件：正文/代码字体族、正文与代码各自的字号偏移、字重，以及西文/中文分栏选择。'
`;

/** The GitHub token git already holds for this machine. */
function token() {
  const out = execFileSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  const match = out.match(/^password=(.*)$/m);
  if (!match) throw new Error("no GitHub token in the credential helper");
  return match[1].trim();
}

const AUTH = token();

async function api(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `token ${AUTH}`,
      accept: "application/vnd.github+json",
      "user-agent": "dsh-fonttune",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  }
  return parsed;
}

const action = process.argv[2] ?? "status";

/** Fetch the entry file on the fork branch, if the branch exists yet. */
async function readEntry() {
  try {
    const file = await api("GET", `/repos/${FORK}/contents/${PATH}?ref=${BRANCH}`);
    return file;
  } catch (error) {
    if (String(error.message).includes("404")) return null;
    throw error;
  }
}

async function status() {
  const repo = await api("GET", `/repos/${REPO}`);
  const created = new Date(repo.created_at);
  const ageHours = (Date.now() - created.getTime()) / 36e5;
  console.log(`repo created: ${repo.created_at}  age: ${ageHours.toFixed(1)} h`);
  console.log(`eligible for the market PR (needs ≥ 24 h): ${ageHours >= 24}`);
  console.log(`about: ${repo.description ?? "(none)"}`);

  const file = await readEntry();
  if (file === null) {
    console.log(`fork branch ${BRANCH}: no ${PATH} yet`);
  } else {
    const text = Buffer.from(file.content, "base64").toString("utf8");
    console.log(`fork branch ${BRANCH}: ${file.sha}  in sync: ${text === ENTRY}`);
    if (text !== ENTRY) console.log("--- current ---\n" + text);
  }

  const prs = await api("GET", `/repos/${UPSTREAM}/pulls?state=all&per_page=100`);
  const mine = prs.filter((pr) => pr.head?.label === `${FORK.split("/")[0]}:${BRANCH}`);
  console.log(
    mine.length === 0
      ? "no PR from this branch yet"
      : mine.map((pr) => `#${pr.number} ${pr.state} ${pr.title}`).join("\n")
  );

  const merged = await api("GET", `/repos/${UPSTREAM}/contents/${PATH}`).catch(() => null);
  console.log(merged === null ? "upstream: entry not merged yet" : "upstream: entry already present");
  return ageHours >= 24;
}

async function update() {
  const file = await readEntry();
  const current = file === null ? "" : Buffer.from(file.content, "base64").toString("utf8");
  if (current === ENTRY) {
    console.log("entry already up to date");
    return;
  }
  const body = {
    message: "fonttune: describe the two font-size axes",
    content: Buffer.from(ENTRY, "utf8").toString("base64"),
    branch: BRANCH,
  };
  if (file !== null) body.sha = file.sha;
  const result = await api("PUT", `/repos/${FORK}/contents/${PATH}`, body);
  console.log(`pushed ${result.commit.sha} to ${FORK}:${BRANCH}`);
}

async function open() {
  const eligible = await status();
  if (!eligible) {
    console.log("\nnot eligible yet — the upstream CI rejects a repository younger than a day");
    process.exitCode = 1;
    return;
  }
  const prs = await api("GET", `/repos/${UPSTREAM}/pulls?state=all&per_page=100`);
  const existing = prs.find((pr) => pr.head?.label === `${FORK.split("/")[0]}:${BRANCH}`);
  if (existing) {
    console.log(`PR already exists: #${existing.number} ${existing.state} ${existing.html_url}`);
    return;
  }
  const pr = await api("POST", `/repos/${UPSTREAM}/pulls`, {
    title: "Add dsh-fonttune: body/code font families, sizes and weight",
    head: `${FORK.split("/")[0]}:${BRANCH}`,
    base: "main",
    body: [
      "Adds one plugin entry, `data/plugins/LyaxZ__dsh-fonttune.yml`, and touches nothing else.",
      "",
      "**dsh-fonttune** — a font plugin for the DeepSeek Harness Web GUI: body and code font",
      "families, a separate font-size offset for each of them, a global font weight, and a",
      "West/CJK split picker. Host + client halves, zero-dependency build, MIT.",
      "",
      "Repository: https://github.com/LyaxZ/dsh-fonttune",
    ].join("\n"),
  });
  console.log(`opened #${pr.number}: ${pr.html_url}`);
}

const run = { status, update, open }[action];
if (!run) {
  console.error("usage: node test/market-pr.mjs [status|update|open]");
  process.exit(2);
}
run().catch((error) => {
  console.error("failed:", error.message);
  process.exit(1);
});
