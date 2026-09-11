/**
 * Generate the desktop shell's icon without any image dependency.
 *
 * Writes `build/icon.ico` (a single 256x256 PNG-compressed entry, which Windows
 * and electron-builder both accept) plus `build/icon.png` for eyeballing.
 *
 * The mark is intentionally the product's own idea: a soft rounded tile holding
 * the three zone bands in the shipped low-saturation palette.
 *
 * Usage: node scripts/make-icon.js
 */

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'build')
const SIZE = 256

/** The three zone accents, matching the shell's default palette. */
const BANDS = ['#94A3C4', '#C9AF8E', '#8FB3A0']

/** Parse `#rrggbb` into `[r, g, b]`. */
function rgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Standard CRC-32, as required by the PNG chunk format. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** One PNG chunk: length, type, data, CRC. */
function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

/** Encode straight RGBA bytes as a PNG buffer. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Each scanline is prefixed with filter type 0 (none).
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Wrap one PNG in an ICO container (width/height 0 means 256). */
function encodeIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // image count

  const entry = Buffer.alloc(16)
  entry[0] = 0 // width 256
  entry[1] = 0 // height 256
  entry[2] = 0 // palette colours
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(6 + 16, 12)

  return Buffer.concat([header, entry, png])
}

/** Signed-distance coverage of a rounded rectangle, for smooth edges. */
function roundedRectCoverage(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius))
  const cy = Math.max(top + radius, Math.min(y, bottom - radius))
  const dx = x - cx
  const dy = y - cy
  const distance = Math.sqrt(dx * dx + dy * dy) - radius
  return Math.max(0, Math.min(1, 0.5 - distance))
}

/** Paint the icon: a rounded tile with three inset zone bands. */
function renderIcon() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4)
  const inset = 18
  const radius = 52
  const bandGap = 7
  const bandsArea = SIZE - inset * 2
  const bandHeight = (bandsArea - bandGap * (BANDS.length - 1)) / BANDS.length
  const bandColors = BANDS.map(rgb)

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const px = x + 0.5
      const py = y + 0.5
      const tile = roundedRectCoverage(px, py, inset, inset, SIZE - inset, SIZE - inset, radius)

      let colour = [255, 255, 255]
      let alpha = 0

      if (tile > 0) {
        colour = [246, 247, 249]
        alpha = tile
        for (let index = 0; index < bandColors.length; index += 1) {
          const top = inset + index * (bandHeight + bandGap)
          const bottom = top + bandHeight
          const band = roundedRectCoverage(px, py, inset, top, SIZE - inset, bottom, Math.min(10, bandHeight / 2))
          if (band > 0) {
            const target = bandColors[index]
            colour = [
              Math.round(colour[0] * (1 - band) + target[0] * band),
              Math.round(colour[1] * (1 - band) + target[1] * band),
              Math.round(colour[2] * (1 - band) + target[2] * band),
            ]
          }
        }
      }

      const offset = (y * SIZE + x) * 4
      rgba[offset] = colour[0]
      rgba[offset + 1] = colour[1]
      rgba[offset + 2] = colour[2]
      rgba[offset + 3] = Math.round(alpha * 255)
    }
  }

  return rgba
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const png = encodePng(SIZE, SIZE, renderIcon())
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png)
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), encodeIco(png))
console.log(`icon: ${path.join(OUT_DIR, 'icon.ico')} (${png.length} bytes PNG payload)`)
