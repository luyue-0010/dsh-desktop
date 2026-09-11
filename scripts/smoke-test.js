/**
 * End-to-end smoke test for the desktop shell.
 *
 * Boots the real `dsh web` server through the same modules the app uses, loads
 * the authenticated URL, injects the sidebar zones, then reports the zone
 * geometry/colors, a screenshot of the left panel, and whether the web GUI's own
 * controls survived. Exits non-zero when a zone is missing.
 *
 * Usage: electron scripts/smoke-test.js [--keep] [--out <png>]
 */

const { app, BrowserWindow, nativeTheme } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const { DshServer, buildLauncher, findDshInstall } = require(path.join(ROOT, 'src', 'main', 'dsh'))
const { buildZoneOptions, buildZoneScript } = require(path.join(ROOT, 'src', 'main', 'zones'))
const { buildThemeCss, loadBackgroundDataUri, normalizeFadeStops, resolveBackgroundPath } = require(
  path.join(ROOT, 'src', 'main', 'theme'),
)
const { readSettings } = require(path.join(ROOT, 'src', 'main', 'settings'))
const { openSettingsWindow, registerSettingsIpc } = require(path.join(ROOT, 'src', 'main', 'settings-window'))

const args = process.argv.slice(2)
const keepOpen = args.includes('--keep')
const clickWorkspace = args.includes('--click-workspace')
const outIndex = args.indexOf('--out')
const outDir = outIndex >= 0 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : path.join(ROOT, 'tmp')

if (process.env.DSH_DESKTOP_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.DSH_DESKTOP_USER_DATA))
}

/** The page-context report; must stay self-contained. */
const REPORT = `(() => {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      width: Math.round(r.width),
      height: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      borderBottomWidth: cs.borderBottomWidth,
      borderBottomColor: cs.borderBottomColor,
      bottomTint: cs.backgroundImage !== 'none',
    };
  };
  const out = { zones: {}, rows: {}, app: {} };
  for (const name of ['workspace', 'add-folder', 'sessions']) {
    const el = document.querySelector('[data-dsh-zone="' + name + '"]');
    out.zones[name] = el ? box(el) : null;
  }
  const root = document.querySelector('[data-dsh-collapsed]');
  out.collapsed = root ? root.getAttribute('data-dsh-collapsed') : null;

  const strip = document.getElementById('dsh-desktop-add-folder');
  if (strip) {
    const button = strip.querySelector('button');
    out.strip = {
      label: button ? button.textContent.trim() : null,
      ariaLabel: button ? button.getAttribute('aria-label') : null,
      buttons: strip.querySelectorAll('button').length,
      rect: box(strip),
    };
  }
  const sources = document.querySelectorAll('[data-dsh-add-folder-source="1"]');
  out.sourceControl = { count: sources.length, opacity: sources.length ? getComputedStyle(sources[0]).opacity : null };
  out.sourceClickable = sources.length ? typeof sources[0].click === 'function' : false;

  // Prove the “工作区” card lists every added workspace and that clicking one
  // runs the app's own “new session in this workspace” control (capture-phase
  // spy, so the real session is not created during the check).
  try {
    const listEl = document.getElementById('dsh-desktop-workspace-list');
    const items = listEl ? listEl.querySelectorAll('.dsh-ws-item') : [];
    const groups = document.querySelectorAll('[data-dsh-zone="sessions"] [class*="_groupSection"]');
    out.workspaceList = {
      items: items.length,
      groups: groups.length,
      active: listEl ? listEl.querySelectorAll('.dsh-ws-item[data-dsh-active="true"]').length : 0,
      labels: Array.prototype.map.call(items, (el) => {
        const name = el.querySelector('.dsh-ws-name');
        return name ? name.textContent : null;
      }),
      emptyHint: Boolean(listEl && listEl.querySelector('.dsh-ws-empty')),
    };

    const first = items[0];
    const row = groups[0] ? groups[0].querySelector('[class*="_projectRow"]') : null;
    const actions = row ? row.querySelector('[class*="_rowActions"]') : null;
    const buttons = actions ? actions.querySelectorAll('button') : [];
    if (first && buttons.length) {
      const target = buttons[buttons.length - 1];
      let hits = 0;
      const spy = (event) => {
        hits += 1;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      target.addEventListener('click', spy, true);
      first.click();
      target.removeEventListener('click', spy, true);
      out.workspaceForwarding = {
        forwarded: hits === 1,
        hits,
        targetAria: target.getAttribute('aria-label'),
      };
    } else {
      out.workspaceForwarding = { forwarded: false, reason: 'no workspace item or no action button' };
    }
  } catch (error) {
    out.workspaceForwarding = { forwarded: false, reason: String((error && error.message) || error) };
  }

  // Prove the “添加文件夹” card forwards to the app's own “add workspace”
  // control (again intercepted in the capture phase, so the native directory
  // dialog never opens).
  try {
    const source = document.querySelector('[data-dsh-add-folder-source="1"]');
    const stripButton = document.querySelector('#dsh-desktop-add-folder button');
    if (source && stripButton) {
      let hits = 0;
      const spy = (event) => {
        hits += 1;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      source.addEventListener('click', spy, true);
      stripButton.click();
      source.removeEventListener('click', spy, true);
      out.addFolderForwarding = { forwarded: hits === 1, hits };
    } else {
      out.addFolderForwarding = { forwarded: false, reason: 'missing source or strip button' };
    }
  } catch (error) {
    out.addFolderForwarding = { forwarded: false, reason: String((error && error.message) || error) };
  }

  out.rows.workspace = document.querySelectorAll('[data-dsh-row="workspace"]').length;
  out.rows.sessions = document.querySelectorAll('[data-dsh-row="sessions"]').length;
  out.heads = document.querySelectorAll('.dsh-zone-head').length;
  out.nestedGroups = document.querySelectorAll('[data-dsh-zone="sessions"] [class*="_groupSection"]').length;

  const order = ['workspace', 'add-folder', 'sessions'];
  const rects = order.map((name) => {
    const el = document.querySelector('[data-dsh-zone="' + name + '"]');
    return el ? el.getBoundingClientRect() : null;
  });
  out.gaps = {
    workspaceToAdd: rects[0] && rects[1] ? Math.round(rects[1].top - rects[0].bottom) : null,
    addToSessions: rects[1] && rects[2] ? Math.round(rects[2].top - rects[1].bottom) : null,
  };
  out.styleTag = Boolean(document.getElementById('dsh-desktop-zone-style'));
  const cs = getComputedStyle(document.documentElement);
  out.cssVars = {
    workspace: cs.getPropertyValue('--dsh-zone-workspace').trim(),
    addFolder: cs.getPropertyValue('--dsh-zone-add').trim(),
    sessions: cs.getPropertyValue('--dsh-zone-sessions').trim(),
  };

  out.app.newSessionButton = document.querySelectorAll('[class*="_newSession"]').length;
  out.app.settingsTrigger = document.querySelectorAll('[class*="_trigger"]').length;
  out.app.mainSlot = document.querySelectorAll('[data-slot="main"]').length;
  out.app.rightbarSlot = document.querySelectorAll('[data-slot="rightbar"]').length;
  out.app.sessionTree = document.querySelectorAll('[role="tree"]').length;
  out.app.websocketOpen = typeof WebSocket === 'function';
  out.app.title = document.title;

  const zoneEl = document.querySelector('[data-dsh-zone]');
  const pseudo = getComputedStyle(document.body, '::before');
  const conversation = document.querySelector('[data-slot="main.conversation"] > *');
  const seat = document.querySelector('[class*="_composerSeat"]');
  const composerWrapper = document.querySelector('[data-slot="conversation.composer.bar"] > *');
  /* Walk up from a point in the conversation and report the first ancestor that
     actually paints a background — that is the layer hiding the artwork. */
  out.probes = [70, 150, 300, 520].map((y) => {
    const el = document.elementFromPoint(720, y);
    if (!el) return { y, missing: true };
    let node = el;
    let cover = null;
    while (node && !cover) {
      const cs = getComputedStyle(node);
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') {
        cover = {
          tag: node.tagName.toLowerCase(),
          cls: (node.getAttribute('class') || '').slice(0, 34),
          bg: cs.backgroundColor,
          image: cs.backgroundImage.slice(0, 30),
        };
      }
      node = node.parentElement;
    }
    return { y, hit: (el.getAttribute('class') || '').slice(0, 30) || el.tagName.toLowerCase(), cover };
  });
  out.appearance = {
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    flag: document.documentElement.getAttribute('data-dsh-dark'),
    themeStyle: Boolean(document.getElementById('dsh-desktop-theme-style')),
    ground: getComputedStyle(document.documentElement).getPropertyValue('--dsh-dark-ground').trim(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyPseudoImage: pseudo.backgroundImage !== 'none',
    conversationHasImage: conversation ? getComputedStyle(conversation).backgroundImage.indexOf('url(') !== -1 : null,
    conversationSizes: conversation ? getComputedStyle(conversation).backgroundSize : null,
    cardBg: zoneEl ? getComputedStyle(zoneEl).backgroundColor : null,
    cardBackdrop: zoneEl ? getComputedStyle(zoneEl).backdropFilter : null,
    conversationHasGradient: conversation ? getComputedStyle(conversation).backgroundImage.indexOf('linear-gradient') !== -1 : null,
    composerSeatCleared: seat ? getComputedStyle(seat).backgroundImage === 'none' : null,
    composerWrapper: composerWrapper
      ? {
          border: getComputedStyle(composerWrapper).borderTopWidth,
          bg: getComputedStyle(composerWrapper).backgroundColor,
        }
      : null,
  };
  return out;
})()`

/**
 * Audit of opaque slabs in the conversation column.
 *
 * A layer that keeps its own `background-color` paints a hard-edged rectangle at
 * its own box, which is exactly what breaks the window gradient. Anything
 * >= 0.85 alpha, at least 120x14, and not the layer's ground colour is reported
 * so it can be either blended or explicitly allowed.
 */
const AUDIT = `(() => {
  const ground = { r: 11, g: 16, b: 19 };
  const out = [];
  const root = document.querySelector('[data-slot="main"]') || document.body;
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const match = /rgba?\\(([^)]+)\\)/.exec(cs.backgroundColor);
    if (!match) continue;
    const parts = match[1].split(',').map((value) => Number(value.trim()));
    const alpha = parts.length > 3 ? parts[3] : 1;
    if (alpha < 0.85) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 14) continue;
    const same = Math.abs(parts[0] - ground.r) < 4 && Math.abs(parts[1] - ground.g) < 4 && Math.abs(parts[2] - ground.b) < 4;
    if (same) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 34),
      slot: (el.closest('[data-slot]') || el).getAttribute('data-slot'),
      box: Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top),
      bg: 'rgb(' + parts.slice(0, 3).join(',') + ')',
      alpha,
    });
  }
  return out;
})()`

/**
 * Everything visible in the composer's neighbourhood: gradients, fills, borders,
 * shadows and glass. A hard-edged rectangle around the composer can only come
 * from one of these entries, so this names it instead of guessing.
 */
const REGION_PROBE = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('[data-slot="main"] *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 10) continue;
    if (r.right < 380 || r.left > 1260 || r.bottom < 360 || r.top > 640) continue;
    const cs = getComputedStyle(el);
    const border = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join('/');
    const interesting = cs.backgroundImage !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
      border !== '0px/0px/0px/0px' || cs.boxShadow !== 'none' || cs.backdropFilter !== 'none';
    if (!interesting) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 30),
      slot: (el.closest('[data-slot]') || el).getAttribute('data-slot'),
      box: Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height),
      bg: cs.backgroundColor,
      img: cs.backgroundImage.slice(0, 26),
      border,
      borderColor: border === '0px/0px/0px/0px' ? null : cs.borderTopColor,
      shadow: cs.boxShadow !== 'none',
      glass: cs.backdropFilter !== 'none',
    });
  }
  return out;
})()`

/**
 * What the settings window must show once it has loaded its settings over IPC.
 */
const SETTINGS_REPORT = `(() => {
  const stage = document.getElementById('stage-image');
  const bar = document.getElementById('fade-bar');
  const active = document.querySelector('#presets .chip.active b');
  const status = document.getElementById('status');
  return {
    inputs: document.querySelectorAll('input').length,
    presets: document.querySelectorAll('#presets .chip').length,
    activePreset: active ? active.textContent : null,
    palettes: document.querySelectorAll('#palettes .swatch').length,
    stops: document.querySelectorAll('#stops .stop').length,
    stopValues: Array.prototype.map.call(document.querySelectorAll('#stops .stop .value'), (el) => el.textContent),
    status: status ? status.textContent : null,
    artworkPath: (document.getElementById('artwork-path') || {}).textContent,
    previewHasImage: stage ? getComputedStyle(stage).backgroundImage.indexOf('url(') !== -1 : false,
    previewFade: bar ? getComputedStyle(bar).backgroundImage.indexOf('linear-gradient') !== -1 : false,
  };
})()`

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark'
  const settings = readSettings(app.getPath('userData'))
  const install = findDshInstall(ROOT, settings.dsh.command)
  if (!install) {
    console.error('SMOKE: dsh not found')
    app.exit(1)
    return
  }
  const launcher = buildLauncher(install, settings.dsh.nodePath)
  const server = new DshServer({
    launcher,
    onLog: (line) => process.stdout.write(`dsh | ${line}\n`),
    onExit: (code) => console.error(`SMOKE: server exited code=${code}`),
  })

  let exitCode = 0
  try {
    const info = await server.start()
    console.log(`SMOKE: server ${info.url}`)

    const win = new BrowserWindow({
      width: 1440,
      height: 920,
      show: false,
      backgroundColor: '#F9FAFB',
      webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
      paintWhenInitiallyHidden: true,
    })
    win.webContents.on('console-message', (event) => {
      const message = event && event.message ? event.message : ''
      if (message.includes('Error') || message.includes('error')) console.log(`[page] ${message.slice(0, 200)}`)
    })
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error(`SMOKE: renderer gone ${JSON.stringify(details)}`)
      exitCode = 1
    })

    await win.loadURL(info.url)
    await new Promise((resolve) => setTimeout(resolve, 8000))

    const artworkPath = resolveBackgroundPath(settings.theme, {
      appRoot: ROOT,
      userArtworkDir: path.join(app.getPath('userData'), 'artwork'),
    })
    const themeCss = buildThemeCss(settings.theme, loadBackgroundDataUri(artworkPath))
    console.log(`SMOKE: artwork preset=${settings.theme.imagePreset} -> ${path.basename(artworkPath)}`)
    /* The requested fade profile must survive into the stylesheet verbatim:
       darkness at each configured percentage, in the ground colour. */
    const fadeStops = normalizeFadeStops(settings.theme.fadeStops)
    const fadeStopsOk = fadeStops.every(([percent, darkness]) =>
      themeCss.includes(`rgba(11, 16, 19, ${darkness}) ${percent}%`),
    )
    console.log(`SMOKE: fade stops ${JSON.stringify(fadeStops)} emitted=${fadeStopsOk}`)
    const options = buildZoneOptions(settings.zones, { enabled: true, css: themeCss })
    const injectReport = await win.webContents.executeJavaScript(buildZoneScript(options), true)
    console.log(`SMOKE: inject ${JSON.stringify(injectReport)}`)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    fs.mkdirSync(outDir, { recursive: true })

    /* Reads one rendered pixel, so a claim about what is on screen is a
       measurement rather than an inference from computed styles. */
    const sample = async (x, y) => {
      const shot = await win.webContents.capturePage({ x, y, width: 1, height: 1 })
      const b = shot.toBitmap()
      return `rgb(${b[2]},${b[1]},${b[0]})`
    }
    const snapshot = async (label) => {
      const png = await win.webContents.capturePage()
      fs.writeFileSync(path.join(outDir, `${label}.png`), png.toPNG())
      // 1:1 crop of the composer neighbourhood, where rims and gradient steps show.
      const crop = await win.webContents.capturePage({ x: 380, y: 330, width: 880, height: 330 })
      fs.writeFileSync(path.join(outDir, `${label}-composer.png`), crop.toPNG())
      /* Sample relative to the live window, so two different sizes can be
         compared: a background that fails to rescale shows ground colour at the
         far edges instead of artwork. */
      const [w, h] = win.getContentSize()
      const point = (fx, fy) => [Math.round(w * fx), Math.round(h * fy)]
      const at = async ([x, y]) => {
        const shot = await win.webContents.capturePage({ x, y, width: 1, height: 1 })
        const b = shot.toBitmap()
        return `rgb(${b[2]},${b[1]},${b[0]})`
      }
      return {
        size: `${w}x${h}`,
        top: await at(point(0.5, 0.14)),
        rightEdge: await at(point(0.97, 0.12)),
        leftEdge: await at(point(0.42, 0.12)),
        mid: await at(point(0.5, 0.35)),
        lowMid: await at(point(0.5, 0.7)),
        low: await at(point(0.5, 0.6)),
        bottom: await at(point(0.5, 0.96)),
        sidebar: await at(point(0.06, 0.47)),
      }
    }

    /* The artwork is "visible" when a sample differs from the flat ground: with
       the fade alone over an opaque background every sample would be ground. */
    const showsArtwork = (value) => {
      const parts = /rgb\((\d+),(\d+),(\d+)\)/.exec(value)
      if (!parts) return false
      const [, r, g, b] = parts.map(Number)
      return Math.abs(r - 11) > 8 || Math.abs(g - 16) > 8 || Math.abs(b - 19) > 8
    }

    // Phase 1 — the hero (no session open), which is where the app mounts its
    // own fade bands over the window background.
    const heroPixels = await snapshot('desktop-hero')
    const heroSlabs = await win.webContents.executeJavaScript(AUDIT, true)
    const heroRegion = await win.webContents.executeJavaScript(REGION_PROBE, true)
    const heroHairlines = heroRegion.filter((entry) => entry.borderColor === 'rgba(252, 250, 242, 0.08)')
    console.log(`SMOKE: hero pixels ${JSON.stringify(heroPixels)}`)
    console.log(`SMOKE: hero opaque slabs ${JSON.stringify(heroSlabs, null, 1)}`)
    console.log(`SMOKE: hero region ${JSON.stringify(heroRegion, null, 1)}`)
    console.log(`SMOKE: hero hairline-bordered layers ${JSON.stringify(heroHairlines.map((entry) => entry.cls))}`)

    // Resize the window the way a fullscreen switch does, then re-measure: a
    // background that fails to rescale shows ground colour at the far edges.
    win.setSize(1700, 990)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const resizedPixels = await snapshot('desktop-resized')
    console.log(`SMOKE: resized pixels ${JSON.stringify(resizedPixels)}`)

    // The real fullscreen path, which is a different compositing route than a
    // plain resize: a stale background layer here is exactly "the picture did
    // not stretch with the window".
    win.setFullScreen(true)
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const fullScreenPixels = await snapshot('desktop-fullscreen')
    console.log(`SMOKE: fullscreen pixels ${JSON.stringify(fullScreenPixels)}`)
    win.setFullScreen(false)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Phase 2 — the chat: expand the workspace groups and open a real session,
    // because the conversation only then mounts its inner layers.
    const openedSession = await win.webContents.executeJavaScript(
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
    console.log(`SMOKE: opened session ${JSON.stringify(openedSession)}`)

    const report = await win.webContents.executeJavaScript(REPORT, true)
    const chatSlabs = await win.webContents.executeJavaScript(AUDIT, true)
    console.log(`SMOKE: chat opaque slabs ${JSON.stringify(chatSlabs, null, 1)}`)
    console.log(`SMOKE: probes ${JSON.stringify(report.probes, null, 1)}`)
    console.log(`SMOKE: report ${JSON.stringify(report, null, 2)}`)

    // The background must actually decode inside the page: a data URI is only
    // usable if the served page does not block it.
    const imageCheck = await win.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const el = document.querySelector('[data-slot="main.conversation"] > *');
        const css = el ? getComputedStyle(el).backgroundImage : '';
        const match = /url\\("(data:[^"]+)"\\)/.exec(css);
        if (!match) { resolve({ found: false }); return; }
        const img = new Image();
        img.onload = () => resolve({ found: true, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ found: true, decodeFailed: true });
        img.src = match[1];
      })`,
      true,
    )
    console.log(`SMOKE: background ${JSON.stringify(imageCheck)}`)

    fs.writeFileSync(path.join(outDir, 'desktop-window.png'), (await win.webContents.capturePage()).toPNG())
    const sidebar = await win.webContents.capturePage({ x: 0, y: 0, width: 330, height: 920 })
    fs.writeFileSync(path.join(outDir, 'sidebar-zones.png'), sidebar.toPNG())
    console.log(`SMOKE: screenshots -> ${outDir}`)

    // Phase 2 pixels: the artwork must still be visible behind a real session.
    console.log(
      `SMOKE: chat pixels ${JSON.stringify({
        top: await sample(720, 150),
        mid: await sample(720, 300),
        low: await sample(720, 520),
        bottom: await sample(720, 800),
        sidebar: await sample(140, 400),
      })}`,
    )

    for (const name of ['workspace', 'add-folder', 'sessions']) {
      if (!report.zones[name]) {
        console.error(`SMOKE: FAIL missing zone ${name}`)
        exitCode = 1
      }
    }
    if (!report.addFolderForwarding || !report.addFolderForwarding.forwarded) {
      console.error('SMOKE: FAIL add-folder action does not reach the app control')
      exitCode = 1
    }
    if (!report.workspaceList || report.workspaceList.items !== report.workspaceList.groups) {
      console.error('SMOKE: FAIL workspace list does not mirror the session tree groups')
      exitCode = 1
    }
    if (!report.workspaceForwarding || !report.workspaceForwarding.forwarded) {
      console.error('SMOKE: FAIL clicking a workspace does not reach the app new-session control')
      exitCode = 1
    }
    if ((report.heads || 0) < 2) {
      console.error('SMOKE: FAIL zone title rows missing (add-folder / sessions)')
      exitCode = 1
    }
    if (!report.appearance.prefersDark || report.appearance.flag !== 'true') {
      console.error('SMOKE: FAIL the app did not resolve to its dark appearance')
      exitCode = 1
    }
    if (!report.appearance.themeStyle || !report.appearance.conversationHasImage) {
      console.error('SMOKE: FAIL dark appearance layer missing the artwork')
      exitCode = 1
    }
    if (report.appearance.bodyPseudoImage) {
      console.error('SMOKE: FAIL a fixed full-window image layer is still present')
      exitCode = 1
    }
    /* The user-visible complaint this encodes: the picture must stay visible well
       down the window instead of collapsing to a black slab. */
    for (const [label, pixels] of [
      ['hero', heroPixels],
      ['resized', resizedPixels],
      ['fullscreen', fullScreenPixels],
    ]) {
      for (const point of ['top', 'mid', 'lowMid']) {
        if (!showsArtwork(pixels[point])) {
          console.error(`SMOKE: FAIL ${label} ${point} shows no artwork (${pixels[point]})`)
          exitCode = 1
        }
      }
    }
    if (!imageCheck.found || !imageCheck.width) {
      console.error('SMOKE: FAIL background image did not decode in the page')
      exitCode = 1
    }
    if (!report.appearance.cardBackdrop || report.appearance.cardBackdrop.indexOf('blur') === -1) {
      console.error('SMOKE: FAIL zone cards are not frosted glass')
      exitCode = 1
    }
    if (report.appearance.composerSeatCleared === false) {
      console.error('SMOKE: FAIL composer seat still stacks a second gradient (visible step)')
      exitCode = 1
    }
    if (
      report.appearance.composerWrapper &&
      (report.appearance.composerWrapper.border !== '0px' || report.appearance.composerWrapper.bg !== 'rgba(0, 0, 0, 0)')
    ) {
      console.error('SMOKE: FAIL composer wrapper is painted, so its rim shows around the card')
      exitCode = 1
    }
    if (heroHairlines.length > 1) {
      console.error(`SMOKE: FAIL ${heroHairlines.length} hairline-bordered layers near the composer at once`)
      exitCode = 1
    }
    if (!fadeStopsOk) {
      console.error('SMOKE: FAIL the configured fade anchors are missing from the stylesheet')
      exitCode = 1
    }
    if (exitCode === 0) {
      console.log(
        'SMOKE: PASS three zone cards + dark artwork layer (gaps: ' +
          `${JSON.stringify(report.gaps)}, workspaces: ${JSON.stringify(report.workspaceList.labels)}, ` +
          `fade: ${JSON.stringify(fadeStops)}, ground: ${report.appearance.ground}, ` +
          `image: ${imageCheck.width}x${imageCheck.height}, glass: ${report.appearance.cardBackdrop}, ` +
          `seat: ${report.appearance.composerSeatCleared ? 'cleared' : 'n/a'})`,
      )
    }

    // Opt-in: really click a workspace and watch the app's own workspace
    // registry gain a session for it. Writes only inside the test DSH_HOME.
    if (clickWorkspace) {
      const registryPath = process.env.DSH_HOME ? path.join(process.env.DSH_HOME, 'storages', 'workspace.json') : null
      const readRegistry = () => {
        try {
          const json = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
          const workspaces = Object.values(json.tables.workspaces)
          return {
            total: workspaces.reduce((sum, workspace) => sum + (workspace.sessionIds || []).length, 0),
            byTitle: Object.fromEntries(workspaces.map((w) => [w.title, (w.sessionIds || []).length])),
          }
        } catch (error) {
          return { total: -1, error: String((error && error.message) || error) }
        }
      }
      const before = readRegistry()
      const clicked = await win.webContents.executeJavaScript(
        `(() => {
          const items = document.querySelectorAll('#dsh-desktop-workspace-list .dsh-ws-item');
          if (items.length === 0) return null;
          let target = null;
          for (const item of items) {
            if (item.getAttribute('data-dsh-active') !== 'true') { target = item; break; }
          }
          if (!target) target = items[items.length - 1];
          const label = target.querySelector('.dsh-ws-name').textContent;
          target.click();
          return label;
        })()`,
        true,
      )
      await new Promise((resolve) => setTimeout(resolve, 6000))
      const after = readRegistry()
      const activeNow = await win.webContents.executeJavaScript(
        `(() => {
          const active = document.querySelector('#dsh-desktop-workspace-list .dsh-ws-item[data-dsh-active="true"] .dsh-ws-name');
          const current = document.querySelector('[data-dsh-zone="sessions"] [class*="_sessionRow"][class*="_selected"] [class*="_title"]');
          return { workspace: active ? active.textContent : null, sessionRow: current ? current.textContent : null };
        })()`,
        true,
      )
      console.log(`SMOKE: real click on ${JSON.stringify(clicked)}`)
      console.log(`SMOKE: registry before ${JSON.stringify(before)}`)
      console.log(`SMOKE: registry after  ${JSON.stringify(after)}`)
      console.log(`SMOKE: active workspace now ${JSON.stringify(activeNow)}`)
      const switched = activeNow.workspace === clicked
      const created = after.total > before.total
      if (!switched && !created) {
        console.error('SMOKE: FAIL clicking a workspace had no effect')
        exitCode = 1
      } else {
        console.log(
          `SMOKE: PASS workspace click took effect (switched=${switched}, created=${created})`,
        )
      }
    }

    if (keepOpen) {
      win.show()
      await new Promise((resolve) => setTimeout(resolve, 60000))
    }

    // Phase 3 — the desktop settings window, driving the real IPC surface.
    const userArtworkDir = path.join(app.getPath('userData'), 'artwork')
    /* Mirrors what the shell does: whatever the settings window writes is
       re-injected into the wrapped GUI. */
    const applyToGui = async () => {
      const fresh = readSettings(app.getPath('userData'))
      const artPath = resolveBackgroundPath(fresh.theme, { appRoot: ROOT, userArtworkDir })
      const freshOptions = buildZoneOptions(fresh.zones, {
        enabled: fresh.theme.enabled,
        css: buildThemeCss(fresh.theme, loadBackgroundDataUri(artPath)),
      })
      await win.webContents.executeJavaScript(buildZoneScript(freshOptions), true)
    }
    registerSettingsIpc({
      appRoot: ROOT,
      userDataDir: app.getPath('userData'),
      apply: applyToGui,
    })
    const settingsWin = openSettingsWindow({
      preload: path.join(ROOT, 'src', 'preload', 'preload.js'),
      rendererDir: path.join(ROOT, 'src', 'renderer'),
    })
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const settingsReport = await settingsWin.webContents.executeJavaScript(SETTINGS_REPORT, true)
    console.log(`SMOKE: settings window ${JSON.stringify(settingsReport)}`)
    fs.writeFileSync(path.join(outDir, 'settings-window.png'), (await settingsWin.webContents.capturePage()).toPNG())

    if (settingsReport.inputs < 15) {
      console.error(`SMOKE: FAIL settings window only rendered ${settingsReport.inputs} inputs`)
      exitCode = 1
    }
    if (settingsReport.presets !== 4 || settingsReport.palettes < 3) {
      console.error('SMOKE: FAIL settings window is missing the preset chips or palettes')
      exitCode = 1
    }
    if (!settingsReport.previewHasImage || !settingsReport.previewFade) {
      console.error('SMOKE: FAIL settings preview is not showing the artwork and fade')
      exitCode = 1
    }
    if (!settingsReport.artworkPath || settingsReport.artworkPath === '—') {
      console.error('SMOKE: FAIL settings window did not resolve the artwork path')
      exitCode = 1
    }
    if (settingsReport.status && settingsReport.status.indexOf('无法连接') !== -1) {
      console.error('SMOKE: FAIL settings window could not reach the main process')
      exitCode = 1
    }
    if (exitCode === 0) {
      console.log(
        `SMOKE: settings window OK (preset=${settingsReport.activePreset}, stops=${settingsReport.stops}, ` +
          `palettes=${settingsReport.palettes}, inputs=${settingsReport.inputs})`,
      )
    }

    /* Regression: the fade-anchor rows used to keep writing into a detached copy
       of the stop after the first save, so only the first drag ever took effect.
       Driving the real inputs twice is the only way to catch that. */
    const dragStop = (index, value) =>
      settingsWin.webContents.executeJavaScript(
        `(() => {
          const row = document.querySelectorAll('#stops .stop')[${index}];
          if (!row) return null;
          const range = row.querySelector('input[type=range]');
          range.value = ${JSON.stringify(String(value))};
          range.dispatchEvent(new Event('input', { bubbles: true }));
          range.dispatchEvent(new Event('change', { bubbles: true }));
          return range.value;
        })()`,
        true,
      )
    const storedStops = () => readSettings(app.getPath('userData')).theme.fadeStops
    const originalStops = JSON.parse(JSON.stringify(storedStops()))
    await dragStop(2, 0.6)
    await new Promise((resolve) => setTimeout(resolve, 900))
    const firstDrag = storedStops()[2][1]
    await dragStop(2, 0.35)
    await new Promise((resolve) => setTimeout(resolve, 900))
    const secondDrag = storedStops()[2][1]
    console.log(`SMOKE: fade anchor dragged twice -> ${firstDrag}, then ${secondDrag}`)
    if (Math.abs(firstDrag - 0.6) > 0.001 || Math.abs(secondDrag - 0.35) > 0.001) {
      console.error('SMOKE: FAIL repeated edits to the same control did not both persist')
      exitCode = 1
    } else {
      console.log('SMOKE: PASS repeated edits persist')
    }
    await settingsWin.webContents.executeJavaScript(
      `window.dshDesktop.setSettings({ theme: { fadeStops: ${JSON.stringify(originalStops)} } })`,
      true,
    )
    await new Promise((resolve) => setTimeout(resolve, 600))

    /* The promise of the settings UI: a change applies to the running GUI
       immediately, without a restart. */
    const gapBefore = await win.webContents.executeJavaScript(
      `getComputedStyle(document.documentElement).getPropertyValue('--dsh-zone-gap').trim()`,
      true,
    )
    await settingsWin.webContents.executeJavaScript(`window.dshDesktop.setSettings({ zones: { gap: 22 } })`, true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const gapAfter = await win.webContents.executeJavaScript(
      `getComputedStyle(document.documentElement).getPropertyValue('--dsh-zone-gap').trim()`,
      true,
    )
    console.log(`SMOKE: live apply zone gap ${JSON.stringify(gapBefore)} -> ${JSON.stringify(gapAfter)}`)
    if (gapAfter !== '22px') {
      console.error('SMOKE: FAIL a settings change did not reach the running GUI')
      exitCode = 1
    }
    await settingsWin.webContents.executeJavaScript(`window.dshDesktop.setSettings({ zones: { gap: 14 } })`, true)
    await new Promise((resolve) => setTimeout(resolve, 600))
    settingsWin.close()
  } catch (error) {
    console.error(`SMOKE: error ${error && error.stack ? error.stack : error}`)
    exitCode = 1
  } finally {
    await server.stop()
    app.exit(exitCode)
  }
})
