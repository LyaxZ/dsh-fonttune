/**
 * Keep the awesome-dsh-plugin entry in sync and open the listing PR.
 *
 *   node test/market-pr.mjs status    # report repo age / existing PR / branch diff
 *   node test/market-pr.mjs update    # rebuild the branch on upstream main and push the entry
 *   node test/market-pr.mjs refresh   # rewrite an already-open PR's title and body
 *   node test/market-pr.mjs reopen    # put back a PR upstream closed (empty diff window)
 *   node test/market-pr.mjs open      # sync, then open the PR once upstream CI's
 *                                     # "repository is at least one day old"
 *                                     # prerequisite is satisfied
 *   node test/market-pr.mjs about     # write the repository About line and topics
 *
 * The entry lives at `data/plugins/<owner>__<repo>.yml` in the upstream repo
 * and is a single-file contribution: whatever `description` says there is what
 * the market shows, so it has to be re-pushed when the plugin's description
 * changes. The same prose also lives in the PR title/body and in the
 * repository's About line — three independent copies, so `about` writes the
 * third one from the same constants `update`/`refresh` push. `update` force-resets the branch to upstream `main` first, so the
 * result is always "current main + exactly one added file" — a branch that has
 * been sitting around would otherwise drift hundreds of commits behind. The
 * token comes from git's credential helper (this machine's GitHub login);
 * nothing is read from the environment.
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
  en: 'Font plugin for the DeepSeek Harness Web GUI: the conversation gets its own font, size, line height and weight, the interface font follows the conversation, code keeps its own axis with ligature control, and whole setups save as presets.'
  zh: 'DeepSeek Harness 字体插件：对话拥有字体、字号、行高与字重，界面字体默认跟随对话，代码独立成轴并支持连字，整套配置可存为预设方案。'
`;

const PR_TITLE = "Add dsh-fonttune: typography for the conversation, the interface and code";

const PR_BODY = [
  "Adds one plugin entry, `data/plugins/LyaxZ__dsh-fonttune.yml`, and touches nothing else.",
  "",
  "**dsh-fonttune** — a font plugin for the DeepSeek Harness Web GUI: the conversation gets",
  "its own font, size, line height and weight, the interface font follows the conversation,",
  "code keeps its own axis with ligature control, and whole setups can be saved as presets.",
  "Host + client halves, zero-dependency build, MIT.",
  "",
  "Repository: https://github.com/LyaxZ/dsh-fonttune",
].join("\n");

/** The repository About line — the third copy of the listing prose. */
const ABOUT =
  "DeepSeek Harness 字体插件：对话可独立设置字体、字号、行高与字重，界面字体默认跟随对话，代码独立成轴并支持连字，整套配置可存为预设方案。";

const TOPICS = [
  "deepseek-harness",
  "dsh",
  "dsh-plugin",
  "font",
  "font-family",
  "font-weight",
  "typography",
];

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

/**
 * Point the fork branch at upstream `main` and push the entry on top of it.
 *
 * The commit is built through the git data API (blob → tree → commit) and the
 * branch ref is moved **once**. Resetting the ref first and pushing the file
 * afterwards leaves the branch momentarily identical to `main`, and upstream
 * closes a PR whose diff is empty in that window — that is exactly how the
 * first listing PR got closed, so the single ref update is not a nicety.
 * @returns {Promise<string>} the commit that carries the entry.
 */
async function sync() {
  const upstreamRef = await api("GET", `/repos/${UPSTREAM}/git/ref/heads/main`);
  const base = upstreamRef.object.sha;
  console.log(`upstream main: ${base}`);
  const baseCommit = await api("GET", `/repos/${UPSTREAM}/git/commits/${base}`);
  const blob = await api("POST", `/repos/${FORK}/git/blobs`, {
    content: Buffer.from(ENTRY, "utf8").toString("base64"),
    encoding: "base64",
  });
  const tree = await api("POST", `/repos/${FORK}/git/trees`, {
    base_tree: baseCommit.tree.sha,
    tree: [{ path: PATH, mode: "100644", type: "blob", sha: blob.sha }],
  });
  const commit = await api("POST", `/repos/${FORK}/git/commits`, {
    message: "fonttune: add the plugin entry",
    tree: tree.sha,
    parents: [base],
  });
  await api("PATCH", `/repos/${FORK}/git/refs/heads/${BRANCH}`, {
    sha: commit.sha,
    force: true,
  });
  console.log(`moved ${FORK}:${BRANCH} to ${commit.sha} (one ref update, no empty window)`);
  return commit.sha;
}

async function update() {
  const file = await readEntry();
  const current = file === null ? "" : Buffer.from(file.content, "base64").toString("utf8");
  if (current === ENTRY) {
    // Same content, but the branch may still sit on an old base.
    const upstreamRef = await api("GET", `/repos/${UPSTREAM}/git/ref/heads/main`);
    const diff = await api(
      "GET",
      `/repos/${UPSTREAM}/compare/main...${FORK.split("/")[0]}:${BRANCH}`
    ).catch(() => null);
    if (diff !== null && diff.behind_by === 0) {
      console.log(`entry already up to date and branch is current (base ${upstreamRef.object.sha.slice(0, 7)})`);
      return;
    }
    console.log(`entry content is current but the branch is ${diff ? diff.behind_by : "?"} commits behind — rebasing`);
  }
  await sync();
}

/** The PR opened from this fork branch, if it exists. */
async function findPr() {
  const prs = await api("GET", `/repos/${UPSTREAM}/pulls?state=all&per_page=100`);
  return prs.find((pr) => pr.head?.label === `${FORK.split("/")[0]}:${BRANCH}`) ?? null;
}

/**
 * Rewrite an already-open PR's title and body to match this file (the entry
 * file alone is not enough: the title and body carry the same description, and
 * they go stale the same way).
 */
async function refresh() {
  const pr = await findPr();
  if (pr === null) {
    console.log("no PR from this branch — run `open` first");
    process.exitCode = 1;
    return;
  }
  if (pr.title === PR_TITLE && pr.body === PR_BODY) {
    console.log(`PR #${pr.number} is already up to date: ${pr.html_url}`);
    return;
  }
  const updated = await api("PATCH", `/repos/${UPSTREAM}/pulls/${pr.number}`, {
    title: PR_TITLE,
    body: PR_BODY,
  });
  console.log(`updated PR #${updated.number}: ${updated.html_url}`);
}

/**
 * Reopen the PR from this branch. Upstream closes a listing PR whose diff goes
 * empty, so a rebased branch can come back as a closed-but-unmerged PR; this
 * puts it back in the review queue without opening a duplicate.
 */
async function reopen() {
  const pr = await findPr();
  if (pr === null) {
    console.log("no PR from this branch — run `open` first");
    process.exitCode = 1;
    return;
  }
  if (pr.state === "open") {
    console.log(`PR #${pr.number} is already open: ${pr.html_url}`);
    return;
  }
  const diff = await api(
    "GET",
    `/repos/${UPSTREAM}/compare/main...${FORK.split("/")[0]}:${BRANCH}`
  );
  if (diff.ahead_by === 0) {
    console.log("the branch carries no commits over main — run `update` first");
    process.exitCode = 1;
    return;
  }
  const updated = await api("PATCH", `/repos/${UPSTREAM}/pulls/${pr.number}`, {
    state: "open",
  });
  console.log(`reopened #${updated.number} (ahead=${diff.ahead_by}): ${updated.html_url}`);
}

async function open() {
  const eligible = await status();
  if (!eligible) {
    console.log("\nnot eligible yet — the upstream CI rejects a repository younger than a day");
    process.exitCode = 1;
    return;
  }
  const existing = await findPr();
  if (existing) {
    if (existing.state === "open") {
      console.log(`PR already exists: #${existing.number} ${existing.state} ${existing.html_url}`);
      return;
    }
    // A PR whose diff went empty (a two-step branch reset does that) is closed
    // by upstream: reopen it instead of opening a duplicate.
    console.log(`PR #${existing.number} exists but is ${existing.state} — reopening it`);
    await reopen();
    return;
  }
  await sync();
  const diff = await api(
    "GET",
    `/repos/${UPSTREAM}/compare/main...${FORK.split("/")[0]}:${BRANCH}`
  );
  console.log(
    `branch diff vs main: ahead=${diff.ahead_by} behind=${diff.behind_by} files=` +
      diff.files.map((file) => `${file.status} ${file.filename}`).join(", ")
  );
  if (diff.files.length !== 1 || diff.files[0].status !== "added") {
    console.log("\nrefusing to open a PR that is not exactly one added file");
    process.exitCode = 1;
    return;
  }
  const pr = await api("POST", `/repos/${UPSTREAM}/pulls`, {
    title: PR_TITLE,
    head: `${FORK.split("/")[0]}:${BRANCH}`,
    base: "main",
    body: PR_BODY,
  });
  console.log(`opened #${pr.number}: ${pr.html_url}`);
}

/**
 * Write the repository's About line and topics. GitHub keeps the repo About
 * separate from the market entry and from the PR, and nothing syncs them, so
 * this is the only way the repo header stops advertising the previous release.
 */
async function about() {
  const repo = await api("GET", `/repos/${REPO}`);
  if (repo.description === ABOUT) {
    console.log(`about already current: ${ABOUT}`);
  } else {
    await api("PATCH", `/repos/${REPO}`, { description: ABOUT });
    console.log(`about:\n  was: ${repo.description ?? "(none)"}\n  now: ${ABOUT}`);
  }
  const current = repo.topics ?? [];
  if (current.length === TOPICS.length && TOPICS.every((topic) => current.includes(topic))) {
    console.log(`topics already current: ${current.join(", ")}`);
  } else {
    const updated = await api("PUT", `/repos/${REPO}/topics`, { names: TOPICS });
    console.log(`topics: ${(updated.names ?? []).join(", ")}`);
  }
}

const run = { status, update, refresh, reopen, sync, open, about }[action];
if (!run) {
  console.error("usage: node test/market-pr.mjs [status|update|refresh|reopen|sync|open|about]");
  process.exit(2);
}
run().catch((error) => {
  console.error("failed:", error.message);
  process.exit(1);
});
