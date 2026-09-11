/**
 * Dev tool: render the dsh web GUI in a hidden Electron window and dump the
 * left sidebar DOM so the desktop shell's zone selectors can be written
 * against reality instead of guesses.
 *
 * Usage: electron scripts/dump-dom.js <url>
 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
for (const key of ['userData', 'sessionData', 'cache', 'logs', 'crashDumps', 'temp']) {
  try {
    app.setPath(key, path.join(ROOT, '.electron-userdata', key))
  } catch {}
}

const url = process.argv[2]
if (!url) {
  console.error('usage: electron scripts/dump-dom.js <url>')
  process.exit(2)
}

const DUMP = `(() => {
  const lines = [];
  const describe = (el) => {
    const cls = (el.getAttribute('class') || '').trim();
    const parts = [];
    parts.push(el.tagName.toLowerCase());
    if (el.id) parts.push('#' + el.id);
    if (cls) parts.push('.' + cls.split(/\\s+/).join('.'));
    for (const a of el.attributes) {
      if (['class', 'style', 'id'].includes(a.name)) continue;
      if (a.name.startsWith('data-') || ['role', 'aria-label', 'title', 'aria-expanded'].includes(a.name)) {
        parts.push('[' + a.name + '="' + a.value.slice(0, 60) + '"]');
      }
    }
    return parts.join('');
  };
  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return t.replace(/\\s+/g, ' ').trim().slice(0, 60);
  };
  const walk = (el, depth, maxDepth) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const box = Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top);
    const text = ownText(el);
    lines.push('  '.repeat(depth) + describe(el) + '  <' + box + ' bg=' + cs.backgroundColor + ' bb=' + cs.borderBottomWidth + '>' + (text ? ' "' + text + '"' : ''));
    if (depth >= maxDepth) {
      if (el.children.length) lines.push('  '.repeat(depth + 1) + '... ' + el.children.length + ' children');
      return;
    }
    for (const c of el.children) walk(c, depth + 1, maxDepth);
  };
  const frame = document.querySelector('[class*="_frame"]');
  lines.push('=== ROOT CHAINS ===');
  const html = document.body;
  for (const c of html.children) lines.push('body > ' + describe(c));
  lines.push('');
  lines.push('=== FRAME TREE (from [class*="_frame"]) ===');
  if (frame) walk(frame, 0, 4); else lines.push('NO FRAME FOUND');
  lines.push('');
  const sidebar = document.querySelector('[class*="_sidebarCol"]');
  lines.push('=== SIDEBAR TREE (from [class*="_sidebarCol"]) ===');
  if (sidebar) walk(sidebar, 0, 12); else lines.push('NO SIDEBAR COL FOUND');
  lines.push('');
  lines.push('=== SIDEBAR TEXT ===');
  if (sidebar) lines.push((sidebar.innerText || '').slice(0, 1500));
  return lines.join('\\n');
})()`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  win.webContents.on('console-message', (...args) => {
    const e = args[0]
    if (e && typeof e === 'object' && e.message) console.error('[page]', e.message)
  })
  try {
    await win.loadURL(url)
  } catch (err) {
    console.error('load failed:', err && err.message)
    app.exit(1)
    return
  }
  await new Promise((r) => setTimeout(r, 7000))
  try {
    const out = await win.webContents.executeJavaScript(DUMP, true)
    console.log(out)
  } catch (err) {
    console.error('dump failed:', err && err.message)
  }
  app.exit(0)
})
