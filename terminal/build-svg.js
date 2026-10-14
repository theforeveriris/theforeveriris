// Generates an animated terminal SVG (line-by-line reveal, blinking cursor).
// Output: dist/terminal.svg  (self-contained, main.png embedded as base64)
const fs = require("fs");
const path = require("path");

const W = 900;
const TITLE_H = 44;
const BODY_PAD = 26;
const LH = 26; // line height
const FS = 15; // font size

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
  // ls colors
  blue: "#79c0ff",
  green: "#56d364",
  cyan: "#39c5cf",
  red: "#ff7b72",
  purple: "#d2a8ff",
  yellow: "#e3b341",
};

let body = [];
let delays = [];
let t = 0; // global time cursor (ms)
const STEP = 130; // per-line reveal delay

// text line: parts = [[text, color], ...]
function line(x, y, parts, opts = {}) {
  const delay = opts.at !== undefined ? opts.at : t;
  if (opts.at === undefined) t += STEP;
  let spans = "";
  for (const [txt, color] of parts) {
    spans += `<tspan fill="${color}">${esc(txt)}</tspan>`;
  }
  body.push(
    `<text class="ln" style="animation-delay:${delay}ms" x="${x}" y="${y}" font-size="${FS}">${spans}</text>`
  );
}

function cursor(x, y, at) {
  body.push(
    `<rect class="cur" x="${x}" y="${y - FS + 3}" width="9" height="${FS}" fill="${COL.user}" style="animation-delay:${at}ms"/>`
  );
}

// ---------- title bar ----------
body.push(`<rect x="1" y="1" width="${W - 2}" height="${TITLE_H}" fill="${COL.titlebar}"/>`);
const dots = ["#ff5f57", "#febc2e", "#28c840"];
dots.forEach((c, i) => {
  body.push(`<circle cx="${22 + i * 22}" cy="${TITLE_H / 2 + 1}" r="6.5" fill="${c}"/>`);
});
body.push(
  `<text x="${W / 2}" y="${TITLE_H / 2 + 5}" text-anchor="middle" font-size="13" fill="${COL.dim}">iris@github: ~ — zsh</text>`
);

// ---------- body ----------
const L0 = TITLE_H + BODY_PAD + FS; // first baseline

// $ neofetch
line(BODY_PAD, L0, [
  ["iris@github", COL.user],
  [":", COL.dim],
  ["~", COL.path],
  ["$ ", COL.dim],
  ["neofetch", COL.cmd],
]);
cursor(BODY_PAD + 9 * 9, L0, t);

// neofetch block
const IMG_X = BODY_PAD + 6;
const IMG_Y = L0 + 18;
const IMG_W = 290;
const IMG_H = 380;
const png = fs
  .readFileSync(path.join(__dirname, "..", "img", "main.png"))
  .toString("base64");
body.push(
  `<image class="ln" style="animation-delay:${t}ms" x="${IMG_X}" y="${IMG_Y}" width="${IMG_W}" height="${IMG_H}" preserveAspectRatio="xMidYMin meet" rx="10" href="data:image/png;base64,${png}"/>`
);
t += STEP;

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
const palette = [
  COL.pink, "#ff7b72", "#e3b341", "#3cf97c",
  COL.key, "#79c0ff", "#d2a8ff", "#39c5cf",
];
palette.forEach((c, i) => {
  body.push(
    `<rect class="ln" style="animation-delay:${t}ms" x="${INFO_X + i * 34}" y="${palY}" width="28" height="13" fill="${c}"/>`
  );
});
t += STEP;

// $ ls ~/skills/
const LS_Y = palY + 40;
line(BODY_PAD, LS_Y, [
  ["iris@github", COL.user],
  [":", COL.dim],
  ["~", COL.path],
  ["$ ", COL.dim],
  ["ls ~/skills/", COL.cmd],
]);

// ls output: 4 columns, 3 rows, colorful, aligned
const lsItems = [
  ["C", COL.blue], ["C++", COL.blue], ["Python", COL.green], ["Java", COL.blue],
  ["MySQL", COL.green], ["Linux", COL.green], ["Docker", COL.cyan], ["嵌入式", COL.purple],
  ["信息安全", COL.red], ["路由交换", COL.cyan], ["MMD", COL.red], ["科研绘图", COL.yellow],
];
const COL_W = [0, 120, 250, 410];
lsItems.forEach(([name, color], i) => {
  const row = Math.floor(i / 4);
  const colX = BODY_PAD + 14 + COL_W[i % 4];
  line(colX, LS_Y + (row + 1) * LH, [[name, color]]);
});

// $ exit
const EXIT_Y = LS_Y + 4 * LH + 16;
line(BODY_PAD, EXIT_Y, [
  ["iris@github", COL.user],
  [":", COL.dim],
  ["~", COL.path],
  ["$ ", COL.dim],
  ["exit", COL.cmd],
]);
cursor(BODY_PAD + 9 * 9, EXIT_Y, t);
t += STEP;

// ---------- assemble ----------
const H = EXIT_Y + BODY_PAD + 10;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'JetBrains Mono','Noto Sans Mono CJK SC','Cascadia Code',Consolas,monospace">
<style>
  .ln { animation: ap .18s ease-out both; }
  @keyframes ap { from { opacity: 0; } to { opacity: 1; } }
  .cur { animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
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
console.log(`terminal.svg written: ${W}x${H}, total anim time ~${t}ms`);
