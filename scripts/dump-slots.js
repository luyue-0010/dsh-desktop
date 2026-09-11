/**
 * Dev tool: force the app into its dark appearance and dump every `data-slot`
 * anchor plus the computed background of the main containers, so the desktop
 * shell's dark-theme CSS can target stable anchors instead of hashed classes.
 *
 * Usage: electron scripts/dump-slots.js
 */

const { app, BrowserWindow, nativeTheme } = require('electron')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const { DshServer, buildLauncher, findDshInstall } = require(path.join(ROOT, 'src', 'main', 'dsh'))

if (process.env.DSH_DESKTOP_USER_DATA) app.setPath('userData', path.resolve(process.env.DSH_DESKTOP_USER_DATA))

const REPORT = `(() => {
  const out = { prefersDark: matchMedia('(prefers-color-scheme: dark)').matches, slots: [], boxes: [], opaque: [] };

  /* Census of every element that paints a background: in the chat phase these
     are the layers that can hide the window gradient and show hard edges. */
  const root = document.querySelector('[data-slot="main"]') || document.body;
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const hasColor = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    const hasImage = cs.backgroundImage !== 'none';
    if (!hasColor && !hasImage) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) continue;
    out.opaque.push({
      slot: (el.closest('[data-slot]') || el).getAttribute('data-slot'),
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 44),
      box: Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top),
      bg: cs.backgroundColor,
      image: hasImage ? cs.backgroundImage.slice(0, 46) : null,
    });
  }

  for (const el of document.querySelectorAll('[data-slot]')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.slots.push({
      slot: el.getAttribute('data-slot'),
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 60),
      box: Math.round(r.width) + 'x' + Math.round(r.height),
      bg: cs.backgroundColor,
      backdrop: cs.backdropFilter,
    });
  }
  const pick = (label, el) => {
    if (!el) { out.boxes.push({ label, missing: true }); return; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    out.boxes.push({
      label,
      cls: (el.getAttribute('class') || '').slice(0, 50),
      box: Math.round(r.width) + 'x' + Math.round(r.height),
      bg: cs.backgroundColor,
      color: cs.color,
      image: cs.backgroundImage.slice(0, 40),
    });
  };
  pick('html', document.documentElement);
  pick('body', document.body);
  pick('root', document.getElementById('root'));
  pick('frame', document.querySelector('[class*="_frame"]'));
  pick('sidebarCol', document.querySelector('[class*="_sidebarCol"]'));
  pick('sidebarRoot', document.querySelector('[class*="_sidebarCol"] [class*="_root"]'));
  pick('centerCol', document.querySelector('[class*="_centerCol"]'));
  pick('conversation', document.querySelector('[data-slot="main.conversation"] > *'));
  pick('hero', document.querySelector('[data-phase]'));
  pick('textarea', document.querySelector('textarea'));
  pick('composerBox', document.querySelector('textarea') ? document.querySelector('textarea').closest('div[class]') : null);
  pick('sidebarLabel', document.querySelector('[class*="_sectionLabel"]'));
  return out;
})()`

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark'
  const settings = { dsh: { command: '', nodePath: '' } }
  const install = findDshInstall(ROOT, '')
  const server = new DshServer({ launcher: buildLauncher(install, ''), onLog: () => {} })
  let code = 0
  try {
    const info = await server.start()
    const win = new BrowserWindow({
      width: 1440,
      height: 920,
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: { contextIsolation: true, backgroundThrottling: false },
    })
    await win.loadURL(info.url)
    await new Promise((resolve) => setTimeout(resolve, 8000))
    // Enter the chat phase: the conversation's inner layers only exist once a
    // session with messages is open, and those are what can hide the gradient.
    const opened = await win.webContents.executeJavaScript(
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (const row of document.querySelectorAll('[class*="_projectRow"]')) {
          if (row.getAttribute('aria-expanded') === 'false') { row.click(); await wait(400); }
        }
        const rows = Array.from(document.querySelectorAll('[class*="_sessionRow"]'));
        const target = rows.find((row) => row.textContent.indexOf('新会话') === -1) || rows[0];
        if (!target) return null;
        target.click();
        return target.textContent.trim().slice(0, 30);
      })()`,
      true,
    )
    await new Promise((resolve) => setTimeout(resolve, 6000))
    const report = await win.webContents.executeJavaScript(REPORT, true)
    console.log(`SLOTS: prefersDark=${report.prefersDark} opened=${JSON.stringify(opened)}`)
    for (const box of report.boxes) console.log(`BOX  ${JSON.stringify(box)}`)
    console.log('--- background-painting layers (chat phase) ---')
    for (const layer of report.opaque) console.log(`PAINT ${JSON.stringify(layer)}`)
    for (const slot of report.slots) console.log(`SLOT ${JSON.stringify(slot)}`)
    const png = await win.webContents.capturePage()
    const fs = require('node:fs')
    fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true })
    fs.writeFileSync(path.join(ROOT, 'tmp', 'dark-chat.png'), png.toPNG())
    console.log('SLOTS: screenshot -> tmp/dark-chat.png')
  } catch (error) {
    console.error(`SLOTS: error ${(error && error.stack) || error}`)
    code = 1
  } finally {
    await server.stop()
    app.exit(code)
  }
})
