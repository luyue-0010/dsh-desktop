# DeepSeek Harness Linux Desktop — our 0.4.0 refactor

This branch replaces the earlier thin Electron shell with a fork of the official
DeepSeek Harness desktop application (`apps/desktop`), ported to Linux.

- Upstream: https://github.com/deepseek-ai/deepseek-harness
- Upstream commit: `8bd073392eef6f54e921a093b95076248eb08cbb`
- Upstream desktop version: `0.2.2-alpha.3`
- Our milestone: `0.4.0-linux`

## What is included

- Official Electron 44.7 shell, `dsh-app://app` transport, bundled dsh runtime,
  Electron-Node Host and primary runtime.
- Linux x64 build target and `linux-unpacked`, AppImage and deb packaging.
- Frameless 40px titlebar + three-zone sidebar + dark artwork theme.
- Frameless dark welcome/login window.
- Linux tray, close-to-background, first-close notice and relaunch recovery.
- Settings-driven theme/zones/background from
  `~/.config/DeepSeek Harness/desktop-settings.json`.
- Desktop settings window with colors, labels, background preset and
  login autostart toggle (XDG `~/.config/autostart/deepseek-harness.desktop`).
- `chrome-sandbox` is shipped 0755 and the desktop/autostart entry uses
  `--no-sandbox` on this target. See `dsh-desktop` notes in the workspace.

## Build

```sh
pnpm install --frozen-lockfile
pnpm run build:artifacts
pnpm --filter @deepseek-ai/dsh-desktop run build
```

Linux packaging (unsigned):

```sh
pnpm --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts linux-x64 --unsigned --dir
# AppImage/deb: run electron-builder with DSH_DESKTOP_TARGET_PLATFORM=linux
```

## Run

```sh
DSH_HOME=/tmp/dsh-home \
DSH_DESKTOP_USER_DATA_DIR=/tmp/dsh-userdata \
TMPDIR=/tmp/dsh-tmp \
pnpm --filter @deepseek-ai/dsh-desktop run start
```

## Known limits

- Unsigned builds; no update feed.
- Linux release packaging is a fork-only extension; upstream releases target
  macOS/Windows.
- `--no-sandbox` is used because the installed path contains a space and
  Electron 44's SUID zygote path truncates on this host.
- `prototype-ui.js` remains a static fallback; the primary UI is settings-driven.
