// Generates an animated terminal SVG:
//  - prompts appear instantly (like a real shell prompt)
//  - commands are typed char-by-char with a cursor following along
//  - command output appears quickly line-by-line after the command finishes
//  - in static renderers (no CSS animation) everything is visible
// Output: dist/terminal.svg (self-contained, main.png embedded as base64)
const fs = require("fs");
const path = require("path");

const W = 900;
const TITLE_H = 44;
const PAD = 26;
const LH = 26;
const FS = 15;
const CHW = 9.3; // monospace advance width for ASCII at FS=15
const CHAR_MS = 42; // typing speed per character
const OUT_MS = 45; // output line stagger
const PAUSE_MS = 350; // pause after a command finishes

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const COL = {
  bg: "#090c10",
  titlebar: "#12161d",
  border: "#2b313b",
  user: "#3cf97c",
  path: "#79c0ff",
  cmd: "#e6edf3",
  text: "#c9d1d9",
  dim: "#8b949e",
  key: "#00b0f0",
  pink: "#e53285",
  blue: "#79c0ff",
  green: "#56d364",
  cyan: "#39c5cf",
  red: "#ff7b72",
  purple: "#d2a8ff",
  yellow: "#e3b341",
};

let body = [];
let styles = [];
let styleCount = 0;
let t = 0;

// instantly-visible line (or staggered output line)
function line(x, y, parts, at) {
  const delay = at !== undefined ? at : t;
  if (at === undefined) t += OUT_MS;
  let spans = "";
  for (const [txt, color] of parts) {
    spans += `<tspan fill="${color}">${esc(txt)}</tspan>`;
  }
  body.push(
    `<text class="ln" style="animation-delay:${delay}ms" x="${x}" y="${y}" font-size="${FS}">${spans}</text>`
  );
}

// typed command: prompt is instant, command chars appear one by one,
// cursor block follows the typing and disappears when the line completes
function typedCmd(x, y, cmd, color) {
  const promptParts = [
    ["iris@github", COL.user],
    [":", COL.dim],
    ["~", COL.path],
    ["$ ", COL.dim],
  ];
  let px = x;
  let spans = "";
  for (const [txt, c] of promptParts) {
    spans += `<tspan fill="${c}">${esc(txt)}</tspan>`;
    px += txt.length * CHW;
  }
  // typed chars
  const charDelays = [];
  let cx = px;
  for (let i = 0; i < cmd.length; i++) {
    const d = t + i * CHAR_MS;
    charDelays.push(d);
    spans += `<tspan class="ch" style="animation-delay:${d}ms" fill="${color}">${esc(cmd[i])}</tspan>`;
    cx += CHW;
  }
  body.push(
    `<text x="${x}" y="${y}" font-size="${FS}">${spans}</text>`
  );
  // cursor blocks: one per char interval, each visible only in its window
  const lineEnd = t + cmd.length * CHAR_MS;
  const DUR = lineEnd - t + CHAR_MS; // animation duration for cursor keyframes
  for (let i = 0; i <= cmd.length; i++) {
    const from = (i * CHAR_MS * 100) / DUR;
    const to = ((i + 1) * CHAR_MS * 100) / DUR;
    const cxPos = px + i * CHW;
    const name = `c${styleCount++}`;
    styles.push(
      `@keyframes ${name} { 0%,${from.toFixed(1)}% { opacity: 1; } ${from === 0 ? "" : `${to.toFixed(1)}%,`}100% { opacity: 0; } }`
    );
    body.push(
      `<rect x="${cxPos}" y="${y - FS + 3}" width="${CHW - 1}" height="${FS - 1}" fill="${COL.user}" style="animation:${name} ${DUR}ms forwards; opacity:1"/>`
    );
  }
  t = lineEnd + PAUSE_MS;
  return { endX: px + cmd.length * CHW, endY: y, at: lineEnd };
}

function blinkCursor(x, y, at) {
  body.push(
    `<rect class="cur" style="animation-delay:${at}ms" x="${x}" y="${y - FS + 3}" width="${CHW - 1}" height="${FS - 1}" fill="${COL.user}"/>`
  );
}

// ---------- title bar ----------
body.push(`<rect x="1" y="1" width="${W - 2}" height="${TITLE_H}" fill="${COL.titlebar}"/>`);
["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
  body.push(`<circle cx="${22 + i * 22}" cy="${TITLE_H / 2 + 1}" r="6.5" fill="${c}"/>`);
});
body.push(
  `<text x="${W / 2}" y="${TITLE_H / 2 + 5}" text-anchor="middle" font-size="13" fill="${COL.dim}">iris@github: ~ — zsh</text>`
);

// ---------- $ neofetch ----------
const L0 = TITLE_H + PAD + FS;
const nf = typedCmd(PAD, L0, "neofetch", COL.cmd);

// neofetch output (appears fast, line by line)
const IMG_X = PAD + 6;
const IMG_Y = L0 + 18;
const IMG_W = 290;
const IMG_H = 380;
const png = fs
  .readFileSync(path.join(__dirname, "..", "img", "main.png"))
  .toString("base64");
body.push(
  `<image class="ln" style="animation-delay:${t}ms" x="${IMG_X}" y="${IMG_Y}" width="${IMG_W}" height="${IMG_H}" preserveAspectRatio="xMidYMin meet" href="data:image/png;base64,${png}"/>`
);
t += OUT_MS;

const INFO_X = IMG_X + IMG_W + 40;
const info = [
  [["iris@github", COL.key]],
  [["──────────────────────", COL.pink]],
  [["OS", COL.key], [":        计科院学生 ", COL.text], ["(快过期)", COL.pink]],
  [["Host", COL.key], [":      普普通通双非一本", COL.text]],
  [["Kernel", COL.key], [":    Vibe-coding 4.0", COL.text]],
  [["Uptime", COL.key], [":    大学四年一事无成", COL.text]],
  [["Shell", COL.key], [":     Ciallo～(∠・ω< )⌒★", COL.text]],
  [["Skills", COL.key], [":    算法 · 前后端 · 数据库", COL.text]],
  [["       网络攻防 · 嵌入式 · 路由交换", COL.text]],
  [["       数据分析 · MMD神秘视频", COL.text]],
  [["       文学 · 哲学 · 政治", COL.text]],
  [["Weakness", COL.key], [": 听! 不! 懂! ", COL.text], ["(不要聊太深奥)", COL.pink]],
  [["Habit", COL.key], [":    挖一万个新坑, 不填", COL.text]],
  [["Aliases", COL.key], [":  Iris · 鸢尾 · 月", COL.text]],
  [["       ~~小爱同学~~ ", COL.text], ["(不是那个新世界的卡密)", COL.pink]],
];
const INFO_Y0 = IMG_Y + FS;
info.forEach((parts, i) => {
  line(INFO_X, INFO_Y0 + i * LH, parts);
});

// neofetch color palette
const palY = INFO_Y0 + info.length * LH + 14;
[COL.pink, "#ff7b72", "#e3b341", "#3cf97c", COL.key, "#79c0ff", "#d2a8ff", "#39c5cf"].forEach(
  (c, i) => {
    body.push(
      `<rect class="ln" style="animation-delay:${t}ms" x="${INFO_X + i * 34}" y="${palY}" width="28" height="13" fill="${c}"/>`
    );
  }
);
t += OUT_MS;

// ---------- $ ls ~/skills/ ----------
const LS_Y = palY + 46;
const ls = typedCmd(PAD, LS_Y, "ls ~/skills/", COL.cmd);

const lsItems = [
  ["C", COL.blue], ["C++", COL.blue], ["Python", COL.green], ["Java", COL.blue],
  ["MySQL", COL.green], ["Linux", COL.green], ["Docker", COL.cyan], ["嵌入式", COL.purple],
  ["信息安全", COL.red], ["路由交换", COL.cyan], ["MMD", COL.red], ["科研绘图", COL.yellow],
];
const COL_W = [0, 120, 250, 410];
lsItems.forEach(([name, color], i) => {
  const row = Math.floor(i / 4);
  const colX = PAD + 14 + COL_W[i % 4];
  line(colX, LS_Y + (row + 1) * LH, [[name, color]]);
});

// ---------- $ exit ----------
const EXIT_Y = LS_Y + 4 * LH + 16;
const ex = typedCmd(PAD, EXIT_Y, "exit", COL.cmd);
blinkCursor(ex.endX, ex.endY, ex.at);

// ---------- assemble ----------
const H = EXIT_Y + PAD + 10;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'JetBrains Mono','Noto Sans Mono CJK SC','Cascadia Code',Consolas,monospace">
<style>
  .ln { animation: ap .12s ease-out both; }
  .ch { animation: ap .05s steps(1) both; }
  @keyframes ap { from { opacity: 0; } to { opacity: 1; } }
  .cur { animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
  ${styles.join("\n  ")}
</style>
<defs>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
    <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000" flood-opacity="0.55"/>
  </filter>
</defs>
<rect width="${W}" height="${H}" fill="none"/>
<g filter="url(#shadow)">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="${COL.bg}" stroke="${COL.border}" stroke-width="1.5"/>
  ${body.join("\n  ")}
</g>
</svg>`;

fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "dist", "terminal.svg"), svg);
console.log(`terminal.svg: ${W}x${H}, anim ends ~${t}ms, keyframes: ${styleCount}`);
