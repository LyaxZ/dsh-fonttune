/**
 * Diagnose the market listing PR: state, comments, CI results and the fork
 * branch itself.
 *
 *   node test/market-inspect.mjs [pr-number]
 *
 * The upstream repository runs a bot that validates an entry and can close a PR
 * on its own (an empty diff during a branch reset is enough), so "why is my PR
 * closed?" is answered by the branch diff plus the comments and check runs of
 * the head commit rather than by the PR state alone.
 *
 * @module dsh-fonttune/test/market-inspect
 */
import { execFileSync } from "node:child_process";

const UPSTREAM = "awesome-dsh-plugin/awesome-dsh-plugin";
const FORK = "LyaxZ/awesome-dsh-plugin";
const BRANCH = "fonttune-entry";
const FORK_OWNER = FORK.split("/")[0];
const PATH = "data/plugins/LyaxZ__dsh-fonttune.yml";

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

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `token ${AUTH}`,
      accept: "application/vnd.github+json",
      "user-agent": "dsh-fonttune",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const wanted = process.argv[2];
let pr = null;
if (wanted !== undefined) {
  pr = await api(`/repos/${UPSTREAM}/pulls/${wanted}`);
} else {
  const all = await api(`/repos/${UPSTREAM}/pulls?state=all&per_page=100`);
  pr =
    all.find((item) => item.head?.label === `${FORK_OWNER}:${BRANCH}`) ??
    all.find((item) => item.head?.ref === BRANCH) ??
    null;
}
if (pr === null) {
  console.log("no PR from this branch");
  process.exit(0);
}

console.log(`#${pr.number} state=${pr.state} merged=${pr.merged} draft=${pr.draft}`);
console.log(`title: ${pr.title}`);
console.log(`head:  ${pr.head.label} @ ${pr.head.sha}`);
console.log(`base:  ${pr.base.label} @ ${pr.base.sha}`);
console.log(`created=${pr.created_at} closed=${pr.closed_at} merged_at=${pr.merged_at}`);
console.log(`mergeable_state=${pr.mergeable_state}`);
console.log(`changed_files=${pr.changed_files} additions=${pr.additions} deletions=${pr.deletions}`);

// The branch is the real source of truth: a PR can look empty (or stale) while
// the branch already carries the entry, or the other way round.
const ref = await api(`/repos/${FORK}/git/ref/heads/${BRANCH}`).catch(() => null);
console.log(`\nfork ${BRANCH}: ${ref === null ? "MISSING" : ref.object.sha}`);
const compare = await api(
  "GET",
  `/repos/${UPSTREAM}/compare/main...${FORK_OWNER}:${BRANCH}`
).catch(() => null);
if (compare !== null) {
  console.log(
    `compare vs main: ahead=${compare.ahead_by} behind=${compare.behind_by} files=` +
      (compare.files ?? []).map((file) => `${file.status} ${file.filename}`).join(", ")
  );
}
const entry = await api(`/repos/${FORK}/contents/${PATH}?ref=${BRANCH}`).catch(() => null);
console.log(`entry on the branch: ${entry === null ? "MISSING" : entry.sha}`);
const merged = await api(`/repos/${UPSTREAM}/contents/${PATH}`).catch(() => null);
console.log(`entry upstream: ${merged === null ? "not merged yet" : "present"}`);

// The listing text lives in three places that go stale independently: the entry
// file, the PR text and the GitHub About of the plugin repository.
const repo = await api("/repos/LyaxZ/dsh-fonttune");
console.log(`\nrepo About: ${repo.description ?? "(none)"}`);
const topics = await api("/repos/LyaxZ/dsh-fonttune/topics");
console.log(`repo topics: ${(topics.names ?? []).join(", ")}`);

const comments = await api(`/repos/${UPSTREAM}/issues/${pr.number}/comments?per_page=100`);
console.log(`\n--- comments (${comments.length}) ---`);
for (const comment of comments) {
  const body = String(comment.body ?? "").replace(/\r?\n/g, " | ");
  console.log(`[${comment.user.login} ${comment.created_at}] ${body.slice(0, 600)}`);
}

const reviews = await api(`/repos/${UPSTREAM}/pulls/${pr.number}/reviews?per_page=100`);
console.log(`\n--- reviews (${reviews.length}) ---`);
for (const review of reviews) {
  const body = String(review.body ?? "").replace(/\r?\n/g, " | ");
  console.log(`[${review.user.login} ${review.state}] ${body.slice(0, 300)}`);
}

const checkRuns = await api(`/repos/${UPSTREAM}/commits/${pr.head.sha}/check-runs?per_page=100`);
console.log(`\n--- check runs on ${pr.head.sha.slice(0, 7)} (${checkRuns.total_count}) ---`);
for (const run of checkRuns.check_runs ?? []) {
  console.log(`[${run.name}] ${run.status}/${run.conclusion ?? "-"} ${run.html_url}`);
}

const statuses = await api(`/repos/${UPSTREAM}/commits/${pr.head.sha}/status`);
console.log(`\n--- commit status: ${statuses.state} (${statuses.statuses.length}) ---`);
for (const status of statuses.statuses) {
  console.log(`[${status.context}] ${status.state} ${status.description ?? ""} ${status.target_url ?? ""}`);
}
