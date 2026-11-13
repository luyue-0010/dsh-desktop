# DeepSeek Harness Linux Desktop — our 0.4.1 refactor

This branch replaces the earlier thin Electron shell with a fork of the official
DeepSeek Harness desktop application, ported to Linux.

- Upstream: https://github.com/deepseek-ai/deepseek-harness
- Upstream commit: `ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c` (`dsh-v0.2.2-rc.2`)
- Upstream desktop version: `0.2.2-rc.2`
- Our milestone: `0.4.1-linux`

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
- Linux packages use `asar: false` because the Desktop Host is spawned as a
  plain Node child that cannot resolve modules inside an asar archive. The
  desktop/autostart entries also carry `--no-sandbox` on this target.

## Build

```sh
pnpm install --frozen-lockfile
pnpm run build:artifacts
pnpm --filter @deepseek-ai/dsh-desktop run build
```

Linux packaging (unsigned):

```sh
pnpm --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts linux-x64 --unsigned
```

## Known limits

- Unsigned builds; no update feed.
- Linux release packaging is a fork-only extension; upstream releases target
  macOS/Windows.
- `--no-sandbox` is used because the installed path contains a space and
  Electron 44's SUID zygote path truncates on this host.
- `prototype-ui.js` remains a static fallback; the primary UI is settings-driven.
