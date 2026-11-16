#!/usr/bin/env node
// Builds the logo ticker that sits under the BRYCE banner in README.md.
//
// Run:  node scripts/render-ticker.mjs
// Out:  ticker-dark.svg, ticker-light.svg
//
// GitHub strips scripts and CSS from READMEs, so a moving strip has to be an
// image. An SVG loaded through <img> may still animate itself with CSS, which is
// all this is: one row of logos, drawn twice, sliding left by exactly one row.
//
// Two files because an <img> SVG cannot see GitHub's theme; the README picks
// between them with <picture>.
//
// Each logo in logos/ is the project's own icon in its own brand colours, copied
// from that project's brand kit. `name.dark.svg`, when present, is the variant the
// kit prescribes for dark grounds. Only the labels and rules take the grey ink.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Order follows projects.yml. Only projects with a decided logo appear.
const ITEMS = [
  { file: "mece", label: "MECE & Co." },
  { file: "coffee", label: "Coffee" },
  { file: "hgb", label: "HGB Capital" },
  { file: "ai-club", label: "AI Club" },
  { file: "poc", label: "POC" },
  { file: "diffuse", label: "Diffuse" },
  { file: "rig", label: "Rig" },
  { file: "inform", label: "Inform-AI-tion" },
];

const VIEW_W = 1280; // matches bryce.svg so the two line up at width="100%"
const VIEW_H = 76;
const ICON = 38; // logo box, px
const FONT = 14;
const TRACK = 2.2; // letter-spacing
const CHAR_W = FONT * 0.6 + TRACK; // monospace advance
const GAP_ICON = 18;
const GAP_ITEM = 120;
const SPEED = 32; // px per second

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function logo(file, theme, x, y) {
  const themed = resolve(root, "logos", `${file}.${theme}.svg`);
  const svg = readFileSync(existsSync(themed) ? themed : resolve(root, "logos", `${file}.svg`), "utf8");
  const open = svg.match(/<svg\b[^>]*>/)[0];
  const [, , vw, vh] = open.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const viewBox = open.match(/viewBox="([^"]+)"/)[1];
  const inner = svg.slice(svg.indexOf(open) + open.length, svg.lastIndexOf("</svg>")).trim();
  // Fit inside the ICON box, keeping proportions, centred.
  const scale = Math.min(ICON / vw, ICON / vh);
  const w = vw * scale;
  const h = vh * scale;
  // Presentation attributes on the source <svg> (stroke, fill…) must survive.
  const attrs = [...open.matchAll(/\s(fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)="([^"]*)"/g)]
    .map((m) => ` ${m[1]}="${m[2]}"`)
    .join("");
  return {
    w,
    markup: `<svg x="${x.toFixed(1)}" y="${(y + (ICON - h) / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${viewBox}"${attrs}>${inner}</svg>`,
  };
}

function row(theme) {
  let x = 0;
  const parts = [];
  const top = (VIEW_H - ICON) / 2;
  for (const item of ITEMS) {
    const { w, markup } = logo(item.file, theme, x, top);
    parts.push(markup);
    x += w + GAP_ICON;
    const text = item.label.toUpperCase();
    parts.push(`<text class="label" x="${x.toFixed(1)}" y="${VIEW_H / 2 + FONT * 0.36}">${esc(text)}</text>`);
    x += text.length * CHAR_W + GAP_ITEM / 2;
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${VIEW_H / 2}" r="1.6" opacity=".5"/>`);
    x += GAP_ITEM / 2;
  }
  return { width: Math.ceil(x), markup: parts.join("\n    ") };
}

function build(theme, ink) {
  const { width, markup } = row(theme);
  const copies = Math.ceil(VIEW_W / width) + 1;
  const uses = Array.from({ length: copies - 1 }, (_, i) => `<use href="#row" x="${width * (i + 1)}"/>`).join("");
  const seconds = Math.round(width / SPEED);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="Projects: ${esc(ITEMS.map((i) => i.label).join(", "))}" color="${ink}">
<title>What I'm building</title>
<style>
  .track { animation: slide ${seconds}s linear infinite; }
  @keyframes slide { to { transform: translateX(-${width}px); } }
  @media (prefers-reduced-motion: reduce) { .track { animation: none; } }
  .label { font: 500 ${FONT}px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; letter-spacing: ${TRACK}px; }
</style>
<defs>
  <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/>
    <stop offset=".09" stop-color="#fff"/>
    <stop offset=".91" stop-color="#fff"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <mask id="edges" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW_W}" height="${VIEW_H}">
    <rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#fade)"/>
  </mask>
</defs>
<g mask="url(#edges)" fill="currentColor">
  <rect x="0" y="0.5" width="${VIEW_W}" height="1" opacity=".28"/>
  <rect x="0" y="${VIEW_H - 1.5}" width="${VIEW_W}" height="1" opacity=".28"/>
  <g class="track">
    <g id="row">
    ${markup}
    </g>
    ${uses}
  </g>
</g>
</svg>
`;
}

// Inks are GitHub's own muted-text greys, so the strip sits at the same volume
// as secondary text on each theme.
writeFileSync(resolve(root, "ticker-dark.svg"), build("dark", "#9198a1"));
writeFileSync(resolve(root, "ticker-light.svg"), build("light", "#59636e"));
console.log(`Rendered ticker (${ITEMS.length} logos, row ${row("light").width}px).`);
