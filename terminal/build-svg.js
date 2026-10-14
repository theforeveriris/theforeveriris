// Generates an animated CRT (cathode-ray tube) terminal SVG:
//  - no window chrome, just the phosphor screen
//  - phosphor-green text with glow, brightness hierarchy instead of colors
//  - scanlines (thin transparent gaps between rows)
//  - vignette + curved screen edges bulging slightly at the sides (CRT perspective)
//  - char-by-char typing with trailing cursor, fast line output
// Output: dist/terminal.svg (self-contained, main.png embedded as base64, green-tinted)
const fs = require("fs");
const path = require("path");

const W = 900;
const H = 740;
const PAD = 40;
const TOP = 46;
const LH = 27;
const FS = 15;
const CHW = 9.3;
const CHAR_MS = 42;
const OUT_MS = 45;
const PAUSE_MS = 350;

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// phosphor green palette (brightness hierarchy only, like a real mono CRT)
const G = {
  bright: "#aaffb0", // freshly written / emphasized
  main: "#3dff7a", // normal text
  mid: "#2ecc66", // secondary
  dim: "#1f9948", // de-emphasized
  glow: "#2bff70",
};

let body = [];
let styles = [];
let styleCount = 0;
let t = 0;

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

function typedCmd(x, y, cmd) {
  const promptParts = [
    ["iris@github", G.bright],
    [":", G.mid],
    ["~", G.main],
    ["$ ", G.mid],
  ];
  let px = x;
  let spans = "";
  for (const [txt, c] of promptParts) {
    spans += `<tspan fill="${c}">${esc(txt)}</tspan>`;
    px += txt.length * CHW;
  }
  for (let i = 0; i < cmd.length; i++) {
    const d = t + i * CHAR_MS;
    spans += `<tspan class="ch" style="animation-delay:${d}ms" fill="${G.bright}">${esc(cmd[i])}</tspan>`;
  }
  body.push(`<text x="${x}" y="${y}" font-size="${FS}">${spans}</text>`);

  const lineEnd = t + cmd.length * CHAR_MS;
  const DUR = lineEnd - t + CHAR_MS;
  for (let i = 0; i <= cmd.length; i++) {
    const from = (i * CHAR_MS * 100) / DUR;
    const to = ((i + 1) * CHAR_MS * 100) / DUR;
    const cxPos = px + i * CHW;
    const name = `c${styleCount++}`;
    styles.push(
      `@keyframes ${name} { 0%,${from.toFixed(1)}% { opacity: 1; } ${from === 0 ? "" : `${to.toFixed(1)}%,`}100% { opacity: 0; } }`
    );
    body.push(
      `<rect x="${cxPos}" y="${y - FS + 3}" width="${CHW - 1}" height="${FS - 1}" fill="${G.bright}" style="animation:${name} ${DUR}ms forwards; opacity:1"/>`
    );
  }
  t = lineEnd + PAUSE_MS;
  return { endX: px + cmd.length * CHW, endY: y, at: lineEnd };
}

function blinkCursor(x, y, at) {
  body.push(
    `<rect class="cur" style="animation-delay:${at}ms" x="${x}" y="${y - FS + 3}" width="${CHW - 1}" height="${FS - 1}" fill="${G.bright}"/>`
  );
}

// ---------- screen content ----------
const L0 = TOP + FS;
const nf = typedCmd(PAD, L0, "neofetch");

const IMG_X = PAD + 6;
const IMG_Y = L0 + 18;
const IMG_W = 290;
const IMG_H = 380;
const png = fs
  .readFileSync(path.join(__dirname, "..", "img", "main.png"))
  .toString("base64");
body.push(
  `<image class="ln" style="animation-delay:${t}ms" x="${IMG_X}" y="${IMG_Y}" width="${IMG_W}" height="${IMG_H}" preserveAspectRatio="xMidYMin meet" filter="url(#greenify)" href="data:image/png;base64,${png}"/>`
);
t += OUT_MS;

const INFO_X = IMG_X + IMG_W + 40;
const info = [
  [["iris@github", G.bright]],
  [["──────────────────────", G.main]],
  [["OS", G.bright], [":        计科院学生 ", G.main], ["(快过期)", G.bright]],
  [["Host", G.bright], [":      普普通通双非一本", G.main]],
  [["Kernel", G.bright], [":    Vibe-coding 4.0", G.main]],
  [["Uptime", G.bright], [":    大学四年一事无成", G.main]],
  [["Shell", G.bright], [":     Ciallo～(∠・ω< )⌒★", G.main]],
  [["Skills", G.bright], [":    算法 · 前后端 · 数据库", G.main]],
  [["       网络攻防 · 嵌入式 · 路由交换", G.mid]],
  [["       数据分析 · MMD神秘视频", G.mid]],
  [["       文学 · 哲学 · 政治", G.mid]],
  [["Weakness", G.bright], [": 听! 不! 懂! ", G.main], ["(不要聊太深奥)", G.bright]],
  [["Habit", G.bright], [":    挖一万个新坑, 不填", G.main]],
  [["Aliases", G.bright], [":  Iris · 鸢尾 · 月", G.main]],
  [["       ~~小爱同学~~ ", G.mid], ["(不是那个新世界的卡密)", G.bright]],
];
const INFO_Y0 = IMG_Y + FS;
info.forEach((parts, i) => {
  line(INFO_X, INFO_Y0 + i * LH, parts);
});

// phosphor "palette" block (like neofetch colors, but all green brightness steps)
const palY = INFO_Y0 + info.length * LH + 14;
[G.bright, G.main, G.mid, G.dim, G.bright, G.main, G.mid, G.dim].forEach((c, i) => {
  body.push(
    `<rect class="ln" style="animation-delay:${t}ms" x="${INFO_X + i * 34}" y="${palY}" width="28" height="13" fill="${c}"/>`
  );
});
t += OUT_MS;

const LS_Y = palY + 46;
const ls = typedCmd(PAD, LS_Y, "ls ~/skills/");

const lsItems = [
  "C", "C++", "Python", "Java",
  "MySQL", "Linux", "Docker", "嵌入式",
  "信息安全", "路由交换", "MMD", "科研绘图",
];
const COL_W = [0, 120, 250, 410];
const lsShades = [G.bright, G.main, G.mid];
lsItems.forEach((name, i) => {
  const row = Math.floor(i / 4);
  const colX = PAD + 14 + COL_W[i % 4];
  line(colX, LS_Y + (row + 1) * LH, [[name, lsShades[i % 3]]]);
});

const EXIT_Y = LS_Y + 4 * LH + 16;
const ex = typedCmd(PAD, EXIT_Y, "exit");
blinkCursor(ex.endX, ex.endY, ex.at);

// ---------- CRT screen shape ----------
// Sides bulge outward slightly (quadratic curves), top/bottom bow inward — CRT glass perspective.
const BX = 10;      // bulge at sides
const BOW = 16;     // inward bow at top/bottom
const screenPath =
  `M ${BX} ${BOW} ` +
  `Q ${W / 2} 0 ${W - BX} ${BOW} ` +
  `Q ${W + BX * 1.6} ${H / 2} ${W - BX} ${H - BOW} ` +
  `Q ${W / 2} ${H} ${BX} ${H - BOW} ` +
  `Q ${-BX * 1.6} ${H / 2} ${BX} ${BOW} Z`;

// ---------- assemble ----------
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'JetBrains Mono','Noto Sans Mono CJK SC','Cascadia Code',Consolas,monospace">
<style>
  .ln { animation: ap .12s ease-out both; }
  .ch { animation: ap .05s steps(1) both; }
  @keyframes ap { from { opacity: 0; } to { opacity: 1; } }
  .cur { animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
  .flicker { animation: flick 4s linear infinite; }
  @keyframes flick { 0%,100% { opacity: 1; } 96% { opacity: 1; } 97% { opacity: .92; } 98% { opacity: 1; } }
  ${styles.join("\n  ")}
</style>
<defs>
  <!-- convert the embedded image to green phosphor -->
  <filter id="greenify" x="0" y="0" width="100%" height="100%">
    <feColorMatrix type="matrix" values="0.05 0 0 0 0  0.35 0.7 0 0 0  0.05 0 0 0 0  0 0 0 1 0"/>
  </filter>
  <!-- text glow -->
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="1.6" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <!-- vignette: dark rounded corners of the tube -->
  <radialGradient id="vig" cx="50%" cy="50%" r="75%">
    <stop offset="55%" stop-color="#000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
  </radialGradient>
  <!-- scanlines: thin transparent gaps between rows -->
  <pattern id="scan" width="1" height="3" patternUnits="userSpaceOnUse">
    <rect width="1" height="2" fill="#000" fill-opacity="0.38"/>
    <rect y="2" width="1" height="1" fill="#000" fill-opacity="0"/>
  </pattern>
</defs>
<g class="flicker">
  <!-- glass body -->
  <path d="${screenPath}" fill="#020a04" stroke="#0f3d1f" stroke-width="3"/>
  <!-- faint phosphor bloom background -->
  <path d="${screenPath}" fill="#03150a"/>
  <!-- content, clipped to the tube -->
  <clipPath id="screen"><path d="${screenPath}"/></clipPath>
  <g clip-path="url(#screen)">
    <g filter="url(#glow)">
      ${body.join("\n  ")}
    </g>
    <!-- scanline gaps -->
    <path d="${screenPath}" fill="url(#scan)"/>
    <!-- green phosphor tint over everything -->
    <path d="${screenPath}" fill="#2bff70" fill-opacity="0.045"/>
    <!-- vignette -->
    <path d="${screenPath}" fill="url(#vig)"/>
  </g>
  <!-- glass rim highlight -->
  <path d="${screenPath}" fill="none" stroke="#1f7a3d" stroke-width="1.2" opacity="0.7"/>
</g>
</svg>`;

fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "dist", "terminal.svg"), svg);
console.log(`terminal.svg (CRT): ${W}x${H}, anim ends ~${t}ms, keyframes: ${styleCount}`);
