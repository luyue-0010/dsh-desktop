'use strict'

/**
 * The left-sidebar three-zone restyle of the dsh web GUI.
 *
 * The web app renders its sidebar from CSS-module bundles, so class names carry
 * a per-build hash (`hHd-Xa_regionArea`, `bhn1Oq_sectionHeader`, ...). The
 * selectors here therefore match the *stable* class-name suffix — the part that
 * comes from the CSS-module key, not the hash — and resolve the live DOM from
 * the structural anchors `_sidebarCol` and `_regionArea` instead of hardcoding
 * hashes.
 *
 * Three cards, top to bottom, each with a title row and its own items inside:
 *   1. `workspace`  — “工作区”: the list of every added Workspace (clicking one
 *                     runs the app's own “new session in this workspace” action),
 *                     with the app's search and view-options controls below it.
 *   2. `add-folder` — “添加文件夹”: a full-width action that owns the app's own
 *                     “add workspace” control; clicks are forwarded to it, so the
 *                     directory flow stays exactly the app's. A workspace added
 *                     this way lands in the workspace list automatically, because
 *                     that list is derived from the live session tree.
 *   3. `sessions`   — “会话区”: the scrolling tree, where every workspace group
 *                     is a nested block holding that workspace's sessions.
 *
 * Only one kind of mutation is performed, and it is insert-only: new elements
 * are inserted, React's own nodes are never relocated, so reconciliation stays
 * valid. A MutationObserver re-applies everything after re-renders, and a
 * failure in here can never break the wrapped GUI.
 *
 * @module dsh-desktop/zones
 */

/** Expand `#rgb` / `#rrggbb` into an `rgba()` string; unparsable input passes through. */
function withAlpha(color, alpha) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || '').trim())
  if (!match) return String(color || 'transparent')
  let hex = match[1]
  if (hex.length === 3) hex = hex.split('').map((char) => char + char).join('')
  const value = Number.parseInt(hex, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** The shipped palette: three Japanese traditional colours from the nippon-color
 * chart plus the single warm accent — 浅葱 / 山吹 / 錆青磁 with 紅. */
const DEFAULT_COLORS = {
  workspace: '#33A6B8',
  addFolder: '#FFB11B',
  sessions: '#86A697',
  accent: '#CB1B45',
}

/** Clamp a numeric setting, falling back when it is not a finite number. */
function clamp(value, min, max, fallback) {
  const number = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

/** Normalize a settings `zones` block into a complete, validated config. */
function normalizeZoneConfig(zones = {}) {
  const colors = zones.colors || {}
  const labels = zones.labels || {}
  const addFolderLabel =
    typeof labels.addFolder === 'string' ? labels.addFolder : typeof zones.label === 'string' ? zones.label : ''
  return {
    enabled: zones.enabled !== false,
    accentWidth: clamp(zones.accentWidth !== undefined ? zones.accentWidth : zones.borderWidth, 0, 8, 2),
    radius: clamp(zones.radius, 0, 24, 14),
    gap: clamp(zones.gap, 0, 40, 14),
    padding: clamp(zones.padding, 0, 24, 8),
    rowAccents: zones.rowAccents !== false,
    labels: {
      addFolder: addFolderLabel,
      sessions: typeof labels.sessions === 'string' ? labels.sessions : '会话区',
      workspace: typeof labels.workspace === 'string' ? labels.workspace : '',
      emptyWorkspaces:
        typeof labels.emptyWorkspaces === 'string' && labels.emptyWorkspaces
          ? labels.emptyWorkspaces
          : '还没有工作区，点下面的「添加文件夹」加一个',
      newSessionIn:
        typeof labels.newSessionIn === 'string' && labels.newSessionIn
          ? labels.newSessionIn
          : '在“{name}”中新建会话',
    },
    colors: {
      workspace: colors.workspace || DEFAULT_COLORS.workspace,
      addFolder: colors.addFolder || DEFAULT_COLORS.addFolder,
      sessions: colors.sessions || DEFAULT_COLORS.sessions,
      accent: colors.accent || DEFAULT_COLORS.accent,
    },
  }
}

/**
 * Build the stylesheet injected into the web GUI.
 * @param zones - the raw `zones` settings block.
 * @returns CSS text scoped to the `data-dsh-*` attributes the bootstrap sets.
 */
function buildZoneCss(zones) {
  const c = normalizeZoneConfig(zones)
  const { workspace, addFolder, sessions, accent } = c.colors

  return `
/* DeepSeek Harness desktop — left sidebar three-zone cards (injected). */
:root {
  --dsh-zone-workspace: ${workspace};
  --dsh-zone-add: ${addFolder};
  --dsh-zone-sessions: ${sessions};
  --dsh-zone-accent: ${accent};
  --dsh-zone-gap: ${c.gap}px;
  --dsh-zone-pad: ${c.padding}px;
  --dsh-zone-radius: ${c.radius}px;
  --dsh-zone-border: ${c.accentWidth}px;
}

/* ---------- shared card shell ---------- */
[data-dsh-zone] {
  position: relative;
  box-sizing: border-box !important;
  border-radius: var(--dsh-zone-radius) !important;
  border: 1px solid var(--dsh-zone-line) !important;
  border-bottom: var(--dsh-zone-border) solid var(--dsh-zone-color) !important;
  background: var(--dsh-zone-fill) !important;
  background-image: none !important;
  padding: var(--dsh-zone-pad) !important;
  margin: 0 0 var(--dsh-zone-gap) !important;
}
[data-dsh-zone="workspace"] {
  --dsh-zone-color: var(--dsh-zone-workspace);
  --dsh-zone-fill: ${withAlpha(workspace, 0.07)};
  --dsh-zone-line: ${withAlpha(workspace, 0.2)};
}
[data-dsh-zone="add-folder"] {
  --dsh-zone-color: var(--dsh-zone-add);
  --dsh-zone-fill: ${withAlpha(addFolder, 0.07)};
  --dsh-zone-line: ${withAlpha(addFolder, 0.22)};
}
[data-dsh-zone="sessions"] {
  --dsh-zone-color: var(--dsh-zone-sessions);
  --dsh-zone-fill: ${withAlpha(sessions, 0.06)};
  --dsh-zone-line: ${withAlpha(sessions, 0.18)};
}

/* ---- dark appearance: flat dark sidebar, so the cards are translucent panels ---- */
html[data-dsh-dark="true"] [data-dsh-zone] {
  --dsh-zone-fill: var(--dsh-glass-panel, rgba(252, 250, 242, 0.05)) !important;
  --dsh-zone-line: var(--dsh-dark-hairline, rgba(252, 250, 242, 0.1)) !important;
  backdrop-filter: blur(var(--dsh-glass-blur, 18px)) saturate(var(--dsh-glass-sat, 1.25)) !important;
  -webkit-backdrop-filter: blur(var(--dsh-glass-blur, 18px)) saturate(var(--dsh-glass-sat, 1.25)) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32) !important;
}
html[data-dsh-dark="true"] [data-dsh-zone="add-folder"] .dsh-zone-action {
  background: rgba(252, 250, 242, 0.04);
}
html[data-dsh-dark="true"] [data-dsh-zone="add-folder"] .dsh-zone-action:hover {
  background: rgba(252, 250, 242, 0.1);
}
html[data-dsh-dark="true"] [data-dsh-zone="workspace"] .dsh-ws-item:hover {
  background: rgba(252, 250, 242, 0.08);
  border-color: var(--dsh-dark-hairline, rgba(252, 250, 242, 0.1));
}
html[data-dsh-dark="true"] [data-dsh-zone="workspace"] .dsh-ws-item[data-dsh-active="true"] {
  background: ${withAlpha(accent, 0.12)};
  border-color: ${withAlpha(accent, 0.5)};
}
html[data-dsh-dark="true"] [data-dsh-zone="sessions"] [class*="_sessionRow"][class*="_selected"] {
  background: ${withAlpha(accent, 0.12)} !important;
  box-shadow: inset 2px 0 0 0 ${accent} !important;
}

/* ---------- zone title rows ---------- */
[data-dsh-zone] .dsh-zone-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 20px;
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 20px;
  letter-spacing: 0.02em;
  color: var(--dsw-alias-label-tertiary, #8a8f98);
  user-select: none;
}
[data-dsh-zone] .dsh-zone-head-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: var(--dsh-zone-color);
}
[data-dsh-zone] .dsh-zone-head-label {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- zone 1: 工作区 ---------- */
[data-dsh-zone="workspace"] {
  height: auto !important;
  min-height: 40px !important;
  overflow: visible !important;
  flex-wrap: wrap !important;
  align-content: flex-start !important;
  justify-content: flex-start !important;
  row-gap: 6px !important;
}
/* The zone title claims a whole row, so the card reads as “title + its controls”
   without inserting an extra line-breaking element. */
[data-dsh-collapsed="false"] [data-dsh-zone="workspace"] [class*="_sectionLabel"] {
  flex: 0 0 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
}
[data-dsh-collapsed="false"] [data-dsh-zone="workspace"] [class*="_searchSlot"] {
  margin-left: auto !important;
}
[data-dsh-zone="workspace"] [class*="_sectionLabel"] {
  font-size: 12px !important;
  letter-spacing: 0.02em !important;
  color: var(--dsw-alias-label-tertiary, #8a8f98) !important;
}
[data-dsh-zone="workspace"] [class*="_sectionLabel"]::before {
  content: "" !important;
  display: inline-block !important;
  width: 6px !important;
  height: 6px !important;
  margin-right: 6px !important;
  border-radius: 2px !important;
  background: var(--dsh-zone-color) !important;
  vertical-align: 1px !important;
}

/* The workspace list: every added Workspace, one clickable row each. */
[data-dsh-zone="workspace"] .dsh-ws-list {
  flex: 0 0 100% !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
[data-dsh-zone="workspace"] .dsh-ws-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  margin: 0;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  text-align: left;
  color: var(--dsw-alias-label-primary, #111827);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
[data-dsh-zone="workspace"] .dsh-ws-item:hover {
  background: ${withAlpha(workspace, 0.14)};
  border-color: ${withAlpha(workspace, 0.26)};
}
[data-dsh-zone="workspace"] .dsh-ws-item[data-dsh-active="true"] {
  background: ${withAlpha(workspace, 0.1)};
  border-color: ${withAlpha(workspace, 0.22)};
  font-weight: 500;
}
[data-dsh-zone="workspace"] .dsh-ws-item:focus-visible {
  outline: 2px solid var(--dsh-zone-color);
  outline-offset: 1px;
}
[data-dsh-zone="workspace"] .dsh-ws-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--dsh-zone-color);
}
[data-dsh-zone="workspace"] .dsh-ws-icon svg { width: 16px; height: 16px; display: block; }
[data-dsh-zone="workspace"] .dsh-ws-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-dsh-zone="workspace"] .dsh-ws-plus {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--dsh-zone-color);
  opacity: 0;
  transition: opacity 0.15s ease;
}
[data-dsh-zone="workspace"] .dsh-ws-item:hover .dsh-ws-plus,
[data-dsh-zone="workspace"] .dsh-ws-item:focus-visible .dsh-ws-plus { opacity: 1; }
[data-dsh-zone="workspace"] .dsh-ws-empty {
  padding: 2px 8px 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8a8f98);
}

/* The app's own add-workspace control stays in the DOM — and clickable — but is
   rendered invisible; the card below is the visible affordance. */
[data-dsh-add-folder-source="1"] {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
  overflow: hidden !important;
}

/* ---------- zone 2: 添加文件夹 ---------- */
[data-dsh-zone="add-folder"] {
  display: block !important;
}
[data-dsh-zone="add-folder"] .dsh-zone-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  margin: 0;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  color: var(--dsw-alias-label-secondary, #4b5563);
  background: transparent;
  border: 1px dashed var(--dsh-zone-color);
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
[data-dsh-zone="add-folder"] .dsh-zone-action:hover {
  background: ${withAlpha(addFolder, 0.16)};
  color: var(--dsw-alias-label-primary, #111827);
}
[data-dsh-zone="add-folder"] .dsh-zone-action:focus-visible {
  outline: 2px solid var(--dsh-zone-color);
  outline-offset: 1px;
}
[data-dsh-zone="add-folder"] .dsh-zone-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--dsh-zone-color);
}
[data-dsh-zone="add-folder"] .dsh-zone-icon svg { width: 16px; height: 16px; display: block; }
[data-dsh-zone="add-folder"] .dsh-zone-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- zone 3: 会话区 ---------- */
[data-dsh-zone="sessions"] {
  display: flex !important;
  flex-direction: column !important;
}
[data-dsh-zone="sessions"] .dsh-zone-head { margin-bottom: 4px; }
/* Each workspace group is a nested block: its header row plus its sessions. */
[data-dsh-zone="sessions"] [class*="_groupSection"] + [class*="_groupSection"] {
  margin-top: 14px !important;
}
[data-dsh-zone="sessions"] [class*="_projectRow"] { font-weight: 500 !important; }
[data-dsh-zone="sessions"] [class*="_sessionRow"] { margin-left: 6px !important; }
[data-dsh-zone="sessions"] [class*="_sessionRow"][class*="_selected"] {
  background: ${withAlpha(sessions, 0.14)} !important;
}

/* ---------- row accents, tying rows to their zone colour ---------- */
[data-dsh-row="workspace"] { border-left: 2px solid var(--dsh-zone-workspace) !important; }
[data-dsh-row="sessions"] { border-left: 2px solid transparent !important; }
[data-dsh-row="sessions"]:hover,
[data-dsh-row="sessions"][class*="_selected"] {
  border-left-color: var(--dsh-zone-sessions) !important;
}

/* ---------- collapsed rail: no room for cards, so drop the chrome ---------- */
[data-dsh-collapsed="true"] [data-dsh-zone] {
  border: 0 !important;
  background: none !important;
  padding: 0 !important;
  margin: 0 0 8px !important;
  border-radius: 0 !important;
}
[data-dsh-collapsed="true"] [data-dsh-zone="add-folder"],
[data-dsh-collapsed="true"] .dsh-zone-head {
  display: none !important;
}
`
}

/**
 * The page-context bootstrap. Serialized with `Function.prototype.toString` and
 * executed through `webContents.executeJavaScript`, so it must stay
 * self-contained: no imports, no closure over module scope.
 *
 * @param opts - style id, css text, node ids, labels, and feature switches.
 * @returns a small report describing what was tagged.
 */
function sidebarZonesBootstrap(opts) {
  var STATE_KEY = '__dshDesktopSidebarZones'
  var state = window[STATE_KEY] || (window[STATE_KEY] = { attempts: 0, observer: null, frame: 0 })

  function classTokens(el) {
    var raw = (el && el.getAttribute && el.getAttribute('class')) || ''
    return raw ? raw.split(/\s+/) : []
  }

  /** True when one class token ends with `_<name>` (hash-agnostic match). */
  function hasToken(el, name) {
    var tokens = classTokens(el)
    var suffix = '_' + name
    for (var i = 0; i < tokens.length; i += 1) {
      if (tokens[i].length > suffix.length && tokens[i].slice(-suffix.length) === suffix) return true
    }
    return false
  }

  /** Depth-first search for the first element carrying the `_<name>` token. */
  function findToken(scope, name) {
    if (!scope) return null
    if (hasToken(scope, name)) return scope
    var all = scope.querySelectorAll('*')
    for (var i = 0; i < all.length; i += 1) {
      if (hasToken(all[i], name)) return all[i]
    }
    return null
  }

  function ensureStyleTag(id, css) {
    var tag = document.getElementById(id)
    if (!tag) {
      tag = document.createElement('style')
      tag.id = id
      tag.setAttribute('data-dsh-desktop', id)
      ;(document.head || document.documentElement).appendChild(tag)
    }
    if (tag.textContent !== css) tag.textContent = css
    return tag
  }

  function removeStyleTag(id) {
    var tag = document.getElementById(id)
    if (tag && tag.parentNode) tag.parentNode.removeChild(tag)
  }

  /** Install or drop every configured stylesheet (zone cards and dark layer). */
  function applyStyles() {
    var styles = opts.styles || []
    for (var i = 0; i < styles.length; i += 1) {
      var sheet = styles[i]
      if (sheet.enabled === false) removeStyleTag(sheet.id)
      else ensureStyleTag(sheet.id, sheet.css)
    }
  }

  /**
   * Mirror the app's effective appearance onto <html>. The dark appearance layer
   * is keyed off this flag, so a user who picks the light appearance inside the
   * app keeps the stock UI untouched.
   */
  /**
   * The app mirrors its effective appearance on `<body data-ds-dark-theme>`.
   * Prefer that flag (it also follows the in-app Appearance switch) and fall
   * back to the OS preference before the app has mounted.
   */
  function currentDark() {
    var body = document.body
    if (body && body.hasAttribute('data-ds-dark-theme')) return true
    if (body && body.getAttribute('style') && /color-scheme:\s*light/.test(body.getAttribute('style'))) return false
    if (typeof matchMedia === 'function') return matchMedia('(prefers-color-scheme: dark)').matches
    return true
  }

  function syncAppearance() {
    var dark = currentDark()
    document.documentElement.setAttribute('data-dsh-dark', dark ? 'true' : 'false')
    return dark
  }

  /** Re-apply when the OS or the in-app appearance flips. */
  function watchAppearance() {
    var onChange = function () {
      try {
        apply()
      } catch (error) {
        /* a restyle must never break the app */
      }
    }
    if (!state.media && typeof matchMedia === 'function') {
      state.media = matchMedia('(prefers-color-scheme: dark)')
      if (typeof state.media.addEventListener === 'function') state.media.addEventListener('change', onChange)
      else if (typeof state.media.addListener === 'function') state.media.addListener(onChange)
    }
    if (!state.bodyObserver && typeof MutationObserver === 'function' && document.body) {
      state.bodyObserver = new MutationObserver(onChange)
      state.bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })
    }
  }

  /** Build a zone title row (coloured dot + label). */
  function buildHead(label) {
    var head = document.createElement('div')
    head.className = 'dsh-zone-head'
    head.setAttribute('data-dsh-zone-head', '')
    var dot = document.createElement('span')
    dot.className = 'dsh-zone-head-dot'
    var text = document.createElement('span')
    text.className = 'dsh-zone-head-label'
    text.textContent = label || ''
    head.appendChild(dot)
    head.appendChild(text)
    return head
  }

  /** Resolve the left sidebar column, its root, and its region container. */
  function resolveSidebar() {
    var col = document.querySelector('[class*="_sidebarCol"]')
    if (!col) return null
    var region = findToken(col, 'regionArea')
    var root = findToken(col, 'root')
    if (!region || !root || !root.contains(region)) return null
    return { col: col, root: root, region: region }
  }

  /** The app's own “add workspace” control: label match first, else last action. */
  function resolveAddButton(region) {
    var scope = findToken(region, 'headerActions') || region
    var buttons = scope.querySelectorAll('button')
    var pattern = opts.addButtonPattern ? new RegExp(opts.addButtonPattern, 'i') : null
    for (var i = 0; i < buttons.length; i += 1) {
      var label = buttons[i].getAttribute('aria-label') || buttons[i].getAttribute('title') || ''
      if (pattern && pattern.test(label)) return buttons[i]
    }
    return buttons.length ? buttons[buttons.length - 1] : null
  }

  /** Create or refresh the “添加文件夹” card and its forwarded action. */
  function ensureAddCard(root, listArea) {
    var source = resolveAddButton(root)
    if (!source) return null
    source.setAttribute(opts.sourceAttr, '1')

    var card = document.getElementById(opts.stripId)
    if (!card) {
      card = document.createElement('div')
      card.id = opts.stripId
      card.setAttribute('data-dsh-zone', 'add-folder')
      card.setAttribute('role', 'group')

      card.appendChild(buildHead(opts.labels.addFolder))

      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'dsh-zone-action'
      button.setAttribute('data-dsh-zone-action', 'add-folder')
      var icon = document.createElement('span')
      icon.className = 'dsh-zone-icon'
      var label = document.createElement('span')
      label.className = 'dsh-zone-label'
      button.appendChild(icon)
      button.appendChild(label)

      button.addEventListener(
        'click',
        function (event) {
          event.preventDefault()
          event.stopPropagation()
          var live = resolveAddButton(root)
          if (live) live.click()
        },
        true,
      )
      card.appendChild(button)
    }

    // The list area lives inside the workspace browser's own root, not directly
    // under the sidebar root, so insert relative to whatever holds the list.
    var container = (listArea && listArea.parentNode) || root
    if (listArea && (card.parentNode !== container || card.nextSibling !== listArea)) {
      container.insertBefore(card, listArea)
    } else if (!listArea && card.parentNode !== container) {
      container.appendChild(card)
    }

    var headLabel = card.querySelector('.dsh-zone-head-label')
    var headText = opts.labels.addFolder || ''
    if (headLabel && headLabel.textContent !== headText) headLabel.textContent = headText

    var live = resolveAddButton(root)
    var text = (live && live.getAttribute('aria-label')) || opts.labels.addFolder || '添加文件夹'
    var labelSlot = card.querySelector('.dsh-zone-label')
    if (labelSlot && labelSlot.textContent !== text) labelSlot.textContent = text
    var action = card.querySelector('.dsh-zone-action')
    if (action) action.setAttribute('aria-label', text)

    var iconSlot = card.querySelector('.dsh-zone-icon')
    var svg = live && live.querySelector('svg')
    var wanted = svg ? svg.outerHTML : ''
    if (iconSlot && iconSlot.getAttribute('data-dsh-icon') !== wanted) {
      if (svg) iconSlot.replaceChildren(svg.cloneNode(true))
      else iconSlot.replaceChildren()
      iconSlot.setAttribute('data-dsh-icon', wanted)
    }
    return card
  }

  /** Put the “会话区” title row at the top of the tree card. */
  function ensureSessionsHead(listArea) {
    if (!listArea) return null
    var head = document.getElementById(opts.sessionsHeadId)
    if (!head) {
      head = buildHead(opts.labels.sessions)
      head.id = opts.sessionsHeadId
    }
    if (listArea.firstChild !== head) listArea.insertBefore(head, listArea.firstChild)
    return head
  }

  /** Read every added Workspace out of the session tree, in render order. */
  function collectWorkspaces(region) {
    var groups = region.querySelectorAll('[class*="_groupSection"]')
    var items = []
    for (var i = 0; i < groups.length; i += 1) {
      var row = findToken(groups[i], 'projectRow')
      if (!row) continue
      var titleEl = findToken(row, 'title')
      var folderSlot = findToken(row, 'folder')
      var icon = folderSlot ? folderSlot.querySelector('svg') : null
      items.push({
        index: i,
        label: titleEl ? (titleEl.textContent || '').trim() : '',
        active: folderSlot ? hasToken(folderSlot, 'folderActive') : false,
        icon: icon ? icon.outerHTML : '',
      })
    }
    return items
  }

  /**
   * Run the app's own “new session in this workspace” action. The control lives
   * in the tree row's hover actions; clicking it here reuses that exact handler.
   */
  function activateWorkspace(region, index) {
    var group = region.querySelectorAll('[class*="_groupSection"]')[index]
    if (!group) return false
    var row = findToken(group, 'projectRow')
    if (!row) return false
    var actions = row.querySelector('[class*="_rowActions"]')
    var buttons = (actions || row).querySelectorAll('button')
    if (buttons.length > 0) {
      buttons[buttons.length - 1].click()
      return true
    }
    var provisional = group.querySelector('[class*="_sessionRow"]')
    if (provisional) {
      provisional.click()
      return true
    }
    return false
  }

  /** Create or refresh the “工作区” card's list of added workspaces. */
  function ensureWorkspaceList(header, region) {
    if (!header) return null
    var items = collectWorkspaces(region)
    var list = document.getElementById(opts.wsListId)
    if (!list) {
      list = document.createElement('div')
      list.id = opts.wsListId
      list.className = 'dsh-ws-list'
      list.setAttribute('role', 'list')
    }
    var label = findToken(header, 'sectionLabel')
    if (label && label.nextSibling !== list) header.insertBefore(list, label.nextSibling)
    else if (!label && list.parentNode !== header) header.appendChild(list)

    var signature = JSON.stringify(items.map(function (item) {
      return [item.label, item.active, item.icon]
    }))
    if (list.getAttribute('data-dsh-signature') === signature) return list
    list.setAttribute('data-dsh-signature', signature)

    var nodes = []
    for (var i = 0; i < items.length; i += 1) {
      nodes.push(buildWorkspaceItem(items[i], region))
    }
    if (nodes.length === 0) {
      var empty = document.createElement('div')
      empty.className = 'dsh-ws-empty'
      empty.textContent = opts.labels.emptyWorkspaces || ''
      nodes.push(empty)
    }
    list.replaceChildren.apply(list, nodes)
    return list
  }

  /** One workspace row: folder icon, name, and a “+ new session here” hint. */
  function buildWorkspaceItem(item, region) {
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'dsh-ws-item'
    button.setAttribute('role', 'listitem')
    button.setAttribute('data-dsh-ws-index', String(item.index))
    button.setAttribute('data-dsh-active', item.active ? 'true' : 'false')
    var aria = (opts.labels.newSessionIn || '').replace('{name}', item.label)
    if (aria) {
      button.setAttribute('aria-label', aria)
      button.setAttribute('title', aria)
    }

    var icon = document.createElement('span')
    icon.className = 'dsh-ws-icon'
    if (item.icon) icon.innerHTML = item.icon
    var name = document.createElement('span')
    name.className = 'dsh-ws-name'
    name.textContent = item.label
    var plus = document.createElement('span')
    plus.className = 'dsh-ws-plus'
    plus.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'

    button.appendChild(icon)
    button.appendChild(name)
    button.appendChild(plus)
    button.addEventListener(
      'click',
      function (event) {
        event.preventDefault()
        event.stopPropagation()
        activateWorkspace(region, item.index)
      },
      true,
    )
    return button
  }

  function clearZoneMarks() {
    var marked = document.querySelectorAll('[data-dsh-zone], [data-dsh-row], [data-dsh-collapsed], [' + opts.sourceAttr + ']')
    for (var i = 0; i < marked.length; i += 1) {
      marked[i].removeAttribute('data-dsh-zone')
      marked[i].removeAttribute('data-dsh-row')
      marked[i].removeAttribute('data-dsh-collapsed')
      marked[i].removeAttribute(opts.sourceAttr)
    }
    var injected = [opts.stripId, opts.sessionsHeadId, opts.wsListId]
    for (var k = 0; k < injected.length; k += 1) {
      var node = document.getElementById(injected[k])
      if (node && node.parentNode) node.parentNode.removeChild(node)
    }
  }

  function apply() {
    syncAppearance()
    applyStyles()
    if (!opts.enabled) {
      clearZoneMarks()
      return { ok: true, disabled: true }
    }

    var found = resolveSidebar()
    if (!found) return { ok: false, reason: 'sidebar-not-mounted' }

    var marks = []
    var collapsed = hasToken(found.root, 'collapsed')
    found.root.setAttribute('data-dsh-collapsed', collapsed ? 'true' : 'false')

    var header = findToken(found.region, 'sectionHeader')
    if (header) {
      header.setAttribute('data-dsh-zone', 'workspace')
      marks.push('workspace')
      if (!collapsed && ensureWorkspaceList(header, found.region)) marks.push('workspace-list')
    }

    var listArea = findToken(found.region, 'listArea')
    if (listArea) {
      listArea.setAttribute('data-dsh-zone', 'sessions')
      marks.push('sessions')
      if (!collapsed) ensureSessionsHead(listArea)
    }

    if (!collapsed && listArea && ensureAddCard(found.root, listArea)) marks.push('add-folder')

    if (opts.rowAccents) {
      var projectRows = found.region.querySelectorAll('[class*="_projectRow"]')
      for (var i = 0; i < projectRows.length; i += 1) projectRows[i].setAttribute('data-dsh-row', 'workspace')
      var sessionRows = found.region.querySelectorAll('[class*="_sessionRow"]')
      for (var j = 0; j < sessionRows.length; j += 1) sessionRows[j].setAttribute('data-dsh-row', 'sessions')
    }

    return { ok: true, marks: marks, collapsed: collapsed }
  }

  function observe(col) {
    if (state.observer) state.observer.disconnect()
    state.observer = new MutationObserver(function () {
      if (state.frame) return
      state.frame = requestAnimationFrame(function () {
        state.frame = 0
        try {
          apply()
        } catch (error) {
          /* a restyle must never break the app */
        }
      })
    })
    // `attributes` stays unobserved on purpose: apply() writes data-dsh-* on
    // every pass, and observing attributes would turn that into a feedback loop.
    state.observer.observe(col, { childList: true, subtree: true, characterData: true })
  }

  function run() {
    var found = resolveSidebar()
    if (!found) {
      if (state.attempts < 80) {
        state.attempts += 1
        setTimeout(run, 500)
      }
      return { ok: false, reason: 'sidebar-not-mounted', attempts: state.attempts }
    }
    state.attempts = 0
    watchAppearance()
    var report
    try {
      report = apply()
    } catch (error) {
      report = { ok: false, reason: 'apply-failed', message: String((error && error.message) || error) }
    }
    observe(found.col)
    return report
  }

  state.run = run
  state.apply = apply
  return run()
}

/**
 * Serialize the bootstrap plus its options into an evaluable expression.
 * @param options - style id, css, node ids, labels, pattern, and switches.
 * @returns a single JavaScript expression for `executeJavaScript`.
 */
function buildZoneScript(options) {
  return `(${sidebarZonesBootstrap.toString()})(${JSON.stringify(options)});`
}

/** The aria-label pattern that identifies the app's own “add workspace” control. */
const ADD_BUTTON_PATTERN = 'add\\s+(workspace|folder)|添加工作区|添加文件夹|新增工作区'

/**
 * Build the injected-options object for a settings block.
 * @param zones - the raw `zones` settings block.
 * @param theme - optional `{ css, enabled }` for the dark appearance layer.
 * @returns options for {@link buildZoneScript}.
 */
function buildZoneOptions(zones, theme) {
  const config = normalizeZoneConfig(zones)
  const styles = [
    { id: 'dsh-desktop-zone-style', css: buildZoneCss(zones), enabled: config.enabled },
  ]
  if (theme && theme.css) {
    styles.push({ id: 'dsh-desktop-theme-style', css: theme.css, enabled: theme.enabled !== false })
  }
  return {
    enabled: config.enabled,
    styles: styles,
    styleId: 'dsh-desktop-zone-style',
    stripId: 'dsh-desktop-add-folder',
    sessionsHeadId: 'dsh-desktop-zone-head-sessions',
    wsListId: 'dsh-desktop-workspace-list',
    sourceAttr: 'data-dsh-add-folder-source',
    labels: {
      addFolder: config.labels.addFolder || '添加文件夹',
      sessions: config.labels.sessions,
      emptyWorkspaces: typeof config.labels.emptyWorkspaces === 'string' ? config.labels.emptyWorkspaces : '',
      newSessionIn: typeof config.labels.newSessionIn === 'string' ? config.labels.newSessionIn : '',
    },
    rowAccents: config.rowAccents,
    addButtonPattern: ADD_BUTTON_PATTERN,
  }
}

module.exports = {
  ADD_BUTTON_PATTERN,
  DEFAULT_COLORS,
  buildZoneCss,
  buildZoneOptions,
  buildZoneScript,
  normalizeZoneConfig,
  sidebarZonesBootstrap,
  withAlpha,
}
