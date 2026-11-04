/* Titlebar + shell polish for the official Linux UI. Theme/zones are generated from settings before this. */
(() => {
  try {
    window.dshDesktop = window.dshDesktop || {};
    window.dshDesktop.menuAction = (action) => {
      try {
        if (action === 'new-session') {
          const button = document.querySelector('button[aria-label="新建会话"]');
          if (button) { button.click(); return true; }
        }
        if (action === 'settings') { void window.dshDesktop?.openUiSettings?.(); return true; }
        if (action === 'restart') { location.reload(); return true; }
        if (action === 'quit') { window.close(); return true; }
      } catch (error) { console.warn('dsh prototype action failed', error); }
      return false;
    };
    if (!window.dshDesktop.toggleMaximize) window.dshDesktop.toggleMaximize = () => {};
  } catch (error) { console.warn('dshDesktop fallback', error); }
  try {
    window.__DSH_TITLEBAR_OPTIONS__ = {"mode":"app","dark":true,"platform":"linux","height":40,"whaleSvg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 23.16 17.04\" fill=\"none\" aria-hidden=\"true\"><path d=\"M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z\" fill=\"#FFFFFF\"></path></svg>\n"};
    'use strict';

/**
 * 自定义标题栏 + 应用菜单。
 *
 * 本地页面通过 <script src="titlebar-page.js"> 加载；dsh 网页由主进程读取
 * 同一份源码后注入，并提前设置 window.__DSH_TITLEBAR_OPTIONS__。
 *
 * 菜单不用原生 Menu.popup：Linux 上隐藏菜单栏后弹出菜单并不可靠，这里用
 * 页面内的下拉菜单，动作统一走 preload 的 menuAction()，由主进程校验。
 */
(() => {
  if (!document.body) return;

  const opts = globalThis.__DSH_TITLEBAR_OPTIONS__ || {};
  const isApp = opts.mode === 'app';
  const platform = opts.platform || 'linux';
  const isMac = platform === 'darwin';
  const height = Number(opts.height) || 40;
  const right = isMac ? 14 : 148;
  const forcedTheme = document.body.dataset.dshTheme || '';
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const dark = typeof opts.dark === 'boolean'
    ? opts.dark
    : forcedTheme
      ? forcedTheme === 'dark'
      : !media.matches;

  const bg = dark ? '#0B1013' : '#F9FAFB';
  const fg = dark ? '#E7E9EF' : '#1F2937';
  const line = dark ? 'rgba(255,255,255,.07)' : 'rgba(15,23,42,.09)';
  const hover = dark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.06)';
  const dim = dark ? '#98A1AD' : '#6B7280';
  const panelBg = dark ? '#14181F' : '#FFFFFF';
  const panelLine = dark ? 'rgba(255,255,255,.09)' : 'rgba(15,23,42,.1)';

  const whale = opts.whaleSvg
    ? opts.whaleSvg
        .replace(/<svg[^>]*>/, '<svg class="dsh-titlebar-whale" viewBox="0 0 23.16 17.04" fill="none" aria-hidden="true">')
        .replace('fill="#FFFFFF"', 'fill="currentColor"')
    : '<img class="dsh-titlebar-whale" src="whale.svg" alt="" draggable="false" />';

  const style = document.getElementById('dsh-desktop-titlebar-style') || document.createElement('style');
  style.id = 'dsh-desktop-titlebar-style';
  style.textContent = `
:root { --dsh-titlebar-height: ${height}px; }
#dsh-desktop-titlebar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
  display: flex; align-items: center; gap: 10px;
  height: ${height}px; box-sizing: border-box;
  padding: 0 ${right}px 0 ${isMac ? 84 : 14}px;
  background: ${bg}; color: ${fg};
  border-bottom: 1px solid ${line};
  font-family: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 12px; font-weight: 600; line-height: 1; letter-spacing: .01em;
  -webkit-app-region: drag; user-select: none; cursor: default;
}
#dsh-desktop-titlebar.mac { padding: 0 14px 0 84px; }
#dsh-desktop-titlebar.light { background: #F9FAFB; color: #1F2937; border-bottom-color: rgba(15,23,42,.09); }
.dsh-titlebar-whale { width: 23px; height: 17px; display: block; flex: none; opacity: .96; pointer-events: none; }
#dsh-desktop-titlebar.light .dsh-titlebar-whale { filter: invert(1); }
.dsh-titlebar-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-titlebar-tag { flex: none; padding: 3px 6px; border: 1px solid ${line}; border-radius: 999px; color: ${dim}; font-size: 9.5px; font-weight: 500; letter-spacing: .04em; }
.dsh-titlebar-spacer { flex: 1; min-width: 12px; }
.dsh-titlebar-status { flex: none; display: flex; align-items: center; gap: 6px; color: ${dim}; font-size: 11px; font-weight: 500; -webkit-app-region: no-drag; }
.dsh-titlebar-dot { width: 6px; height: 6px; border-radius: 50%; background: #9AA1AD; box-shadow: 0 0 0 3px rgba(154,161,173,.12); }
#dsh-desktop-titlebar[data-state="ready"] .dsh-titlebar-dot { background: #3CCF91; box-shadow: 0 0 0 3px rgba(60,207,145,.14); }
#dsh-desktop-titlebar[data-state="starting"] .dsh-titlebar-dot,
#dsh-desktop-titlebar[data-state="restarting"] .dsh-titlebar-dot {
  background: #F5B74E; box-shadow: 0 0 0 3px rgba(245,183,78,.16);
  animation: dsh-titlebar-pulse 1.2s ease-in-out infinite;
}
#dsh-desktop-titlebar[data-state="failed"] .dsh-titlebar-dot,
#dsh-desktop-titlebar[data-state="stopped"] .dsh-titlebar-dot,
#dsh-desktop-titlebar[data-state="unhealthy"] .dsh-titlebar-dot {
  background: #FF6B6B; box-shadow: 0 0 0 3px rgba(255,107,107,.15);
}
@keyframes dsh-titlebar-pulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
.dsh-titlebar-menu {
  flex: none; -webkit-app-region: no-drag; display: grid; place-items: center;
  width: 28px; height: 26px; margin-left: 2px; padding: 0;
  border: 0; border-radius: 7px; background: transparent; color: inherit;
  cursor: pointer; opacity: .78;
}
.dsh-titlebar-menu:hover { background: ${hover}; opacity: 1; }
.dsh-titlebar-menu:focus-visible { outline: 2px solid #4D6BFE; outline-offset: 1px; }
#dsh-desktop-menu-panel {
  position: fixed; top: ${height + 6}px; right: ${right}px; z-index: 2147483647;
  width: 228px; padding: 6px; box-sizing: border-box;
  background: ${panelBg}; color: ${fg};
  border: 1px solid ${panelLine}; border-radius: 10px;
  box-shadow: 0 18px 48px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.04);
  -webkit-app-region: no-drag; user-select: none;
  font-family: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 12px; font-weight: 500;
  display: none;
}
#dsh-desktop-menu-panel.open { display: block; }
#dsh-desktop-menu-panel.light { background: #FFFFFF; color: #1F2937; border-color: rgba(15,23,42,.1); }
.dsh-titlebar-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 7px 9px; border: 0; border-radius: 6px;
  background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.dsh-titlebar-menu-item:hover { background: ${hover}; }
.dsh-titlebar-menu-item .shortcut { margin-left: auto; color: ${dim}; font-size: 10px; font-weight: 400; }
.dsh-titlebar-menu-sep { height: 1px; margin: 5px 6px; background: ${line}; }
@media (max-width: 820px) {
  .dsh-titlebar-tag, .dsh-titlebar-status .dsh-titlebar-label { display: none; }
}
${isApp ? `
html, body { height: 100% !important; margin: 0 !important; overflow: hidden !important; }
body { padding-top: ${height}px !important; box-sizing: border-box !important; }
#root { height: 100% !important; }
` : ''}
`;
  if (!style.isConnected) document.head.appendChild(style);

  const menuItems = [
    { action: 'new-session', label: '新建会话', shortcut: 'Ctrl+N' },
    { separator: true },
    { action: 'settings', label: '桌面端设置…', shortcut: 'Ctrl+,' },
    { action: 'restart', label: '重启本地服务', shortcut: 'Ctrl+Shift+T' },
    { action: 'browser', label: '在浏览器中打开' },
    { action: 'copy-url', label: '复制访问地址' },
    { separator: true },
    { action: 'logs', label: '查看运行日志' },
    { action: 'config-dir', label: '打开配置目录' },
    { separator: true },
    { action: 'quit', label: '退出' },
  ].map((item) => {
    if (item.separator) return '<div class="dsh-titlebar-menu-sep"></div>';
    const shortcut = isMac ? item.shortcut?.replace('Ctrl', '⌘') : item.shortcut;
    return `<button type="button" class="dsh-titlebar-menu-item" data-action="${item.action}">
      <span>${item.label}</span>${shortcut ? `<span class="shortcut">${shortcut}</span>` : ''}
    </button>`;
  }).join('');

  let bar = document.getElementById('dsh-desktop-titlebar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'dsh-desktop-titlebar';
    if (!dark) bar.classList.add('light');
    if (isMac) bar.classList.add('mac');
    bar.innerHTML = `
      ${whale}
      <span class="dsh-titlebar-title">DeepSeek Harness</span>
      <span class="dsh-titlebar-tag">桌面端</span>
      <span class="dsh-titlebar-spacer"></span>
      <span class="dsh-titlebar-status" title="本地服务状态">
        <span class="dsh-titlebar-dot"></span>
        <span class="dsh-titlebar-label">本地服务</span>
      </span>
      <button class="dsh-titlebar-menu" type="button" aria-label="菜单" title="菜单" aria-expanded="false">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2.2 4h9.6M2.2 7h9.6M2.2 10h9.6" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />
        </svg>
      </button>
    `;
    document.body.prepend(bar);
  } else {
    bar.classList.toggle('light', !dark);
    bar.classList.toggle('mac', isMac);
  }

  let panel = document.getElementById('dsh-desktop-menu-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'dsh-desktop-menu-panel';
    panel.setAttribute('role', 'menu');
    document.body.appendChild(panel);
  }
  panel.classList.toggle('light', !dark);
  panel.innerHTML = menuItems;

  const label = bar.querySelector('.dsh-titlebar-label');
  const menuButton = bar.querySelector('.dsh-titlebar-menu');
  const setOpen = (open) => {
    panel.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const close = () => setOpen(false);

  const describe = (status) => {
    const phase = status && status.phase ? status.phase : 'idle';
    const map = {
      idle: '准备中',
      starting: '启动中',
      running: '就绪',
      ready: '就绪',
      restarting: '重启中',
      failed: '服务异常',
      stopped: '已停止',
      unhealthy: '服务无响应',
    };
    return { state: phase === 'running' ? 'ready' : phase, text: map[phase] || '本地服务' };
  };
  const setStatus = (status) => {
    const { state, text } = describe(status);
    if (label) label.textContent = text;
    bar.dataset.state = state;
  };

  if (!bar.dataset.bound) {
    bar.dataset.bound = '1';
    menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(!panel.classList.contains('open'));
    });
    bar.addEventListener('dblclick', (event) => {
      if (event.target.closest('button')) return;
      try { window.dshDesktop?.toggleMaximize?.(); } catch { /* ignore */ }
    });
    document.addEventListener('pointerdown', (event) => {
      if (!panel.classList.contains('open')) return;
      if (panel.contains(event.target) || bar.contains(event.target)) return;
      close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    panel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      close();
      try { window.dshDesktop?.menuAction?.(button.dataset.action); } catch { /* ignore */ }
    });

    if (window.dshDesktop?.getStatus) {
      window.dshDesktop.getStatus().then(setStatus).catch(() => {});
      window.dshDesktop.onStatus?.(setStatus);
    }
  } else if (window.dshDesktop?.getStatus) {
    window.dshDesktop.getStatus().then(setStatus).catch(() => {});
  }

  window.__dshDesktopTitlebar = {
    report: () => ({ ok: true, height, dark, menu: Boolean(panel) }),
    setStatus,
    close,
  };
})();

  } catch (error) { console.error('dsh prototype titlebar failed', error); }
  try {
    const css = 'html[data-dsh-dark="true"] [data-slot="sidebar.brand.mark"] svg,html[data-dsh-dark="true"] [data-slot="sidebar.brand.mark"] svg path{filter:none!important;fill:#FCFAF2!important;color:#FCFAF2!important}html[data-dsh-dark="true"] [class*="_copyVersion"],html[data-dsh-dark="true"] [class*="_copyVersion"] *{background:rgba(252,250,242,.10)!important;color:#FCFAF2!important;border-color:rgba(252,250,242,.14)!important}html[data-dsh-dark="true"] [class*="_headerBlank"],html[data-dsh-dark="true"] [class*="_headerBlank"]::before,html[data-dsh-dark="true"] [class*="_headerBlank"]::after{background:#0B1013!important}';
    const style = document.getElementById('dsh-official-ui-polish') || document.createElement('style');
    style.id = 'dsh-official-ui-polish'; style.textContent = css; document.head.appendChild(style);
  } catch (error) { console.error('dsh prototype polish failed', error); }
  try {
    const force = () => {
      const root = document.documentElement;
      if (!root) return;
      if (root.getAttribute('data-dsh-dark') !== 'true') root.setAttribute('data-dsh-dark', 'true');
      root.style.colorScheme = 'dark';
      if (document.body && getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)') document.body.style.backgroundColor = '#0B1013';
    };
    force();
    if (!window.__dshForceDark) {
      window.__dshForceDark = new MutationObserver(force);
      window.__dshForceDark.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dsh-dark'] });
    }
    const style = document.getElementById('dsh-force-dark') || document.createElement('style');
    style.id = 'dsh-force-dark';
    style.textContent = 'html[data-dsh-dark="true"],html[data-dsh-dark="true"] body{background-color:#0B1013!important;color-scheme:dark!important}';
    document.head.appendChild(style);
  } catch (error) { console.error('dsh force dark failed', error); }
})();
