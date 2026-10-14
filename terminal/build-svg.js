// Generates an animated CRT terminal SVG, fully driven by terminal.yml (repo root).
// Layout is adaptive: every command block measures the lines it will occupy,
// so adding/removing content shifts subsequent commands automatically.
// {commits} / {stars} markers in terminal.yml are resolved from live GitHub data.
// Usage: node build-svg.js   (requires: npm install js-yaml)
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const raw = fs.readFileSync(path.join(__dirname, "..", "terminal.yml"), "utf8");

// fetch live GitHub stats; falls back to "?" offline
async function fetchStats(user) {
  const out = { commits: "?", stars: "?" };
  try {
    const hdr = process.env.GITHUB_TOKEN
      ? { "User-Agent": "terminal-svg", Authorization: `token ${process.env.GITHUB_TOKEN}` }
      : { "User-Agent": "terminal-svg" };
    const years = await fetch(
      `https://github-contributions-api.jogruber.de/v4/${user}`
    ).then((r) => {
      if (!r.ok) throw new Error(`contributions API ${r.status}`);
      return r.json();
    });
    if (years && years.total) {
      // total is {year: count, ...} — sum all years
      const tot = years.total;
      const sum = typeof tot === "number" ? tot : Object.values(tot).reduce((a, b) => a + b, 0);
      out.commits = String(sum);
    }    const repos = await fetch(
      `https://api.github.com/users/${user}/repos?per_page=100`,
      { headers: hdr }
    ).then((r) => {
      if (!r.ok) throw new Error(`repos API ${r.status}`);
      return r.json();
    });
    if (Array.isArray(repos))
      out.stars = String(repos.reduce((s, r) => s + r.stargazers_count, 0));
    // per-repo stats for ls -a -l ~/repos/
    const repoStats = {};
    for (const fullName of process.env.REPO_LIST ? process.env.REPO_LIST.split(",") : []) {
      const [owner, name] = fullName.split("/");
      try {
        const info = await fetch(`https://api.github.com/repos/${fullName}`, {
          headers: hdr,
        }).then((r) => r.json());
        const contributors = await fetch(
          `https://api.github.com/repos/${fullName}/contributors?per_page=100&anon=1`,
          { headers: hdr }
        ).then((r) => r.json());
        const commits = await fetch(
          `https://api.github.com/repos/${fullName}/commits?per_page=1`,
          { headers: hdr }
        ).then((r) => {
          const n = r.headers.get("link");
          const m = n && n.match(/page=(\d+)>; rel="last"/);
          return m ? Number(m[1]) : 1;
        });
        repoStats[name] = {
          owner,
          stars: info.stargazers_count ?? "?",
          contributors: Array.isArray(contributors) ? contributors.length : "?",
          commits: commits ?? "?",
          updated: info.pushed_at ? info.pushed_at.slice(0, 10) : "?",
        };
      } catch (e) {
        repoStats[name] = { owner, stars: "?", contributors: "?", commits: "?", updated: "?" };
      }
    }
    out.repoStats = repoStats;
  } catch (e) {
    console.warn("stats fetch failed, using cached/fallback:", e.message);
    // fall back to last known good stats (avoids '?' during API rate limits)
    try {
      const cached = JSON.parse(
        fs.readFileSync(path.join(__dirname, "stats-cache.json"), "utf8")
      );
      Object.assign(out, cached);
    } catch (_) {
      /* no cache — keep '?' */
    }
  }
  // persist for next run
  if (out.stars !== "?" && out.commits !== "?") {
    fs.writeFileSync(
      path.join(__dirname, "stats-cache.json"),
      JSON.stringify(out, null, 2)
    );
  }
  return out;
}

// ---- render constants ----
const W = 900;
const PAD = 40;
const TITLE_PAD = 46; // space above first line
const LH = 27; // line height
const FS = 15;
const CHW = 8.7; // monospace advance width
const CJK_W = 15.5; // CJK glyph advance width
const CHAR_MS = 42; // typing speed
const OUT_MS = 45; // output line stagger
const PAUSE_MS = 350; // pause after each command
const BLOCK_GAP = 18; // gap between command blocks

// phosphor green palette
const G = { bright: "#aaffb0", main: "#3dff7a", mid: "#2ecc66", dim: "#1f9948" };

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// parse {bright}...{/} and {dim}...{/} markers into tspans
function spans(text) {
  let out = "";
  const re = /\{(bright|dim)\}([\s\S]*?)\{\/\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    out += `<tspan fill="${G.main}">${esc(text.slice(last, m.index))}</tspan>`;
    out += `<tspan fill="${m[1] === "bright" ? G.bright : G.dim}">${esc(m[2])}</tspan>`;
    last = m.index + m[0].length;
  }
  out += `<tspan fill="${G.main}">${esc(text.slice(last))}</tspan>`;
  return out;
}

// visual width: ASCII counts 1, CJK counts ~1.8 (for advance estimates)
function vwidth(text) {
  let w = 0;
  for (const ch of text.replace(/\{(bright|dim)\}|\{\/\}/g, "")) {
    w += ch.charCodeAt(0) > 0x2e7f ? CJK_W : CHW;
  }
  return w;
}

function render(CFG, stats) {
  let body = [];
  let t = 0; // animation clock (no longer used for delays, kept for future)

  function textLine(x, y, content, at) {
    const delay = at !== undefined ? at : t;
    if (at === undefined) t += OUT_MS;
    const inner = Array.isArray(content)
      ? content.map(([txt, c]) => `<tspan fill="${c}">${esc(txt)}</tspan>`).join("")
      : spans(content);
    body.push(
      `<text class="ln" x="${x}" y="${y}" font-size="${FS}">${inner}</text>`
    );
  }

  // typed command line; prompt instant, command char-by-char, cursor follows
  function typedCmd(x, y, cmd) {
    const p = { user: "user", path: "~", ...CFG.prompt };
    if (p.path === null || p.path === undefined) p.path = "~";
    const promptParts = [
      [p.user, G.bright],
      [":", G.mid],
      [p.path, G.main],
      ["$ ", G.mid],
    ];
    let px = x;
    let spansOut = "";
    for (const [txt, c] of promptParts) {
      spansOut += `<tspan fill="${c}">${esc(txt)}</tspan>`;
      px += vwidth(txt);
    }
    for (let i = 0; i < cmd.length; i++) {
      spansOut += `<tspan class="ch" fill="${G.bright}">${esc(cmd[i])}</tspan>`;
    }
    body.push(`<text x="${x}" y="${y}" font-size="${FS}">${spansOut}</text>`);
    return { endX: px + vwidth(cmd), endY: y };
  }

  function blinkCursor(x, y) {
    body.push(
      `<rect class="cur" x="${x}" y="${y - FS + 3}" width="${CHW - 1}" height="${FS - 1}" fill="${G.bright}"/>`
    );
  }

  // ---------- adaptive layout ----------
  let y = TITLE_PAD + FS; // first baseline
  let lastCursor = null;

  for (const cmd of CFG.commands) {
    const name = Object.keys(cmd).find((k) => k !== "run");
    const spec = cmd[name];

    // measure how many lines this block occupies (for adaptive positioning)
    let columns = 1;
    if (name === "neofetch" && spec) {
      // handled inside; avatar auto-sizes to text block
    } else if (name === "ls" && spec) {
      columns = spec.columns || 4;
    }

    // typed command at current y
    const c = typedCmd(PAD, y, cmd.run);

    // output starts one line below
    let oy = y + LH;
    if (name === "neofetch" && spec) {
      const IMG_X = PAD + 6;
      const infoLines = (spec.lines ? spec.lines.length : 0) + 1 + (spec.palette ? 1 : 0);
      const imgH = infoLines * LH - 8;
      const pngBuf = fs.readFileSync(path.join(__dirname, "..", CFG.avatar.image));
      const pngW = pngBuf.readUInt32BE(16);
      const pngH = pngBuf.readUInt32BE(20);
      const imgW = Math.min(CFG.avatar.width, Math.round(imgH * (pngW / pngH)));
      const IMG_Y = oy - FS + 3;
      body.push(
        `<image class="ln" x="${IMG_X}" y="${IMG_Y}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMin meet" filter="url(#greenify)" href="data:image/png;base64,${pngBuf.toString("base64")}"/>`
      );
      t += OUT_MS;

      const INFO_X = IMG_X + imgW + 40;
      let iy = oy;
      textLine(INFO_X, iy, [[spec.title || CFG.prompt.user, G.bright]]);
      iy += LH;
      if (spec.lines) {
        for (const ln of spec.lines) {
          textLine(INFO_X, iy, ln);
          iy += LH;
        }
      }
      if (spec.palette) {
        const py = iy - FS + 3;
        [G.bright, G.main, G.mid, G.dim, G.bright, G.main, G.mid, G.dim].forEach(
          (col, i) => {
            body.push(
              `<rect class="ln" x="${INFO_X + i * 34}" y="${py}" width="28" height="13" fill="${col}"/>`
            );
          }
        );
        t += OUT_MS;
        iy += LH;
      }
      oy = Math.max(iy, IMG_Y + imgH + FS);
    } else if (name === "ls" && spec) {
      // fixed column anchors (CJK-safe): widths in char units
      const rows = Math.ceil(spec.items.length / columns);
      const colW = [];
      for (let cI = 0; cI < columns; cI++) {
        let longest = 0;
        for (let r = 0; r < rows; r++) {
          const item = spec.items[r * columns + cI];
          if (item) longest = Math.max(longest, vwidth(item) / CHW); // chars
        }
        colW.push(longest + 3);
      }
      const shades = [G.bright, G.main, G.mid];
      spec.items.forEach((item, i) => {
        const row = Math.floor(i / columns);
        const colI = i % columns;
        // anchor: sum of previous column widths, in char units -> x pixels
        let charOffset = 0;
        for (let cI = 0; cI < colI; cI++) charOffset += colW[cI];
        const cx = PAD + 14 + charOffset * CHW;
        textLine(cx, oy + row * LH, [[item, shades[i % 3]]]);
      });
      oy += rows * LH;
    } else if (name === "ls_repos" && spec) {
      // long-format ls, monospace-aligned:
      //   -rwxr-xr-x   CONTRIB   STARS   COMMITS  UPDATED      REPO
      const PERM = "-rwxr-xr-x";
      const rowsData = (spec.repos || []).map((r) => {
        const s = (stats && stats.repoStats && stats.repoStats[r]) || {};
        return [
          String(s.contributors ?? "?"),
          String(s.stars ?? "?"),
          String(s.commits ?? "?"),
          String(s.updated ?? "?"),
          r,
        ];
      });
      // fixed monospace grid: header and data share the same column anchors
      // char offsets: perm=0..9, contrib right-aligns at 20, stars at 30, commits at 41, updated=44, repo=57
      const X0 = PAD + 14;
      const CX = {
        perm: X0,
        contrib: X0 + 20 * CHW,
        stars: X0 + 30 * CHW,
        commits: X0 + 41 * CHW,
        updated: X0 + 44 * CHW,
        repo: X0 + 57 * CHW,
      };
      // header: CONTRIB/STARS/COMMITS right-aligned to match numeric columns
      const headerParts = [
        [PERM, CX.perm, G.dim],
        ["CONTRIB", CX.contrib, G.dim, "end"],
        ["STARS", CX.stars, G.dim, "end"],
        ["COMMITS", CX.commits, G.dim, "end"],
        ["UPDATED", CX.updated, G.dim],
        ["REPO", CX.repo, G.dim],
      ];
      let hline = "";
      for (const [txt, x, c, anchor] of headerParts) {
        hline += `<tspan x="${x}" fill="${c}"${anchor ? ` text-anchor="${anchor}"` : ""}>${esc(txt)}</tspan>`;
      }
      body.push(
        `<text class="ln" x="0" y="${oy}" font-size="${FS}">${hline}</text>`
      );
      t += OUT_MS;
      let ry = oy + LH;
      rowsData.forEach((row) => {
        // numbers right-aligned like real ls -l: text-anchor="end" at column right edge
        const cells = [
          [PERM, CX.perm, G.dim],
          [row[0], CX.contrib, G.main, "end"],
          [row[1], CX.stars, G.main, "end"],
          [row[2], CX.commits, G.main, "end"],
          [row[3], CX.updated, G.main],
          [row[4], CX.repo, G.bright],
        ];
        let line = "";
        for (const [txt, x, c, anchor] of cells) {
          line += `<tspan x="${x}" fill="${c}"${anchor ? ` text-anchor="${anchor}"` : ""}>${esc(txt)}</tspan>`;
        }
        body.push(
          `<text class="ln" x="0" y="${ry}" font-size="${FS}">${line}</text>`
        );
        t += OUT_MS;
        ry += LH;
      });
      oy = ry;
    }

    y = Math.max(oy + BLOCK_GAP, y + LH + LH);
    lastCursor = c;
  }

  // blinking cursor after the final command
  blinkCursor(lastCursor.endX, lastCursor.endY);

  // ---------- CRT screen ----------
  const H = Math.ceil(y + PAD - BLOCK_GAP + 10);
  const BX = 10;
  const BOW = 16;
  const screenPath =
    `M ${BX} ${BOW} ` +
    `Q ${W / 2} 0 ${W - BX} ${BOW} ` +
    `Q ${W + BX * 1.6} ${H / 2} ${W - BX} ${H - BOW} ` +
    `Q ${W / 2} ${H} ${BX} ${H - BOW} ` +
    `Q ${-BX * 1.6} ${H / 2} ${BX} ${BOW} Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'JetBrains Mono','Noto Sans Mono CJK SC','Cascadia Code',Consolas,monospace">
<style>
  .ln { opacity: 1; }
  .ch { opacity: 1; }
  .flicker { animation: flick 4s linear infinite; }
  @keyframes flick { 0%,100% { opacity: 1; } 96% { opacity: 1; } 97% { opacity: .92; } 98% { opacity: 1; } }
</style>
<defs>
  <filter id="greenify" x="0" y="0" width="100%" height="100%">
    <feColorMatrix type="matrix" values="0.05 0 0 0 0  0.35 0.7 0 0 0  0.05 0 0 0 0  0 0 0 1 0"/>
  </filter>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="1.6" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <radialGradient id="vig" cx="50%" cy="50%" r="75%">
    <stop offset="55%" stop-color="#000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
  </radialGradient>
  <pattern id="scan" width="1" height="3" patternUnits="userSpaceOnUse">
    <rect width="1" height="2" fill="#000" fill-opacity="0.38"/>
    <rect y="2" width="1" height="1" fill="#000" fill-opacity="0"/>
  </pattern>
</defs>
<g class="flicker">
  <path d="${screenPath}" fill="#020a04" stroke="#0f3d1f" stroke-width="3"/>
  <path d="${screenPath}" fill="#03150a"/>
  <clipPath id="screen"><path d="${screenPath}"/></clipPath>
  <g clip-path="url(#screen)">
    <g filter="url(#glow)">
      ${body.join("\n  ")}
    </g>
    <path d="${screenPath}" fill="url(#scan)"/>
    <path d="${screenPath}" fill="#2bff70" fill-opacity="0.045"/>
    <path d="${screenPath}" fill="url(#vig)"/>
  </g>
  <path d="${screenPath}" fill="none" stroke="#1f7a3d" stroke-width="1.2" opacity="0.7"/>
</g>
</svg>`;
}

// ---------- main ----------
(async () => {
  const cfg0 = yaml.load(raw);
  const user = (cfg0.prompt && cfg0.prompt.github) || cfg0.prompt.user.split("@")[0];
  // collect repos from ls_repos blocks so fetchStats can grab their stats
  const repoList = [];
  for (const cmd of cfg0.commands || []) {
    if (cmd.ls_repos && Array.isArray(cmd.ls_repos.repos)) {
      for (const r of cmd.ls_repos.repos) repoList.push(`${user}/${r}`);
    }
  }
  process.env.REPO_LIST = repoList.join(",");
  const stats = await fetchStats(user);
  const resolved = raw
    .replace(/\{commits\}/g, stats.commits)
    .replace(/\{stars\}/g, stats.stars);
  const CFG = yaml.load(resolved);
  const svg = render(CFG, stats);
  fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "dist", "terminal.svg"), svg);
  console.log(`terminal.svg (CRT): commits=${stats.commits} stars=${stats.stars}`);
})();
