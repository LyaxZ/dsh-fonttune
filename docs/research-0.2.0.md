# dsh-fonttune 0.2.0 更新方向调研

> 2026-09-15 整理。基于：插件 v0.1.6 现状 + DSH 0.1.5-rc.2 实包代码边界 + DSH 插件市场生态扫描 + 上游设计笔记。
> 本文件仅供开发参考，不在 npm 发布文件清单（`files`）内，不会随包发布。
>
> **⚠️ 这是 0.2.0 开工前的调研快照**（当时插件还是 v0.1.6）。文中「现状」「竞品做法」「候选方向」都可能与最终实现不同；有两条实测结论后来被改写：① 文末提到的「界面字号百分比全局缩放」在 0.2.0 里**整条退役**——实测 DSH 的设置页 / 侧栏 / 工作区字号是上游 CSS 字面量，界面阶梯 token 只被会话区组件消费，唯一官方字号接口是「对话字号」；② 本文第 7 条把 `body, body *` 字重规则列为「必然波及对话」，0.2.1 证明**加上 `:not()` 排除对话 markdown 子树后并不波及**（真机实测：界面的文本元素全部改到目标字重、markdown 子树内一个都没动），界面字重因此回归。最终形态见 [README](../README.md) / [CHANGELOG](../CHANGELOG.md)。

## 一、插件现状（v0.1.6，2026-09-15）

- **双半架构**：宿主半（`src/index.mjs`，注册 `dsh-fonttune` 设置命名空间 + `webserver/index-inject` 首帧注入防闪烁）+ 客户端半（`src/client.js`，设置卡片 / 选字体面板 / 样式注入）+ 纯函数核心（`src/shared.cjs`，消毒 / 解析 / CSS 生成，51 项离线检查）。
- **已有能力**：
  - 正文 / 代码字体族两套独立回退栈；西文 / 中文分栏（简单模式）+ 高级 chips 编辑器 + 拖拽排序
  - 正文 / 代码**独立**字号偏移（-3 ~ +6 px）、**独立**字重（300 ~ 600）
  - 实时预览（中英混排 + 代码两行）；本机字体枚举（`queryLocalFonts`，Chromium）
  - 松手才落盘、首帧不闪字体、settings.yaml 持久化（跨浏览器）
- **当前技术路线**：`:root,body{--dsw-font-family:…}` 等自定义属性直写 + ladder token 乘法缩放 + `body, body *` 全量 `!important` 字重规则。

## 二、环境硬约束（0.2.0 必须遵守的技术红线）

以下均为 rc.2 实包代码确认（`dsh-client-ui-layout` / `dsh-client-ui-theme` / `dsh-host-webserver` 等）：

1. **ThemePresenter 会删除外来自定义属性**：`ui-layout` 的 `ThemePresenter` 拥有 `document.body.style`，每次 theme/change 都会**删掉它自己没写的 body 自定义属性**（citisen/dsh-font README 实锤）。⇒ 字体族写入应迁移到官方钩子 **`ctx.theme.overrideTokens(source, {token: {light, dark}})`**（裸字符串会被 teaching error 拒绝，必须 light/dark 成对；source 钉死为 `<pluginId>.<packageId>`）。
2. **绝不能直写 `--dsh-content-font-size`**：官方 boot 脚本（首绘前）与 presenter（每次 theme/change）都会重写它（body 内联），宿主 schema 限 12–17。字号轴要与官方字号行正交，只能基于 `--dsh-content-font-delta` 或 ladder 子 token。
3. **页面无 CSP**：唯一 CSP 只在 `GET /api/file` 隔离预览响应（`sandbox; default-src 'none'`）。⇒ @font-face 远程字体、blob:/data: 字体、`fetch` 均不受阻。
4. **宿主 index-inject 零消毒**：`style` / `html` / `script` 行原样输出，另有 `tapIndex`（html→html 字符串变换，官方内置主题同款接缝）。⇒ 可注 `<link>`（Google Fonts）、@font-face `<style>`、首帧预涂装。
5. **host 路由可开**：`webServer.register({kind: "prefix"/"exact"})`（`dsh-webhook-github` 等第三方插件先例）⇒ 插件可以自己开路由供字体文件。注意 `/plugins` 路由只服务 client.js 组合包，不能直放 woff2。
6. **无 xterm.js / 无 CodeMirror**："终端" = bash 工具输出块 `<div data-terminal>`，字体 token `--dsl-terminal-font: var(--dsw-font-markdown-code-block)`；代码高亮是 Shiki；输入框非 CodeMirror。fonttune 兼容声明里提到的 `.cm-editor` 选择器对 rc.2 是冗余（留着无害）。
7. **token 体系是最稳的覆盖面**：ladder 复合 token（`--dsw-font-markdown-base/h1..h4/small/table/code/code-block/-code-block-small`）每个都拆出 `-font-family / -font-size / -font-weight / -font-style / -line-height` 五个子 token——最细粒度独立覆盖点；DOM 类名是哈希化 CSS-module（`_markdown_kcgor_5`），跨版本不可依赖，选择器尽量走 token / 稳定属性（`data-terminal` 等）。
8. **官方已内置会话字号**（2026-09-03 v0.1.2-rc.1 落地，设计笔记 `2026-08-18-settings-font-size-control.zh.md`，status: implemented）：`ui-theme.fontSize` 12–17px 步进器（FontSizeRow，settings.general.item order 11），`setFontSize` 与 `setTheme` 进入 cordis 客户端 API 目录。上游明确**否决过** em 倍率方案与 code/small 缩放方案；字号轴官方只做 size，对 font-family / font-weight 完全无官方意向。

## 三、竞品 / 生态格局

| 插件 | 字体相关能力 | 没有的 | 实现要点 |
| --- | --- | --- | --- |
| **citisen/dsh-font**（最强直接竞品，另有 j-sen/dsh-font 同文案疑似 fork） | 界面字体 + 代码字体；**三字号轴**（界面 75–150% 步 5%、对话 12–20px、代码 10–20px）；chip 多选字体栈；`queryLocalFonts` + **测量式探测**（离屏渲染对比 monospace 基线宽度）+ 常备目录；首帧预涂装防闪变 | 字重轴、中西分栏、webfont 加载（README 明确不做） | 字体族走 `ctx.theme.overrideTokens('dsh-font', {…{light,dark}})`；对话字号直写 `--dsh-content-font-size`（自认与官方字号行"二选一"）；UI 缩放靠逐元素 utility class + MutationObserver |
| **GptsApp/dsh-stylevault** | UI 字体 16 款 + 代码字体 14 款内置清单，**Google Fonts / jsDelivr 在线加载**（断网回退）；UI/代码独立 5 档缩放；配置 JSON 导出/导入 | 字重轴、中西分栏、任意字体导入 | 覆盖 `--dsw-alias-*` 语义 token；控制台 API `__STYLEVAULT__.setFonts()` |
| **Isilsolme/dsh-anthropic-fonts** | 固定 Anthropic 三字体（界面 Sans / 对话 Serif / 代码 Mono），中文回退思源；**作用域三分：界面 vs 对话 vs 代码** | 可配置性为零（不内置字体文件，用户手动装） | 只覆盖字体族部分 token；client fiber 注 `<style>` |
| **BeiZi6/dsh-theme-plugin** | UI/代码字体下拉 | 字号字重、分栏 | 宿主半 **`webServer.tapIndex`** 注 `<style>`（官方接缝，先于 hydration）；client 经 `overrideTokens` 热切换 |
| dsh-neo-skin / ikun-theme-skin / dsh-cool-theme / dsh-custom-theme-import | 均无字体功能 | — | ikun 证明 `settings.general.item` 的 appearance 席位（order 10）可被插件接管；custom-theme-import 揭示 skin.json 皮肤包标准正在成形 |
| 另存在：lsh2002/dsh-custom-fonts、npm dsh-font-plugin、yuu1111/dsh-ui-font | "字体族+字号"已是红海 | — | yuu1111 走 theme token 覆盖路线 |

**格局结论**：
- **红海（不宜再作第一卖点）**：字体族选择、双/三字号轴、webfont 内置清单在线加载、配色主题。
- **零竞品空位**：**字重轴**（fonttune 现有独有卖点）、**西文/中文分栏**（纯中文刚需，无任何竞品有）、与官方字号行**正交共存**的增量语义、任意字体导入、字重细粒度化、连字/行高/字距、字体检查器。

## 四、0.2.0 候选方向清单

### A. 排印轴扩展（最低垂、与现有滑块形态同构）

| # | 方向 | 可行性 | 要点 |
| --- | --- | --- | --- |
| A1 | **行高独立轴**（正文/代码各自倍率或 ±px） | ✅ 覆盖 ladder `-line-height` 子 token + 代码简写重写（0.1.4 已有 scaleFontShorthand 基建） | 中英混排最常见的"行距太挤/太松"诉求；与官方 delta 平移正交 |
| A2 | **字间距 / letter-spacing**（正文与代码各自） | 🟡 无 token，自写 CSS | 宿主对 code/pre/terminal/diff/read/search 已设 `text-autospace:no-autospace`，中文西文混排间距别打架 |
| A3 | **连字与 OpenType 特性**（代码 `font-variant-ligatures` / `font-feature-settings`，预设 calt/ss01 等；可选"按特性勾选"） | 🟡 宿主零支持，纯自注入 CSS | 编程字体用户高频需求（Fira Code / JetBrains Mono / Cascadia / Monaspace 全靠它）；可配常用编程字体名预设一键加栈 |
| A4 | **可变字体轴**（`font-variation-settings`：wdth / opsz，字重已有轴） | 🟡 | Monaspace / Recursive 时代特性，受众较窄 |
| A5 | **font-synthesis 开关**（禁中文伪斜体/伪粗体） | ✅ 一行 CSS 级 | 中文排版真实痛点（伪斜=倾斜硬掰），成本极低 |
| A6 | **渲染微调**：`-webkit-font-smoothing` / `text-rendering` / kerning | ✅ | 收益小，可并入 A5 作"高级微调"组 |

### B. 作用域扩展（对标 anthropic-fonts 的三分法，fonttune 的 token 优势区）

| # | 方向 | 可行性 | 要点 |
| --- | --- | --- | --- |
| B1 | **界面 vs 对话正文分离**（如：界面保持无衬线、对话换衬线——"Serif 阅读"场景） | ✅ 覆盖 `--dsw-font-markdown-base` 族（+ h1..h4/table 子 token）而 `--dsw-font-family` 只管界面 | anthropic-fonts 验证过需求存在；token 级覆盖干净，不必碰哈希类名 |
| B2 | **标题单独字体/字重**（h1–h4 子 token） | ✅ | 与 B1 同一套机制顺带完成 |
| B3 | **行内代码 vs 代码块分离**（`--dsw-font-markdown-code` vs `-code-block`） | ✅ | 行内代码 12px / 代码块 11px 本就不同档 |
| B4 | **bash 输出块独立控制**（`--dsl-terminal-font`，与 `-code-block` 解耦需两 token 都显式赋值） | ✅ | |

### C. 字体供给（解决"浏览器没装字体"——对你远程访问场景尤其有用）

| # | 方向 | 可行性 | 要点 |
| --- | --- | --- | --- |
| C1 | **远程字体加载**：用户填字体 CSS/woff2 URL（或 Google Fonts 名字），注 `<link>`/`@font-face` | ✅ 无 CSP 阻拦 | stylevault 占了"内置清单在线加载"心智，差异点做**任意 URL 导入**；断网 fallback 栈要写好 |
| C2 | **本地字体文件托管**：用户选本机 woff2/ttf，宿主半开路由供文件（或 base64 内嵌），**任何设备的浏览器都能用** | ✅ 三条路：`webServer.register` 路由 / FontFace+blob（pdf.js 先例）/ base64 | 你自己远程轻薄本访问 DSH 时无需在轻薄本装字体；注意隐私（本地文件仅本机路由） |
| C3 | **测量式字体探测**补课（无 queryLocalFonts 权限的浏览器也能枚举） | ✅ | citisen 方案，提升选字体面板普适性 |
| C4 | 常用编程字体/中文字体**名字预设清单**（Fira Code、JetBrains Mono、Maple Mono、思源黑体…只加名字不打包文件，规避版权） | ✅ | 与 C1/C2 组合成"没有也能拉"的完整故事 |

### D. 体验与稳固（0.2.0 的"大版本感"来源）

| # | 方向 | 可行性 | 要点 |
| --- | --- | --- | --- |
| D1 | **技术还债：写入迁移到 `ctx.theme.overrideTokens({light,dark})`** | ✅ 必做 | 现有 `:root,body` 直写会被 ThemePresenter 在主题切换时删掉（citisen 实锤坑）；0.1.x 用户可能已被偶发"字体丢失"困扰过 |
| D2 | **与官方字号行正交共存**：正文字号偏移改为基于官方 `--dsh-content-font-size`/delta 的增量语义复核 | ✅ | 避免 citisen 式"与官方二选一"打架；上游已否决 em 倍率与 code/small 缩放，别踩同坑 |
| D3 | **按主题分设**：light/dark 下不同的字重/字号（如暗色代码加粗半档） | ✅ overrideTokens 原生支持 light/dark 成对 | 受众较窄，可作高级项 |
| D4 | **预设方案（profiles）**：多套排版方案一键切换 + JSON 导出/导入分享 | ✅ | stylevault 已有导出分享心智；"写作方案 / 阅读方案 / 代码方案"切换 |
| D5 | **快速调整浮条**（quick-toc 风格边缘把手：拖动即调字号/字重，无需进设置） | ✅ | 与 quick-toc 的把手/滑块实现经验直接复用 |
| D6 | **字体检查器**（WhatFont 式：悬停/点选界面元素，显示实际渲染字体、命中栈中哪一项、字号字重） | ✅ | 全生态无人做；对"为什么我的字体没生效"类排查是刚需，也反向提升插件调试体验 |
| D7 | 兼容表/预检机制对齐竞品水准（anthropic-fonts 式逐版本冒烟验证） | ✅ | 工程债，随版本走 |

### E. 不建议

- **配色 / 主题化**：7 个主题插件扎堆，红海，且与上游"第三方主题是扩展点不是产品"的边界纠缠。
- **界面字号百分比全局缩放**：citisen 三轴已做且与官方语义打架；上游已否决 em 倍率。
- **抢占官方字号行席位**（settings.general.item）：order 10 = 外观、11 = 官方字号；进 General 收益小、冲突大，保留"设置→插件→插件配置"入口即可。

## 五、打包建议（三个可选 0.2.0 主轴）

**共同前置（无论选哪条）**：D1（overrideTokens 迁移）+ D2（与官方字号正交复核）+ A 组里挑 1–2 个轴。

- **方案 ①「排印完备版」**：A1 行高 + A3 连字/特性 + A5 伪斜体开关 + B1/B2（界面 vs 对话分离、标题独立）+ D3/D4。
  - 卖点：市场上**唯一**做"完整排印控制 + 中西分栏 + 字重"的字体插件；与所有竞品错位。
- **方案 ②「字体供给版」**：C1/C2/C4（字体导入三件套）+ C3 探测补课 + D6 检查器。
  - 卖点：解决"浏览器没装字体"的独有痛点（远程访问场景直接受益）；webfont 与竞品错位在"任意来源"而非"内置清单"。
- **方案 ③「体验升级版」**：D4 预设方案 + D5 快速浮条 + D6 检查器 + 现有轴的补强。
  - 卖点：把设置页体验拉满，工程量最小、风险最低。

三条不互斥，可分两波（0.2.0 / 0.3.0）释放。

## 六、证据来源

- DSH rc.2 实包：`%LOCALAPPDATA%\npm-cache\_npx\c40503fdf38a82ea\node_modules\@deepseek-ai\`（dsh-client-ui-theme / dsh-client-ui-layout / dsh-host-webserver / dsh-client-modules / dsh-web-frontend dist）
- 竞品 README：github.com/Isilsolme/dsh-anthropic-fonts、github.com/citisen/dsh-font、github.com/GptsApp/dsh-stylevault 等
- 上游设计笔记：`.agents/notes/implemented/feature/2026-08-18-settings-font-size-control.zh.md`（上游 master；官方"字号大小"功能的完整设计决策，含已否决方案）
- 市场 YAML：awesome-dsh-plugin `data/plugins/`（1000+ 条目扫描）
- 参考：[OpenReplay 编程字体指南](https://blog.openreplay.com/customizing-editor-coding-fonts/)（连字/可变字体/Nerd Font 需求综述）、[MDN font-synthesis](https://developer.mozilla.org/zh-CN/docs/Web/CSS/font-synthesis)、[Obsidian 混排行高讨论](https://forum.obsidian.md/t/can-css-be-used-to-set-line-height-for-only-certain-unicode-ranges-for-mixed-language-notes/112097/2)
