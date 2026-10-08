#!/usr/bin/env node
// Renders projects.yml into the marked block in README.md.
//
// Run locally:  node scripts/render-projects.mjs
// Check only:   node scripts/render-projects.mjs --check   (exits 1 if stale)
//
// The only thing read from the GitHub API is whether a repo is public, and that
// is only consulted for projects somebody else might use. Personal projects never
// render a link, so their visibility is never queried — which means this renders
// identically with or without a token, and --check is deterministic again.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const START = "<!-- PROJECTS:START -->";
const END = "<!-- PROJECTS:END -->";

/** Personal projects say so and link nothing; everything else links its code. */
const PERSONAL_LABEL = "Personal";

/**
 * Minimal YAML reader for the flat list-of-maps shape projects.yml uses.
 * Avoids a dependency (and an npm install step in CI) for a file this simple.
 * Supports `key: value`, `key: >-` folded blocks, null, and comments.
 */
function parseProjects(text) {
  const items = [];
  let current = null;
  let folding = null; // { key, lines }

  const flushFold = () => {
    if (!folding || !current) return;
    current[folding.key] = folding.lines.join(" ").replace(/\s+/g, " ").trim();
    folding = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim() || /^\s*#/.test(line)) continue;

    // Inside a folded scalar: anything indented deeper than the key belongs to it.
    if (folding && /^\s{4,}\S/.test(line)) {
      folding.lines.push(line.trim());
      continue;
    }
    flushFold();

    const itemStart = line.match(/^-\s+(\w+):\s*(.*)$/);
    if (itemStart) {
      current = {};
      items.push(current);
      assign(current, itemStart[1], itemStart[2]);
      continue;
    }

    const field = line.match(/^\s{2,}(\w+):\s*(.*)$/);
    if (field && current) {
      assign(current, field[1], field[2]);
      continue;
    }
  }
  flushFold();

  function assign(obj, key, value) {
    const v = value.trim();
    if (v === ">-" || v === ">" || v === "|") {
      folding = { key, lines: [] };
      obj[key] = "";
      return;
    }
    if (v === "null" || v === "~" || v === "") {
      obj[key] = null;
      return;
    }
    obj[key] = /^\d+$/.test(v) ? Number(v) : v.replace(/^["']|["']$/g, "");
  }

  return items;
}

/**
 * Pulls last-push date and visibility. Visibility is read from the API rather than
 * kept in the manifest because a `[code]` link to a private repo 404s for every
 * visitor, and flipping a repo public/private should not need a manifest edit.
 */
async function repoMeta(repo, token) {
  if (!repo) return { private: null };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: "application/vnd.github+json",
        "User-Agent": "brycekallio-profile-readme",
      },
    });
    // Unauthenticated, a private repo is indistinguishable from a missing one —
    // both 404. Treat that as private so the link is withheld rather than broken.
    if (res.status === 404) return { private: true };
    if (!res.ok) return { private: null };
    return { private: Boolean((await res.json()).private) };
  } catch {
    return { private: null };
  }
}

function renderTable(projects) {
  const lines = ["| Project | What it is | Code |", "| --- | --- | --- |"];

  for (const p of projects) {
    const publicRepoUrl =
      p.repo && p.private === false ? `https://github.com/${p.repo}` : null;

    // Title links to the live thing if there is one, else the repo, else plain text.
    const href = p.try || publicRepoUrl;
    const title = href ? `**[${p.name}](${href})**` : `**${p.name}**`;

    // Either you can go read it, or you are told plainly that you cannot. A link
    // is only offered when it actually opens for a stranger.
    const code =
      p.access === "personal"
        ? PERSONAL_LABEL
        : publicRepoUrl
          ? `[code](${publicRepoUrl})`
          : PERSONAL_LABEL;

    lines.push(`| ${title} | ${p.sentence ?? ""} | ${code} |`);
  }

  return lines.join("\n");
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const yml = readFileSync(resolve(root, "projects.yml"), "utf8");
const projects = parseProjects(yml).sort(
  (a, b) => (a.order ?? 99) - (b.order ?? 99),
);

if (projects.length === 0) {
  console.error("projects.yml parsed to zero entries — refusing to blank the table.");
  process.exit(1);
}

for (const p of projects) {
  // Personal projects never render a link, so there is nothing to look up.
  p.private = p.access === "personal" ? true : (await repoMeta(p.repo, token)).private;
}

const readmePath = resolve(root, "README.md");
const readme = readFileSync(readmePath, "utf8");

const startIdx = readme.indexOf(START);
const endIdx = readme.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
  console.error(`README.md is missing the ${START} / ${END} markers.`);
  process.exit(1);
}

const next =
  readme.slice(0, startIdx + START.length) +
  "\n" +
  renderTable(projects) +
  "\n" +
  readme.slice(endIdx);

if (next === readme) {
  console.log(`Projects table already current (${projects.length} entries).`);
  process.exit(0);
}

if (process.argv.includes("--check")) {
  console.error("Projects table is stale — run: node scripts/render-projects.mjs");
  process.exit(1);
}

writeFileSync(readmePath, next);
console.log(`Rendered ${projects.length} projects into README.md.`);
