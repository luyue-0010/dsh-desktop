# DeepSeek Harness 桌面端

把 `dsh web` 的网页界面原样封装成 Windows 桌面应用（Electron），并把**左侧工作区拆成三张卡片**：工作区、添加文件夹、会话区——每张卡片带自己的标题、自己的子项，底部各压一条不同颜色的低饱和色条。

- 网页端功能**一个不少**：桌面端跑的就是真正的 `dsh web` 服务，前端代码零改动，桌面壳只做三件事——启动服务、套一层窗口、注入样式。
- 复用你现有的 `~/.dsh`：会话、工作区、模型与凭据配置全部沿用，不会另起一套数据。
- 暗色外观：整站走应用**自带**的深色主题，叠一张凌波丽背景图 + 上→下渐变（下部完全暗色），侧栏卡片与输入区等表面做毛玻璃。
- 免安装 exe 已产出：`dist\DeepSeek-Harness-0.1.0-portable.exe`（95.7 MB，双击即用）。
- 原生菜单、快捷键、外部链接交给系统浏览器、下载另存为、窗口位置记忆。

---

## 一、左侧三张分区卡片

自上而下三张卡片，各自**圆角 + 淡色底 + 一条彩色底边**，卡片之间留 14px 间距，每张卡片内部是「标题行 + 该分区的子项」：

| 分区卡片 | 标题 | 卡片里的子项 | 底边色（低饱和） |
| --- | --- | --- | --- |
| **① 工作区** | 工作区 | **所有已添加的工作区**，每个一行、可点；下方是搜索与视图选项 | 浅葱 `#33A6B8` |
| **② 添加文件夹** | 添加文件夹 | 「添加工作区」动作（点击即打开目录选择） | 山吹 `#FFB11B` |
| **③ 会话区** | 会话区 | 按工作区分组的会话树：每个工作区一个分组，组内是它的会话 | 錆青磁 `#86A697` |

配色全部取自日本传统色色卡 [nippon-color](https://ssshooter.github.io/nippon-color/)（`浅葱 ASAGI` / `山吹 YAMABUKI` / `錆青磁 SABISEIJI`），选中态统一用 **紅 KURENAI `#CB1B45`**——对应画面里的头发、驾驶服、眼睛。

**点击行为**：

- 点「工作区」里的某个工作区 → 切到该工作区并打开它的新会话位（应用的 `startSession(workspaceId)`）：该工作区还没有空白会话时会真的新建一条，已有就复用那条空会话。鼠标悬停时行尾会出现 `+` 提示，`aria-label` 与应用自己的按钮一致（「在“X”中新建会话」）。
- 点「添加文件夹」→ 走应用自带的目录选择流程；**添加完成后该工作区会立刻出现在「工作区」列表里**（列表是从实时会话树推导出来的，不缓存）。
- 「会话区」按工作区分组；点分组头可展开/收起，点会话行切换会话。

细节：

- 三张卡片**宽度一致**（实测均为 256px），底边线不会一长一短。
- 会话区里，**每个工作区是一个嵌套子块**：工作区行加粗并带蓝色左竖线，它下面的会话行缩进 6px、悬停/选中时左侧出现绿色竖线、选中行底色透一点鼠尾草绿。
- 侧栏收起成图标栏时，卡片外框与注入节点自动让位，恢复成应用原本的图标栏。
- 深浅色主题都适用（底色与描边用半透明色叠加）。
- 颜色、圆角、间距、内边距、标题文字全都能改，见「三、配置」。

### 它是怎么做到的

网页端是运行时按需加载的客户端插件，DOM 里带哈希类名（`hHd-Xa_regionArea`、`bhn1Oq_sectionHeader`…）。因此注入脚本：

1. 用**结构性锚点**定位侧栏（`_sidebarCol` → `_regionArea`），再用**类名后缀**（`_sectionHeader`、`_listArea`、`_groupSection`）识别与分组，不硬编码哈希；
2. 给区块打上 `data-dsh-zone="workspace|add-folder|sessions"`，样式只认这三个属性；
3. 「添加文件夹」卡片里的按钮是新建的真实 `<button>`，点击时调用应用**自己**那个「添加工作区」按钮的 `.click()`——原按钮留在 DOM 里（视觉隐藏但保留可点击），所以走的是同一条代码路径，不是重新实现；「工作区」卡片里的每一行同理，转发到该工作区行 hover 时才会露出的「＋新建会话」按钮（`aria-label` 为「在“X”中新建会话」）；
4. 只做**插入**、绝不搬动 React 自己的节点，因此不会破坏 React 的协调；再用 `MutationObserver`（childList + characterData）监听侧栏，重渲染/改名/新增工作区后自动同步卡片内容。

---

## 二、暗色外观层（背景图 / 渐变 / 毛玻璃）

叠在网页端之上的一层纯视觉改造，全部通过 `data-slot` 语义锚点与一个 `data-dsh-dark` 开关生效，不碰任何控件逻辑：

| 层 | 做法 |
| --- | --- |
| **底色** | `nativeTheme.themeSource = 'dark'` → 页面 `prefers-color-scheme: dark` 命中，应用**自己**的深色 token 全部生效（文字、边框、状态色都由应用给，不从外部重绘） |
| **背景图（挂在对话列上）** | 图片可直接铺在**对话列**（`[data-slot="main.conversation"] > *`）上，`cover` + 居中。挂在对话列而不是整窗固定层，是因为侧栏不透明、图片只有对话列看得见——这样人物**始终居中在真正可见的区域**，并且**随对话列一起缩放**（窗口变大→人物同比变大），不会出现「换了尺寸画面没跟上」 |
| **留色滤镜** | 默认用**离线派生**的留色版：整图转黑白，只保留**红瞳**与**蓝发**（另带衣领/胸前两点小红色留色）。派生由 `scripts/make-background.js` 在 Electron 的 canvas 上逐像素完成，一次性生成、运行时零开销——纯 CSS 滤镜做不到按色相选择性留色，硬做要上 SVG `feColorMatrix` 组合，既难调又拖累每次重绘 |
| **渐变** | 同一元素叠三层背景：① 一层极淡的平铺色（相当于图片不透明度）② 上→下淡出 ③ 图片。淡出是**锚点列表**，直接按配置输出到 CSS，线性插值：**0% 处 12% 暗 → 50% 处 44% 暗 → 70% 处 75% 暗 → 100% 处 100% 暗**。中段仍能看清画面，最后 30% 快速收暗 |
| **侧边栏** | **纯色不透明**（`#0B1013`），不铺图、不带渐变——`_sidebarCol`、侧栏根节点、以及中间的拖拽把手一起填色，不会漏出图片亮边 |
| **接缝** | 应用在输入框周边有两处会「露边」的东西：输入框下方自己的淡出带 `_composerSeat`（渐变到应用底色 `rgb(21,21,23)`），和比卡片**每边大 17px** 的外层包裹 `_root`。渐变叠加只会**相乘**，遮罩层只要不是全透明就一定会和主渐变产生色阶——所以遮罩被整层移除（明暗统一由对话列那一条渐变负责），外层包裹也不再上底色与描边，只留卡片本身一张玻璃面板 |
| **毛玻璃** | 侧栏三张卡片、会话头部、输入区（含 `_card`/`_root`/`_bar` 等内层）、右侧面板统一 `backdrop-filter: blur(18px) saturate(1.25)`；侧栏卡片落在平色底上，因此底色用半透明白（`rgba(252,250,242,.05)`）而不是加深底色，否则在平色底上会看不见 |

实现要点：

- 图片用 **data URI 内联**，而不是 `file://` 或自定义协议：`http://127.0.0.1` 页面加载 `file://` 子资源会被 Chromium 拒绝，自定义协议又要改写服务端响应头；367KB 的图 base64 后约 479KB，每次加载注入一次可以接受。
- 暗色层整体选择器前缀为 `html[data-dsh-dark="true"]`，这个标记由注入脚本按 `prefers-color-scheme` 实时维护；**在应用内把外观切成「浅色」就整层让位**，回到原生浅色界面（分区卡片也会切回浅色描边）。
- 只替换「表面」（background / backdrop-filter / border），不改文字与图标颜色——所以暗色下的可读性由应用自己负责，不会出现暗底浅色字这种对不上号的问题。
- 想调窗口大小/暗部起点，改 `theme.conversationFrom` 与 `theme.conversationOpaqueFrom`：前者越小顶部越透，后者越小暗部越早开始。

---

## 三、快速开始

### 方式 A：直接跑免安装 exe

```
dist\DeepSeek-Harness-0.1.0-portable.exe
```

双击即可，不写注册表、不留安装目录（运行时会解压到临时目录，退出后清理）。前提是**这台机器上有可用的 `@deepseek-ai/dsh` 与 Node.js**（见下方「前置条件」）。

### 方式 B：从源码启动

```powershell
cd "D:\DeepSeek Harness"

# 1) 装依赖（Electron 约 110MB；缓存放在项目内，避免写到用户目录）
$env:npm_config_cache="$PWD\.npm-cache"
$env:ELECTRON_CACHE="$PWD\.electron-cache"
npm install

# 2) 启动
npm start
```

也可以直接双击 `start.cmd`。

### 前置条件

- **Node.js**：`dsh web` 的 web profile 挂了 live 热重载插件，它要求真正的 Node 运行时（依赖 `--expose-internals`）。桌面端因此在 `PATH`、常见安装目录里找 `node`，**不会**退化用 Electron 自带的 Node；实在找不到时错误页会直接给出提示，可在 `dsh.nodePath` 里写死路径。
- **dsh 本体**：用 `npx @deepseek-ai/dsh web` 跑过一次即可。桌面端会自动在 npx 缓存、`node_modules`、全局安装目录里找它，取版本最新的那个。

首次启动会在后台起一个 `dsh web`（随机回环端口），拿到带 token 的地址后加载进窗口；启动过程有本地加载页，失败会显示错误页并附带服务日志尾部与修复建议。

> 桌面端**只会**关掉自己启动的那个子进程（`server.child.pid`），不会碰你其它的 `dsh` 进程。

---

## 四、配置

### 用界面配置（推荐）

菜单 **设置 → 桌面端设置…**（`Ctrl+,`）打开桌面端设置窗口，改完**即时生效**，无需重启：

| 分组 | 可调项 |
| --- | --- |
| 外观 | 是否启用暗色外观层、是否强制深色、暗色底颜色 |
| 背景图 | 选图（原生文件对话框，自动复制到应用数据目录）、四个预设（留色／纯黑白／黑金／原图）、重新生成派生图、用回内置图、不透明度 |
| 渐变 | 增删锚点、每个锚点的「位置 % / 暗度」，并有实时渐变条 |
| 侧栏分区 | 开关、行强调色、间距／圆角／内边距／底边宽度、三区配色 + 强调色、三套快速配色、三个标题文案 |
| 毛玻璃 | 模糊、饱和度、底色浓度 |
| dsh 运行时 | dsh 路径、node 路径、附加参数、启动超时 |
| 右侧预览 | 背景图 + 渐变 + 侧栏卡片的实时组合 |

窗口只读写桌面端自己的 `desktop-settings.json`，不碰应用自身的配置；每次保存都会把新样式重新注入到运行中的界面。

### 直接改 JSON

配置文件：`%APPDATA%\DeepSeek Harness\desktop-settings.json`（菜单「设置 → 打开桌面端配置目录」）。改完重启应用生效。

```json
{
  "zones": {
    "enabled": true,
    "colors": {
      "workspace": "#33A6B8",
      "addFolder": "#FFB11B",
      "sessions": "#86A697",
      "accent": "#CB1B45"
    },
    "accentWidth": 2,
    "radius": 14,
    "gap": 14,
    "padding": 8,
    "labels": {
      "addFolder": "添加文件夹",
      "sessions": "会话区",
      "emptyWorkspaces": "还没有工作区，点下面的「添加文件夹」加一个",
      "newSessionIn": "在“{name}”中新建会话"
    },
    "rowAccents": true
  },
  "theme": {
    "enabled": true,
    "forceDark": true,
    "image": "",
    "imagePreset": "selective",
    "imageOpacity": 0.92,
    "fadeStops": [[0, 0.12], [50, 0.44], [70, 0.75], [100, 1]],
    "glass": { "blur": 18, "saturation": 1.25, "opacity": 0.46 },
    "colors": { "ground": "#0B1013", "text": "#FCFAF2", "accent": "#CB1B45" }
  },
  "window": { "width": 1440, "height": 920, "alwaysOnTop": false },
  "dsh": {
    "command": "",
    "nodePath": "",
    "extraArgs": [],
    "startupTimeoutMs": 120000
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `zones.enabled` | `false` 关闭整个分区美化，恢复网页原样 |
| `zones.colors.*` | 三张卡片的底边色 + 选中态强调色（十六进制；填非十六进制则按原样输出） |
| `zones.accentWidth` | 底边色条粗细，0–8px |
| `zones.radius` | 卡片圆角，0–24px |
| `zones.gap` | 卡片之间的间距，0–40px |
| `zones.padding` | 卡片内边距，0–24px |
| `zones.labels.addFolder` | 「添加文件夹」卡片的标题；动作按钮文字仍取应用自己的 aria-label（中文界面下是「添加工作区」） |
| `zones.labels.sessions` | 「会话区」卡片的标题 |
| `zones.labels.emptyWorkspaces` | 一个工作区都没有时，「工作区」卡片里的提示文案 |
| `zones.labels.newSessionIn` | 「工作区」每行的 aria-label/悬浮提示，`{name}` 会替换成工作区名 |
| `zones.rowAccents` | 是否给工作区行/会话行加左侧同色竖线 |
| `theme.enabled` | `false` 关闭整个暗色外观层（背景图/渐变/毛玻璃），分区卡片不受影响 |
| `theme.forceDark` | 是否请求系统级深色外观。`false` 时跟随系统；系统为浅色时不套暗色层 |
| `theme.image` | 自定义背景图路径（jpg/png/webp）；留空则按 `imagePreset` 选用派生图 |
| `theme.imagePreset` | 背景图处理预设：`selective`（黑白 + 只留蓝发红瞳，默认）/ `mono`（纯黑白）/ `blackgold`（黑白加暖金）/ `none`（原图不动）。派生图在 `assets/background-<预设>.jpg`，缺文件会自动回退到原图 |
| `theme.imageOpacity` | 背景图整体强度，0.05–1（以一层淡色叠加实现） |
| `theme.fadeStops` | 向下变暗的锚点列表 `[百分比, 暗度]`（暗度 0–1）。默认 `[[0,0.12],[50,0.44],[70,0.75],[100,1]]`；写几个点就按几个点线性插值，例如只要「70% 处 40% 暗、底部全黑」就写 `[[0,0.1],[70,0.4],[100,1]]`。顺序会自动排序，缺 0%/100% 会自动补齐 |
| `theme.glass.*` | 毛玻璃配方：`blur`(0–40px) / `saturation`(1–2.5) / `opacity`(0–1 底色透明度) |
| `theme.colors.ground` | 暗色底（默认 黒橡 `#0B1013`） |
| `theme.colors.accent` | 选中态强调色（默认 紅 `#CB1B45`） |
| `dsh.command` | 手动指定 dsh：`.../@deepseek-ai/dsh/lib/bin.js`、dsh 包目录，或 `dsh` 可执行文件。留空自动探测 |
| `dsh.nodePath` | 手动指定 node 可执行文件；留空按 `PATH` → 常见安装目录 顺序探测 |
| `dsh.extraArgs` | 追加到 `dsh web --no-open --port <port>` 之后的参数 |

环境变量覆盖：`DSH_DESKTOP_USER_DATA`（改 userData 目录）、`DSH_DESKTOP_NODE`（指定 node）、`DSH_DESKTOP_DSH`（指定 dsh）。

> 如果你之前跑过第一版（高饱和蓝/橙/绿），启动时会把那份旧配色识别为「未改动的历史默认值」并自动升级到现在的低饱和配色；你自己手改过的颜色不会被覆盖。

---

## 五、菜单与快捷键

| 菜单项 | 快捷键 | 说明 |
| --- | --- | --- |
| **桌面端设置…** | `Ctrl+,` | 打开桌面端设置窗口（外观／背景图／渐变／分区／毛玻璃／运行时） |
| 新建会话 | `Ctrl+N` | 触发应用自带的「新会话」按钮 |
| 在浏览器中打开 | `Ctrl+Shift+O` | 用系统浏览器打开当前带 token 的地址 |
| 重启本地服务 | `Ctrl+Shift+T` | 关掉并重起后端子进程 |
| 重新加载 / 强制重新加载 | `Ctrl+R` / `Ctrl+Shift+R` | 刷新网页外壳 |
| 缩放 / 实际大小 / 全屏 | `Ctrl+=` `Ctrl+-` `Ctrl+0` / `F11` | |
| 开发者工具 | `F12` | |
| 窗口置顶 | — | 状态写入配置 |
| 打开 DSH_HOME / 配置目录 / 查看运行日志 | — | 便于排错 |

另外：外部链接与 `mailto:` 一律交给系统浏览器；下载走「另存为」对话框；剪贴板、通知等权限只对本地回环来源放行；页面内跳转到站外会被拦截并转交浏览器。

---

## 六、目录结构

```
src/main/main.js         应用入口：窗口、菜单、IPC、导航/下载/权限策略、生命周期、外观
src/main/dsh.js          定位 dsh / node + 管理 `dsh web` 子进程（就绪解析、日志、关闭）
src/main/zones.js        三分区核心：注入样式 + 页面内引导脚本（含暗色卡片变体）
src/main/theme.js        暗色外观层：背景图 data URI、淡出锚点、毛玻璃配方、日本传统色
src/main/artwork.js      背景图派生：留色/黑白/黑金 三个预设的逐像素算法（与设置窗口共用）
src/main/settings-window.js  桌面端设置窗口：IPC 与生命周期
src/main/settings.js     desktop-settings.json 的读取/合并/写入（含旧配色迁移）
src/preload/preload.js   contextBridge：window.dshDesktop
src/renderer/*.html      本地加载页、失败页与桌面端设置窗口
assets/background.jpg    原图（打包进 app.asar，运行时内联为 data URI）
assets/background-*.jpg  派生图：selective（留色）/ mono / blackgold
scripts/make-background.js  派生背景图：Electron canvas 逐像素处理，无第三方依赖
scripts/push-to-github.ps1  建私有仓库并推送（含代理与 TLS 后端自检）
scripts/smoke-test.js    端到端冒烟测试（真服务、真渲染、截图、断言分区 + 暗色层 + 淡出锚点 + 设置窗口）
scripts/dump-slots.js    列出页面所有 data-slot 锚点与容器底色（排查主题用）
scripts/dump-dom.js      把侧栏 DOM 结构打印出来（写选择器时用）
scripts/make-icon.js     零依赖生成 build/icon.ico（PNG/ICO 手写编码）
docs/plugin-marketplace.md   做成 DSH 插件上架的可行性评估（含证据与三条路径）
.dsh/skills/electron-webapp-shell/SKILL.md  本次会话方法论的技能包（项目级 skill）
build/icon.ico|.png      应用图标（三色分区瓷砖）
dist/                    打包产物（portable exe + win-unpacked）
LICENSE                  MIT
start.cmd                双击启动
```

## 七、验证

```powershell
npm run smoke                          # 端到端断言 + 截图
npm run smoke -- --click-workspace     # 额外做一次真实点击：验证点工作区确实切过去/建会话
npm run dump:dom -- "<带token的地址>"    # 需要时重新确认侧栏 DOM
npm run dump:slots                     # 重新确认暗色下的锚点与容器底色
npm run icon                           # 重新生成图标
npm run assets                         # 重新生成图标 + 留色背景图（换图后跑一次）
```

`npm run smoke` 会真起一个 `dsh web`、真渲染、并断言：

- 三张分区卡片都在、底边色正确（`rgb(51,166,184)` / `rgb(255,177,27)` / `rgb(134,166,151)`）、宽度一致、间距 14px、两个标题行存在；
- 「工作区」列表条数与会话树里的工作区分组数一致；
- 「添加文件夹」与「工作区」两个动作都能转发到应用原按钮（用捕获阶段拦截验证，不会弹出原生目录框、也不会真的建会话）；
- 暗色层就位：`data-dsh-dark=true`、ground 为 `#0B1013`、背景图层是 `z-index:-1` 且同时含渐变与图片、卡片 `backdrop-filter` 含 `blur`；
- 输入框周围的层级是干净的：`_composerSeat` 已清空（`background-image: none`）、外层包裹 `_root` 无底色无描边，且输入框邻域里**最多只有一张带发丝描边的图层**（卡片本身）——有外圈/硬边就会直接被这条断言抓住；
- 输入框邻域还会做一次**可见图层普查**（背景、渐变、描边、投影、毛玻璃），以及一次**不透明板块审计**（alpha ≥ 0.85 且非本层底色的板块，消息气泡与代码块属于正常内容，会被列出但不算问题）；
- 背景图在页面里**真的解码成功**（用 `new Image()` 加载那张 data URI，读到 2730×1536），以证明没有被 CSP 拦掉，并打印实际使用的是哪个预设（默认 `selective`）；
- **淡出锚点逐条比对**：配置里的每个 `[百分比, 暗度]` 都必须原样出现在生成的 CSS 里（例如 `rgba(11, 16, 19, 0.3) 50%`），改写数值后断言会跟着变；
- **首页与会话两种状态都测**：先截首页（`desktop-hero.png`），再展开工作区分组、点开一个有消息的会话截会话态（`desktop-window.png`），并对同一组坐标**采样真实渲染像素**（顶部应是画面的蓝灰、底部应是纯暗）。两个状态的取样一致，说明没有哪里被不透明层截断；
- **桌面端设置窗口也测**：走真实 IPC 打开窗口，断言控件数量、四个预设、三套配色、渐变锚点数值与预览里的背景图/渐变都在，并截 `settings-window.png`；
- **改动即时生效**：在设置窗口里把分区间距改成 22px，再回主界面读 `--dsh-zone-gap` 确认已变成 `22px`（然后恢复）；
- **连续编辑同一控件**：驱动渐变锚点滑块连拖两次（0.6 → 0.35），两次都必须落盘——这条专门盯「保存后闭包引用失效，只有第一次编辑生效」这类 bug。

最后在 `tmp/` 下产出 `desktop-hero.png`（首页）、`desktop-window.png`（会话态）、`sidebar-zones.png`（左侧栏特写）与 `settings-window.png`（设置窗口）。

加 `--click-workspace` 时会真的点一个**非当前**工作区，然后比对 `storages/workspace.json` 与当前工作区标记，确认操作生效（会往 `DSH_HOME` 里写会话，请配合独立测试目录使用）：

```powershell
$env:DSH_HOME="D:\DeepSeek Harness\.dsh-test"; npm run smoke -- --click-workspace
```

## 八、打包成免安装 exe

```powershell
$env:npm_config_cache="$PWD\.npm-cache"
$env:ELECTRON_BUILDER_CACHE="$PWD\.electron-builder-cache"
npm run dist        # = 生成图标 + electron-builder --win portable
```

产物：`dist\DeepSeek-Harness-0.1.0-portable.exe`（单文件、免安装、x64）。`dist\win-unpacked\` 是未压缩版本，便于排查。

打包配置在 `package.json` 的 `build` 字段；`files` 收 `src/**`、`assets/**`（背景图）、`package.json`、`README.md`，应用代码与图片打进 `resources/app.asar`。

两点注意：

- 打包后的 exe **仍需要目标机器上有 dsh 与 Node**（原因见「前置条件」）。它封装的是网页端界面，不是把整个 dsh 运行时一起塞进来。
- 刚打包出来的 exe 是未签名的新文件。若机器上有「阻止新生成可执行文件运行」这类安全策略/杀软规则（Defender 的 ASR 新文件信誉规则等），首次双击可能被拒绝，放行或稍后重试即可。

## 九、排错

- 日志：`%APPDATA%\DeepSeek Harness\desktop.log`（菜单「查看运行日志」）。能看到桌面端 PID、是否打包运行、探测到的 dsh 版本与路径、node 运行时来源、`dsh web` 的原始输出、`dsh web ready on port … (pid …)`、分区注入结果。
- **找不到 dsh**：先 `npx @deepseek-ai/dsh web` 跑一次，或在配置里写死 `dsh.command`。
- **报 `--expose-internals is required for HMR`**：说明用错了 Node 运行时（例如指向了 Electron 自带的 Node）。把 `dsh.nodePath` 指到真正的 `node.exe`。
- **一直卡在启动页**：看日志里 `dsh |` 开头的行；服务启动超时默认 120s，可调 `dsh.startupTimeoutMs`。
- **想要网页原样**：把 `zones.enabled` 与 `theme.enabled` 都设为 `false`。
- **想要浅色**：把 `theme.forceDark` 设为 `false`（跟随系统），或在应用内「设置 → 外观」选浅色——暗色层会自动让位。

## 十、已知限制

- 侧栏类名带构建哈希，本实现依赖类名**后缀**与结构锚点；若上游大改侧栏结构，分区可能失效（此时 `zones.enabled=false` 即可安全回退，应用本身不受影响）。
- 「添加文件夹」卡片与「会话区」标题行是注入节点，不在 React 树内；极端重渲染下由 MutationObserver 补回，可能有极短暂的空档。
- 「工作区」卡片里的列表是**镜像**（从会话树实时推导 + 点击转发到应用自己的按钮），不是把原节点搬过去——搬动 React 管理的节点会破坏它的协调。所以工作区的重命名/删除/拖拽排序仍在「会话区」的分组头上操作；「工作区」卡片负责「一眼看全所有工作区 + 一键在该工作区开会话」。
- 「添加工作区」在本地有显示器时走系统原生目录对话框（`dsh-host-directory-picker-auto` 的选择），这是应用自身行为，桌面端不做干预。
- 暗色外观层依赖 `prefers-color-scheme` 这个开关来判定「应用现在是深色」。如果你在应用内把外观设成显式的浅色、同时又关掉了 `theme.forceDark`，暗色层会整体关闭（这是刻意设计，避免暗底配浅色字）。
- 背景图是内联成 data URI 注入的（约 479KB/次）。换成很大的图会明显加长每次页面加载的注入耗时，建议 ≤1MB。

## 十一、推送到 GitHub

仓库已初始化并提交好，**你在自己的终端跑这一条**（我所在的沙箱里 git 无法联网）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1
```

脚本会依次：探测 GitHub 连通性（默认走代理 `http://10.28.2.62:8118`，并把可用的 `http.proxy` / `http.sslBackend` 写进**本仓库**的 `.git/config`）→ 有 `gh` 就直接建私有仓库并推送，没有 `gh` 就打开建仓页面、你点一下创建后再回车推送。

可选参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `-Proxy` | `http://10.28.2.62:8118` | 传 `-Proxy ''` 直连 |
| `-Visibility` | `private` | `public` 则建公开仓库 |
| `-Name` / `-Owner` | `dsh-desktop` / `luyue-0010` | |

> 我这边的实测：直连时 git 报 `schannel: AcquireCredentialsHandle failed`，加上代理并切到 OpenSSL 后端后 `ls-remote` 正常返回，所以脚本会先自检再动手。

## 十二、做成 DSH 插件？与本次方法论的技能包

- **上架可行性**：结论是「现状不能作为插件上架，但视觉层可以」——详见 [`docs/plugin-marketplace.md`](docs/plugin-marketplace.md)。要点：DSH 目前没有公开插件市场（没有目录服务/审核/上架页），「装插件」就是往 profile 里 `pnpm add` 一个声明了 `dsh.bundle.patch` 的 npm 包；而本项目是 Electron **宿主应用**，插件生命周期在 harness 进程内，没有对应插槽（`desktop` profile 还被官方保留）。真正可上架的是把三区侧栏 + 暗色外观重写成**客户端插件**（`dsh.client` + 浏览器 bundle）。
- **技能包**：本次会话的方法论已提炼为项目级 skill —— [`.dsh/skills/electron-webapp-shell/SKILL.md`](.dsh/skills/electron-webapp-shell/SKILL.md)。它把「怎么在不改上游源码的前提下封装并改造一个 Web UI」写成了可复用的流程与验证配方：五条硬规则（真服务为准、先侦察真实 DOM、只插入不搬动、转发点击而非重写、用渲染像素验收）、六种验证手段（像素取样 / 图层普查 / 区域探针 / 双状态截图 / 规格断言 / 连改两次），以及一份踩坑对照表。放在项目根目录即自动生效；复制到 `%USERPROFILE%\.dsh\skills\` 可全局可用。
