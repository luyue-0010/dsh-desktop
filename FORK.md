# DeepSeek Harness Linux Desktop — our 0.4.2 refactor

This branch replaces the earlier thin Electron shell with a fork of the official
DeepSeek Harness desktop application, ported to Linux.

- Upstream: https://github.com/deepseek-ai/deepseek-harness
- Upstream commit: `4b399c39a6d1479cd84ca591b4d7c88e24d38a96` (`dsh-v0.2.3-alpha.2`)
- Upstream desktop version: `0.2.3-alpha.2`
- Our milestone: `0.4.2-linux`

## What is included

- Official Electron 44.11 shell, `dsh-app://app` transport, bundled dsh runtime,
  Electron-Node Host and primary runtime.
- Linux x64 build target and `linux-unpacked`, AppImage and deb packaging.
- Frameless 40px titlebar + three-zone sidebar + dark artwork theme.
- Frameless dark welcome/login window.
- Linux tray, close-to-background, first-close notice and relaunch recovery.
- Settings-driven theme/zones/background from
  `~/.config/DeepSeek Harness/desktop-settings.json`.
- Desktop settings window with colors, labels, background preset and
  login autostart toggle (XDG `~/.config/autostart/deepseek-harness.desktop`).
- Platform (usage / top-up) overlay keeps its return bar below the Linux
  40px titlebar (`html[data-dsh-desktop-titlebar]` mark + overlay padding).
- Linux packages use `asar: false` because the Desktop Host is spawned as a
  plain Node child that cannot resolve modules inside an asar archive. The
  desktop/autostart entries also carry `--no-sandbox` on this target.
- `desktop-publisher` target schemas accept `linux-x64`; `prepare-runtime.ts`
  prefers a locally cached Electron zip so packaging works offline.

## Build

```sh
pnpm install --frozen-lockfile
pnpm run build:artifacts
pnpm --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts linux-x64 --unsigned
```

## Known limits

- Unsigned builds; no update feed.
- Linux release packaging is a fork-only extension; upstream releases target
  macOS/Windows.
- `--no-sandbox` is used because the installed path contains a space and
  Electron's SUID zygote path truncates on this host.
- `prototype-ui.js` remains a static fallback; the primary UI is settings-driven.
