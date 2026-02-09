const fs = require("fs");
const path = require("path");
const pngToIco = require("png-to-ico");
const Jimp = require("jimp");

async function main() {
  const src = path.join(__dirname, "..", "app", "assets", "tray.png");
  const out = path.join(__dirname, "..", "app", "assets", "app.ico");
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source png: ${src}`);
  }

  const img = await Jimp.read(src);
  const maxSide = Math.max(img.bitmap.width, img.bitmap.height);
  let base = img;
  if (maxSide < 256) {
    const scale = Math.ceil(256 / maxSide);
    const size = maxSide * scale;
    base = img.clone().resize(size, size, Jimp.RESIZE_NEAREST_NEIGHBOR);
  }

  const tmp = path.join(__dirname, "..", "app", "assets", "_icon_base.png");
  await base.writeAsync(tmp);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const ico = await pngToIco(tmp, sizes);
  fs.writeFileSync(out, ico);
  fs.unlinkSync(tmp);
  console.log(`ICO generated: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
