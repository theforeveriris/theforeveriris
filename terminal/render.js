const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const htmlPath = "file://" + path.resolve(__dirname, "terminal.html");

  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--force-color-profile=srgb"] });
  const page = await browser.newPage();
  await page.goto(htmlPath, { waitUntil: "networkidle0" });

  const el = await page.$("#terminal");
  fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });

  // PNG render
  await el.screenshot({ path: path.join(__dirname, "dist", "terminal.png") });

  // Build an SVG that embeds the PNG as base64.
  // SVG is used so GitHub serves it crisp and scalable.
  const png = fs.readFileSync(path.join(__dirname, "dist", "terminal.png"));
  const meta = await el.evaluate(() => {
    const r = document.getElementById("terminal").getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${meta.w}" height="${meta.h}" viewBox="0 0 ${meta.w} ${meta.h}">
  <image width="${meta.w}" height="${meta.h}" xlink:href="data:image/png;base64,${png.toString("base64")}"/>
</svg>`;
  fs.writeFileSync(path.join(__dirname, "dist", "terminal.svg"), svg);

  await browser.close();
  console.log(`Rendered terminal.png (${meta.w}x${meta.h}) and terminal.svg`);
})();
