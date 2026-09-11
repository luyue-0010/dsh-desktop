# 做成 DSH 插件上架：可行性评估

评估对象：本仓库（DeepSeek Harness 桌面端壳），DSH 版本 `0.1.5-rc.1`（本机 npx 安装）。
所有结论都基于本机安装里可核对的证据，不靠猜。

## 一、结论（先看这里）

1. **现状不能作为插件上架。** 本项目是 Electron **宿主应用**：它自己启动 `dsh web` 子进程。而 DSH 插件的生命周期发生在 harness 进程树内（Node / cordis）或浏览器客户端内，**没有「桌面壳插件」这个插槽**。另外 CLI 明确把 `desktop` profile 保留给官方 Electron 应用（`rejectElectronProfile`）。
2. **DSH 目前没有公开的插件市场。** 没有目录服务、没有审核流程、没有上架页面。「安装插件」= 往某个 profile 里 `pnpm add` 一个声明了 `dsh.bundle.patch` 的 npm 包；设置里的 Plugins 页只用于**配置已装载**的插件，inventory 是只读快照。
3. **真正可上架的是「视觉层」。** 把三区侧栏 + 暗色外观层 + 设置整合重写成一个**客户端插件**（`dsh.client` + 浏览器 bundle）并发到 npm，就能被任何人用 `dsh plugin --profile web add <pkg>` 装进自己的 web profile。这是唯一名副其实的「上架」路径。
4. **桌面壳本身建议继续走应用分发**（GitHub Release + portable exe），也就是本仓库现在的路线。

## 二、证据

| 机制 | 证据位置 | 说明 |
| --- | --- | --- |
| 插件安装 = pnpm 转发 | `@deepseek-ai/dsh/lib/plugin-Ddi42qoW.js` | `dsh plugin --profile <name> <args>` 在 profile 目录执行 `pnpm <args>`，随后**按已安装状态**调和 `dsh.profile.bundles` |
| 什么算插件 | 同上 | 依赖包 manifest 声明了 `dsh.bundle.patch` → 追加进 profile 的 layer 栈；否则只是普通依赖（stderr 给一条 warn）。按「已安装状态」而非依赖差异调和，所以 `update` 能让新版本里才获得 `dsh.bundle` 的包生效 |
| 客户端插件长什么样 | `@deepseek-ai/dsh-client-ui-sidebar/package.json` | 声明 `dsh.client = { inject: [...], platform: 'web' }`，并 `exports["./client"]` 指向 tsdown 打包出来的浏览器 bundle；peer 依赖 `@deepseek-ai/cordis` |
| 客户端插件怎么被装载 | `@deepseek-ai/dsh-web-app/cordis.patch.yml` | node 半边扫描 loader 树 → 组合 `window.__DSH_BOOT__` → 经 `/plugins/<id>/client.js` 提供；浏览器半边是 shell kernel 在 cordis 之前构造的模块表。patch 用 `- id: ui-sidebar / name: '@deepseek-ai/dsh-client-ui-sidebar'` 这样的行插入 |
| 没有市场 / 目录服务 | 全量包检索 | 只有 `pluginInventory/list`（只读快照：id、module specifier、enabled、phase）与 Plugins 设置页（配置已装载插件）。没有任何 catalog / marketplace / 上架入口 |
| `desktop` profile 被保留 | `@deepseek-ai/dsh/lib/bin.js` | `rejectElectronProfile()`：`profile "desktop" is managed exclusively by the Electron application` |

## 三、三条路径

| 路径 | 能上架吗 | 工作量 | 关键改动 |
| --- | --- | --- | --- |
| **A. 把桌面壳当插件** | ❌ | — | 没有插槽：插件在 harness 进程内运行，桌面壳是它的父进程/宿主 |
| **B. 视觉层做成客户端插件** | ✅ | 中 | 用 `dsh-client-ui-*` 的 slot / React API 重写三区侧栏与主题层，补 `dsh.bundle.patch`，发 npm |
| **C. 桌面壳走应用分发** | ✅（非插件） | 低 | GitHub Release + portable exe —— 本仓库已具备 |

## 四、路径 B 的实现清单

1. 新建包，例如 `@luyue-0010/dsh-client-ui-zones`（第三方不用 `@deepseek-ai` scope）。
2. `package.json` 声明：
   ```json
   {
     "type": "module",
     "exports": { ".": "./lib/index.js", "./client": "./lib/client.js" },
     "dsh": { "client": { "inject": ["@deepseek-ai/dsh-client-ui-layout", "@deepseek-ai/dsh-client-ui-sidebar", "@deepseek-ai/dsh-client-ui-workspace", "@deepseek-ai/dsh-client-locale"], "platform": "web" } },
     "peerDependencies": { "@deepseek-ai/cordis": "^4.0.2" }
   }
   ```
3. **用 slot 渲染，不要再注入 DOM**：侧栏的 `sidebar.workspaces` 等 slot 是官方给扩展用的入口；工作区列表用 `dsh-client-ui-workspace` 的 store/actions（`startSession` 等）而不是转发点击。
4. 主题层：把 `src/main/theme.js` 的 CSS 与 `src/main/artwork.js` 的留色派生搬进插件；派生可以在浏览器侧 canvas 做，或由 host 半边生成后供给。
5. 提供 `dsh.bundle.patch`（YAML），插入自己的行；需要覆盖官方行的 config 时按 id 定向，注意 row id 冲突。
6. 发布：`npm publish --access public`，用户侧 `dsh plugin --profile web add @luyue-0010/dsh-client-ui-zones`。
7. **可发现性**：目前没有官方上架入口，只能靠 npm 搜索、README 关键词与社区传播；如果要正式「上架」，需要向 DeepSeek 官方确认是否有内部登记渠道。

## 五、分阶段建议

| 阶段 | 内容 | 成本 | 价值 |
| --- | --- | --- | --- |
| 1（已完成） | 仓库 + portable exe 分发 | 0 | 你自己能用、能分享 |
| 2（建议） | 抽出「三区侧栏 + 暗色外观 + 留色派生」为客户端插件 | 中 | 唯一真正可上架、且对别人有复用价值的部分 |
| 3（取决于官方） | 桌面壳「官方化」 | — | 需要 DSH 开放 desktop profile 或宿主扩展点，目前是保留状态 |

## 六、风险与不确定

- 客户端插件 API 属于 `0.1.5-rc`（预发布），接口可能变动；`inject` 列表与 slot 名都可能改。
- profile 与第三方 bundle 之间没有版本锁定契约；patch 里按 id 覆盖官方行时要格外小心。
- 没有市场机制 = 没有分发与信任背书：用户必须知道你的包名，且要自行判断安全性（插件在本地以你的权限运行）。
- `desktop` profile 被保留，意味着桌面壳无法通过 profile 机制变成「官方形态」。
