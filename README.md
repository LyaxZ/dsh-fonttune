# dsh-fonttune

DeepSeek Harness（DSH）Web GUI 的字体增强插件：**正文/代码字体族 + 全局字号偏移 + 全局字重**，设置入口在 **设置 → 插件 → 插件配置**（原生的插件配置卡片），改完即时生效。

English: [README.en.md](README.en.md)

## 为什么不是"纯客户端插件"

设计文档最初定的是纯客户端 + localStorage。实测后改成**双半（host + client）**，原因有三条，都是本机验证过的：

| 纯客户端 | 双半（本插件） |
| --- | --- |
| 插件配置页进不去——`settings.plugin.item` 这个槽是**按 host 注册的 settings namespace 派发**的（`settings-plugins` 的 slot-contract 与 `ConfigurablePluginsTab` 类型都写明这点），没有 host 半就没有 key，卡片永远不会被渲染 | 卡片出现在原生的插件配置页里，保存/重置走 DSH 自己的设置文档 |
| 首帧闪一帧默认字体（客户端插件是异步加载的） | host 半监听 `webserver/index-inject`，把同样的声明塞进 index `<head>`，**首帧就是对的字体** |
| 设置只存 localStorage，清缓存即丢，且不在 `settings.yaml` 里 | 存进 Host 设置文档（`settings.yaml`），与其它偏好一起 |

而文档担心的"host 半 ⇒ 必须重启"在本机不成立：web profile 是 `patchReload: "live"`，插件行增删热生效。真正需要重启的只有"安装那一刻"（要跑 `dsh plugin add` 把包放进 profile）。

## 安装

```powershell
# 发布后：直接从 npm 装（需要重启一次 DSH 让 bundle 进 boot graph）
dsh plugin --profile web add dsh-fonttune

# 本机开发：junction 到源码目录，再往 profiles\web\cordis.patch.yml 的
# insert 列表加一行  - id: fonttune / name: dsh-fonttune
dsh plugin --profile web add link:F:\deepseek harness\dsh-fonttune
```

装完重启一次 `dsh web` 即可，之后改设置不再需要重启。

## 四个调节轴

| 轴 | 范围 | 默认 | 说明 |
| --- | --- | --- | --- |
| 正文字体（sans） | 任意长度的 fallback 列表 | 空 = 不动 | 拉丁字体在前、中文字体在后；空表示完全沿用 DSH 的字体栈 |
| 代码字体（mono） | 同上 | 空 = 不动 | 作用于 `pre/code/kbd/samp/var/tt/textarea` 与 CodeMirror 编辑区 |
| 字号偏移 | -3 ~ +6 px | 0 = 不动 | 全局等比缩放，与 DSH 自己的"字号大小"叠加 |
| 字重 | 300 ~ 600 任意整数 | 未设置 = 不动 | 400 即 DSH 原本的正文字重，同样视为"不动" |

两个数值滑块都是**拖动过程零写入**：拖动只更新本地显示，松手（`pointerup`/触屏松开，或键盘松键/失焦）才一次性提交并生效——拖到哪都不会卡，松手即到位。

选字体面板：内置 **等宽 / 中文（CJK）/ 拉丁 / 通用** 四组预设，Chromium 下再用 `queryLocalFonts()` 补上"本机已安装"；搜索不到的名字可以直接"使用 xxx"新建。已选字体是 **chip 列表**，支持 **拖拽排序**（并保留 ‹ › 键盘/触屏按钮），每项用其自身字体渲染，下方还有中英混排 + 代码的实时预览。

### 中西分家（简单模式 / 高级模式）

卡片顶部的开关行（左"编辑方式"说明 + 右侧简单/高级分段切换）：

- **简单模式**：把栈拆成「西文字体」「中文字体」两个单选格（正文/代码各一对）。语义是"只动最前面"——西文格 = 栈里第一个非中文项，改选**原地替换**；中文格 = 第一个中文项，改选原地替换、栈里还没有中文项时**紧跟西文槽插入**；两格之外的项与顺序**原样保留**（"其余回退项"一行可见）。中文判定以名字启发式优先（未安装的字体也能正确归入中文槽——canvas 测宽对没装的字体必然误判，只作补充手段）。
- **高级模式**：完整的 chips 编辑器，拖拽排序。
- **切换模式零写入**：两种视图共享同一条栈，来回切换不会改动你排好的顺序；视图偏好存在浏览器本地。

## 字号偏移是怎么实现的

关键点：DSH 的字号不是"一个全局字号"，而是**运行时生成的一堆 CSS 自定义属性**——

- `--dsh-content-font-size`：会话内容字号，由 `dsh-client-ui-theme` 写在 `body` 的**内联样式**上（设置里那个"字号大小"滑块），`--dsh-content-font-delta` 等由它派生；
- `--dsw-font-*-font-size` / `-line-height`：设计系统每一档字号（`--dsw-font-s-14-*`、`--dsw-font-markdown-h1-*` …），主题插件在启动后注入。

所以直接写 `body, body * { font-size: calc(1em + 2px) !important }` 是**错的**：嵌套元素会按各自的 `1em` 反复加偏移，层级越深越大。本插件改成：

```css
body, body * {
  --dsh-content-font-size: calc((14px) * 1.125);          /* 基准值读自实时文档 */
  --dsw-font-s-14-font-size: calc((14px) * 1.125);
  --dsw-font-s-14-line-height: calc((24px) * 1.125);
  /* … 每个字号/行高 token 同一个比例 … */
}
body, body * { font-weight: 500 !important; }
```

即**把这些 token 按同一个比例重算**（`比例 = (16 + 偏移) / 16`）。好处：

- 每一档字号与它自己的行高同步放大，文字不会挤进没放大的行高里；
- 基准值来自 `getComputedStyle(document.body)`，所以偏移是**叠加**在 DSH 字号滑块之上的，两者不打架；
- 只改 `<body>` 元素上的自定义属性，不碰 `html`，没有 `zoom` 那种视口/滚动条副作用。

token 名单**不写死**：优先读同名样式表里的实际声明，再读实时计算值，最后才用内置兜底表（覆盖 0.1.5-rc.2 的全部字号 token）。判定规则是"名字以 `-font-size` / `-line-height` 结尾"，所以 DSH 之后改名或增删档位也能跟上。

## 安全

用户输入的字体名会被**按白名单消毒**：只保留字母（任意语言，含 CJK）、数字、空格、`.`、`,`、`_`、`-`，其余（引号、`{}`、`;`、`:`、`()`、`/`、`<>`、反斜杠）全部丢弃后再整体加引号。所以手输 `Arial"; } body { background: url(x) }` 只会变成家族名 `"Arial body background urlx"`，不可能闭合声明、另起规则或触达 `url()`。Host 侧 schema 另有 `^[^{};<>\\]*$` 与长度上限兜底。

## 开发

```powershell
node build.mjs            # 构建 lib/（零依赖，无需 bundler）
node build.mjs --watch    # 改 src 自动重建
node test/run.mjs         # 42 项离线检查（自建 DOM / cordis / 设置面替身）
```

源码是纯 JavaScript，**没有任何构建依赖**：`src/shared.cjs`（纯函数核心）、`src/index.mjs`（host 半，ESM）、`src/client.js`（客户端半）。`build.mjs` 干三件事：把 shared 内联进客户端 bundle、套上 `window.__ModuleLoader__.load({id, factory})` 外壳并挂上 `exports.apply/inject`、拷贝 host 半——同时校验"只 require shell 预注入的模块"这条硬约束。

### 客户端模块约束（踩过的坑）

- 浏览器半能 `require` 的**只有** shell 静态表里的词：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`（见 `dsh-web-frontend` 里的静态表与 `dsh-client-modules` 的解析顺序：seed → 已物化记录 → 已注册 factory，**miss 直接抛错**）。
- 客户端插件的 `ctx` **没有** `ctx.inject` 之外的花样：`ctx.effect / on / once / provide / timer` 是白名单动词；要拿别的服务用 `ctx.get(name)`（本插件只声明 `inject: ["slots", "locale", "settingsScope"]`）。
- host 半里 `import shared from "./shared.cjs"` **必须是默认导入**：具名导入会走 Node 的 CJS 静态导出探测，`dsh-settings` 解析 namespace 时会直接抛 `Named export 'FALLBACK_TOKENS' not found`，整半起不来。
- 改 `package.json` 千万不要带 BOM（`Set-Content -Encoding UTF8` 会加），DSH 的 loader 直接 `JSON.parse` 会整树炸掉。

## 兼容性

- DSH `0.1.5-rc.2`（`dsh.compatibility.dshReleases` 已声明）。
- 若同时启用其它写 `body` 字体族的插件（如设计文档里提到的 `dsh-ui-font`），后加载的赢，**不要同时开**；本插件可完全替代它（多了字号/字重/中西分家/拖拽排序/中文预设）。

## 许可

MIT
