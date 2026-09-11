'use strict'

/**
 * The backdrop derivation: presets plus the per-pixel pass.
 *
 * The pass runs on a canvas inside a hidden Electron window, so Chromium is the
 * decoder and encoder and no image dependency is needed. It is shared by the
 * `scripts/make-background.js` CLI and by the desktop settings window, so both
 * produce byte-identical artwork for the same source.
 *
 * @module dsh-desktop/artwork
 */

const { BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

/** The presets the derivation can produce, with a human label each. */
const PRESETS = [
  { id: 'selective', label: '留色', hint: '整图黑白，只保留红瞳与蓝发' },
  { id: 'mono', label: '纯黑白', hint: '完全去色' },
  { id: 'blackgold', label: '黑金', hint: '黑白加暖金色调' },
  { id: 'none', label: '原图', hint: '不做任何处理' },
]

/** Preset ids, in menu order. */
const PRESET_IDS = PRESETS.map((preset) => preset.id)

/** MIME type for the source image, by extension. */
function mimeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  return 'image/jpeg'
}

/**
 * The page-side pass, as source text: it must run where the canvas lives.
 *
 * The selective preset is a hue-band mask with soft ramps:
 *
 *  - crimson around 352deg keeps the eyes (and the small suit accents);
 *  - blue around 214deg keeps the hair, gated to the **hair band** in space:
 *    the plugsuit's shading is the same hue and even more chromatic, so colour
 *    alone cannot separate them, while the hair sits above ~53% of the frame and
 *    the suit below it, which does;
 *  - both bands are gated on **chroma** (max-min) rather than HSL saturation: a
 *    near-white tinted pixel has a huge HSL saturation and almost no chroma, and
 *    must stay monochrome;
 *  - the mix is continuous, so a keep weight of zero reproduces the mono value
 *    exactly and chroma noise in flat areas cannot bloom into coloured blotches.
 *
 * @param dataUri - the source image as a data URI.
 * @param presetName - one of {@link PRESET_IDS}.
 * @returns an expression evaluating to `{ full, width, height }`.
 */
function buildProcessScript(dataUri, presetName) {
  return `(async () => {
  const img = new Image();
  img.src = ${JSON.stringify(dataUri)};
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  const width = canvas.width, height = canvas.height;

  const smooth = (t) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
  const clamp255 = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  const hueOf = (r, g, b, max, spread) => {
    if (spread === 0) return 0;
    let h;
    if (max === r) h = ((g - b) / 255) / spread + (g < b ? 6 : 0);
    else if (max === g) h = ((b - r) / 255) / spread + 2;
    else h = ((r - g) / 255) / spread + 4;
    return h * 60;
  };
  const hueDistance = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  const hairBottom = height * 0.53;
  const hairFeather = Math.max(24, height * 0.06);

  for (let y = 0; y < height; y += 1) {
    const inHairBand = smooth((hairBottom - y) / hairFeather);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mono = clamp255((lum - 8) * 0.94);
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const chroma = (max - min) / 255;

      if (${JSON.stringify(presetName)} === 'mono') {
        px[i] = px[i + 1] = px[i + 2] = mono;
        continue;
      }
      if (${JSON.stringify(presetName)} === 'blackgold') {
        px[i] = clamp255(mono * 1.06);
        px[i + 1] = clamp255(mono * 0.99);
        px[i + 2] = clamp255(mono * 0.8);
        continue;
      }
      if (chroma < 0.1) {
        px[i] = px[i + 1] = px[i + 2] = mono;
        continue;
      }

      const hue = hueOf(r, g, b, max, chroma);
      const eyeRed = smooth((30 - hueDistance(hue, 352)) / 30) * smooth((chroma - 0.28) / 0.25);
      const hairBlue =
        smooth((52 - hueDistance(hue, 214)) / 52) * smooth((chroma - 0.12) / 0.22) * inHairBand;
      const keep = Math.max(eyeRed, hairBlue) * smooth((lum - 30) / 60);

      const amp = keep * 1.25;
      px[i] = clamp255(mono + (r - lum) * amp);
      px[i + 1] = clamp255(mono + (g - lum) * amp);
      px[i + 2] = clamp255(mono + (b - lum) * amp);
    }
  }

  ctx.putImageData(image, 0, 0);
  return { full: canvas.toDataURL('image/jpeg', 0.9), width: width, height: height };
})()`
}

/**
 * Run the pass in a hidden window.
 * @param dataUri - the source image as a data URI.
 * @param preset - a preset id.
 * @returns `{ full, width, height }`; `full` is a JPEG data URI.
 */
async function processImage(dataUri, preset) {
  const win = new BrowserWindow({ show: false, width: 480, height: 320, webPreferences: { offscreen: true } })
  try {
    await win.loadURL('about:blank')
    return await win.webContents.executeJavaScript(buildProcessScript(dataUri, preset), true)
  } finally {
    win.destroy()
  }
}

/**
 * Read a source image, apply a preset, and write `background-<preset>.jpg`.
 *
 * @param options - source path, preset, and output directory.
 * @returns `{ path, dataUri, width, height }`.
 */
async function deriveArtworkFile({ sourcePath, preset, outputDir }) {
  if (!PRESET_IDS.includes(preset)) throw new Error(`unknown artwork preset ${JSON.stringify(preset)}`)
  if (preset === 'none') return { path: sourcePath, dataUri: null, width: null, height: null }
  const dataUri = `data:${mimeFor(sourcePath)};base64,${fs.readFileSync(sourcePath).toString('base64')}`
  const result = await processImage(dataUri, preset)
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `background-${preset}.jpg`)
  fs.writeFileSync(outputPath, Buffer.from(String(result.full).split(',')[1], 'base64'))
  return { path: outputPath, dataUri: result.full, width: result.width, height: result.height }
}

module.exports = { PRESETS, PRESET_IDS, buildProcessScript, deriveArtworkFile, mimeFor, processImage }
