---
name: electron-webapp-shell
description: Use when wrapping an existing web app or web UI in an Electron desktop shell, when restyling part of a web UI whose source you should not modify, or when a GUI change must be verified rather than eyeballed. Covers booting the real server, injecting insert-only UI, forwarding clicks to the app's own controls, and proving the result with rendered-pixel probes.
---

# Wrapping an existing web UI in an Electron shell

For turning a browser app into a desktop app **without forking it**, and for changing
pieces of its interface from the outside. The hard part is never Electron; it is
touching a React/Vue app you do not own without breaking its reconciliation, and
proving the result actually rendered.

## The five rules

1. **The wrapped app stays the source of truth.** Boot its real server as a child
   process and load the real URL. Never reimplement one of its features — the value
   of the shell is that every feature keeps working exactly as upstream built it.
2. **Recon the real DOM before writing one selector.** Reading the app's bundle and
   guessing class names wastes hours. Render it, dump the tree, and look for
   *semantic* anchors (`data-slot="…"`, `aria-label`, `role`) before hashed ones.
3. **Insert only. Never move a framework-managed node.** Moving a React node out of
   its parent makes `removeChild`/`insertBefore` throw on the next render and takes
   the app down with it. Adding your own siblings is safe; relocating theirs is not.
   Heal your inserts with a debounced `MutationObserver`.
4. **Forward clicks to the app's own controls.** To reuse an action, hide the real
   button (keep it clickable, e.g. `position:absolute;opacity:0`) and call
   `.click()` on it from yours. Reimplementing the flow drifts from upstream.
   `display:none` still receives programmatic clicks, so nothing is lost.
5. **Verify by rendered pixels, not computed styles.** `getComputedStyle` tells you
   the CSS applied; only a screenshot or a sampled pixel tells you what the user
   sees. A layer you never wrote can sit on top of the one you styled.

## Workflow

### 0. Recon

- Find how the app starts and what it prints when ready (a readiness line with a
  token URL is common) — parse that instead of polling a port.
- Render it once and dump: every `[data-slot]`, every element that paints a
  background, and the boxes/colours of the containers you intend to restyle.
- Note the app's states. An empty/landing state and a populated state often mount
  **different inner layers**; styling one and shipping is how seams get missed.

### 1. Shell

- Spawn the server on a free loopback port, parse the readiness URL, load it.
- Bring up the real runtime the app expects (for Node servers: a real `node`, not
  Electron-as-node — Electron's Node lacks internals some apps need).
- Shut down **only your own child pid** on quit. Never kill by command-line
  pattern: you will match the user's own processes.
- Expose desktop behaviour through a preload bridge (external links, downloads,
  window state) instead of patching the page's JS.

### 2. Inject

- One `<style>` per concern, installed from a single idempotent bootstrap that can
  be re-run safely. Re-running must be a no-op when nothing changed.
- Wrap everything in `try/catch`: a restyle must never be able to break the app.
- Give injected nodes stable ids and re-create them if the framework removed them.
- Only observe `childList`/`characterData`. Observing `attributes` while you write
  `data-*` attributes turns your own writes into an infinite loop.
- Gate restyles behind a flag on `<html>` (e.g. the resolved colour scheme) so the
  whole layer can step aside for users who pick a different appearance.

### 3. Verify — recipes that caught real bugs

- **Pixel sampling.** Read single pixels at *relative* coordinates so two window
  sizes can be compared. Prove content is visible where it should be, and that a
  background actually covers the far edges.
- **Layer census.** List every element in a region that paints a background,
  gradient, border, shadow or backdrop-filter, with its box. One oversized wrapper
  or one leftover mask shows up immediately.
- **Region probe.** `document.elementFromPoint()` at points of interest, then walk
  up to the first ancestor that paints — that names the layer hiding your work.
- **Both states.** Screenshot the empty state *and* the populated state.
- **Spec assertions.** If a value is configurable, assert it appears verbatim in the
  generated CSS (`rgba(…, 0.3) 50%`), so a refactor cannot silently change it.
- **Live apply.** Change a setting through the settings UI and read the running
  app's computed value back — the point of a settings UI is that it takes effect.
- **Repeated edit.** Drive the *same* control twice and assert both persisted.

### 4. Package

- Verify what is actually inside the archive (list the asar), not what you intended
  to ship: a missing asset only shows up at runtime.
- Generate icons without image dependencies if you can (a hand-written PNG/ICO
  encoder is ~80 lines and removes a build-time dependency).
- Newly built executables can be refused by OS security policy on some machines.
  Say so plainly instead of claiming a run you could not perform.

## Traps, and what they look like

| Symptom | Cause | Fix |
| --- | --- | --- |
| Hard-edged slab where a fade should be | You stacked a second gradient (the app's own mask) over yours. Opacity **multiplies**: any non-transparent mask must disagree with your gradient somewhere. | Remove the app's mask entirely and own the darkening in one gradient. |
| A rim or halo around a card | You painted a wrapper that is larger than the visible surface. | Paint only the innermost surface; leave structural wrappers untouched. |
| Coloured blotches in flat areas | A hard keep/replace branch amplified JPEG chroma noise. | Blend continuously: weight 0 must reproduce the base value exactly. |
| "Only the first edit takes effect" | The save handler replaced a state object, and row closures still wrote into the detached copy. | Merge in place (keep object/array/element identity), and resolve targets through the live state. |
| Pale background refused to desaturate | Hue-band masks gated on **HSL saturation**: a near-white tint has a huge HSL saturation and almost no chroma. | Gate on chroma (`max-min`). |
| Subject's colour can't be separated from a neighbouring object | Same hue, sometimes *more* chromatic. | Add a spatial gate (theme occupies the upper band, garment the lower) instead of chasing colour. |
| Background image doesn't cover after resize | A fixed full-window pseudo-element, or a layer sized to something narrower than the viewport. | Anchor the artwork to the element the user actually sees, or test coverage at 2+ window sizes. |

## Electron specifics worth knowing

- A confined/CI sandbox may refuse to start Chromium at all (no named pipes) — do
  not conclude the app is broken; escalate the permission or test elsewhere.
- `nativeTheme.themeSource = 'dark'` makes the page's own `prefers-color-scheme`
  resolve to dark, so the app's **own** dark tokens apply. This beats hand-painting
  variables and keeps text/token contrast the app's responsibility.
- A `file://` image is refused from an `http://` page; inline local assets as data
  URIs (or a custom protocol) instead of fighting the CSP.
- Put user-facing configuration in a **settings window** (its own BrowserWindow +
  IPC) rather than injecting a panel into the app: you get native file dialogs and
  zero risk to the app's reconciliation.
- Keep user data out of the app bundle: write to `userData`, and resolve assets in
  a clear order (explicit pick → derived beside it → bundled derived → bundled
  source). An explicit user choice must never silently fall back to a *different*
  shipped asset.

## Stop conditions

Stop and report rather than guess when:

- the app's own UI cannot express what was asked and you would have to move its
  nodes (rule 3) — say what you can do instead;
- a verification cannot be run in your environment (say which and why, and give the
  user a script to run it);
- the requirement is ambiguous in a way that changes the implementation — ask,
  with concrete options, instead of shipping a plausible-but-wrong interpretation.
