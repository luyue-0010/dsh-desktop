/**
 * Regenerate the backdrop artwork from the source picture, non-interactively.
 * The pass itself lives in `src/main/artwork.js`, shared with the desktop
 * settings window so both produce identical output.
 *
 * Usage: electron scripts/make-background.js [preset] [source] [outputDir]
 *   preset     selective (default) | mono | blackgold
 *   source     defaults to assets/background.jpg
 *   outputDir  defaults to assets/
 */

const { app } = require('electron')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const { PRESET_IDS, deriveArtworkFile } = require(path.join(ROOT, 'src', 'main', 'artwork'))

const args = process.argv.slice(2).filter((value) => !value.startsWith('--'))
const preset = args[0] || 'selective'
const source = path.resolve(args[1] || path.join(ROOT, 'assets', 'background.jpg'))
const outputDir = path.resolve(args[2] || path.join(ROOT, 'assets'))

app.whenReady().then(async () => {
  let code = 0
  try {
    if (!PRESET_IDS.includes(preset)) throw new Error(`unknown preset ${JSON.stringify(preset)}, expected ${PRESET_IDS.join(' | ')}`)
    if (preset === 'none') {
      console.log('background: preset "none" uses the source as-is; nothing derived')
    } else {
      const result = await deriveArtworkFile({ sourcePath: source, preset, outputDir })
      console.log(
        `background: ${preset} -> ${result.path} (${Math.round(require('node:fs').statSync(result.path).size / 1024)}KB, ${result.width}x${result.height})`,
      )
    }
  } catch (error) {
    console.error(`background: failed ${(error && error.message) || error}`)
    code = 1
  }
  app.exit(code)
})
