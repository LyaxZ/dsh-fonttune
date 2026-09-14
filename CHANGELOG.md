# Changelog

## 0.1.1 — 2026-09-14

首发（0.1.0）之后的文档与工程收尾，**运行代码与 0.1.0 相同**：新增英文 CHANGELOG（`CHANGELOG.en.md`，随包发布）；订正 README / CHANGELOG 里过期的离线检查数（35 → 42 项）；新增 GitHub Release 工作流，随 tag 自动产出**不带版本号**的 `dsh-fonttune.tgz`（市场 `tarball:` 字段指向它，版本号不会因为下次发版而 404）。

## 0.1.0 — 2026-09-14

首个版本（M1–M3 完成）。架构取"host 半 + 客户端半"双半插件，而非设计文档最初设想的纯客户端插件——理由见 README「为什么不是纯客户端插件」。

### 新增

- **插件配置卡片**：注册在 `settings.plugin.item`、key 为 `dsh-fonttune` 的 host 设置命名空间，出现在 设置 → 插件 → 插件配置 里，保存/重置走 DSH 自己的设置文档（`settings.yaml`）。
- **正文 / 代码字体族**：两套独立的 CSS font-family fallback 列表，可为空（= 完全不动 DSH 的字体栈）。
- **选字体面板**：内置 等宽 / 中文（CJK）/ 拉丁 / 通用 四组预设；Chromium 下用 `queryLocalFonts()` 补"本机已安装"分组；搜索不到的名字给"使用 xxx"新建入口；每行用其自身字体渲染。
- **中西分家（简单模式）**（2026-09-14，用户点名要 Word/docx 式的中文字体/西文字体两格）：卡片顶部一个开关——**简单模式**把栈拆成「西文字体」「中文字体」两个单选格（正文/代码各一对），内部自动维护同一条栈；**高级模式**就是完整的 chips 编辑器。语义（用户拍板"简单模式只动最前面"）：西文格 = 栈里第一个非中文项（通常就是第 1 位），改选原地替换、无则插到最前；中文格 = 第一个中文项，改选原地替换、无则**紧跟西文槽插入**（保证 `西文, 中文, 通用兜底` 的 CSS 语义正确）；两格之外的所有项与顺序**原样保留**，并在"其余回退项"一行提示；**模式切换是纯视图切换、零写入**。中文判定 = 名字启发式优先（宽松正则 + 含 CJK 字符的本地化名），canvas 测宽只对名字不像 CJK 的字体补充确认——**未安装的预设字体也能正确落入中文槽**（实测「思源黑体」本机没装也被正确分类；测宽对未安装字体必然误判，故只作次级手段）。实测：槽位派发正确、高级模式完整列表可见、来回切换零数据变化、真实面板点选只替换对应槽、控制台干净。开关行布局（用户反馈）：左侧说明文字「编辑方式」+ 右侧分段式小切换（简单 | 高级），替换原两个等宽大按钮。
- **拖拽排序**：已选字体是 chip 列表，可拖拽调整回退顺序，同时保留前移/后移按钮（键盘与触屏可用）。
- **实时预览**：中英混排 + 代码两行，随当前配置实时渲染。
- **全局字号偏移**（-3 ~ +6 px）：**等比缩放 DSH 自己的字号 token**（`--dsh-content-font-size`、`--dsw-font-*-font-size` / `-line-height`），基准值实时读自计算样式，因此与 DSH 的"字号大小"滑块叠加而非互相覆盖；token 名单运行时发现、内置兜底表。
- **全局字重**（300 ~ 600）：作用于 `body, body *`，400 与未设置都表示"不动"。
- **滑块松手才落盘**（2026-09-14，用户反馈"动一点就马上调整很卡"）：字号偏移/字重滑块拖动时只更新本地待定值与读数显示，`pointerup`/`touchend`（窗口捕获级监听）或失焦/键盘抬起时一次性提交，拖动过程零写入——不再每挪一格就全量重算字号 token + 写设置文档。**松手后保持待定值直到宿主确认值回来**（用户反馈"回弹再到位"）：提交与设置文档回执之间的一拍里若立刻清本地值，滑块会闪回旧提交值再跳到新值——现以待提交值上屏、回执到达（或外部值变化）才清除，逐帧采样验证松手后读数序列无旧值闪现；重复 `pointerup` 以"已待确认"守卫挡住，不会重复写同一值。
- **字重提示精简**（用户点名）：改为「覆盖全局文字粗细（含标题）；默认字重为400。」，删去"任意整数都生效/可变字体线性/普通字体取最近一档"的说明。
- **首帧不闪字体**：host 半监听 `webserver/index-inject` 注入同款 `<style>`，客户端插件激活前首帧就是保存的字体。
- **中英双语文案**，缺英文回退；`queryLocalFonts` 不可用/被拒时静默回退到内置列表。

### 安全

- 字体名按**白名单**消毒（仅保留字母/数字/空格/`.` `,` `_` `-`），消毒后再整体加引号；Host schema 另加 `^[^{};<>\\]*$` 与长度上限。手工构造的 CSS 注入无法闭合声明或规则。

### 工程

- 纯 JavaScript 源码 + **零依赖构建脚本**（`build.mjs`）：内联 shared、套 `window.__ModuleLoader__.load` 外壳、挂 `exports.apply/inject`，并强制校验"客户端 bundle 只能 require shell 预注入模块"。
- `node test/run.mjs`：**42 项离线检查**全绿，含自建 DOM、cordis 替身、设置面与 slot 派发替身、真实 `@deepseek-ai/schemastery` schema 解析、CSS 生成与注入、消毒对抗用例。
- **真实浏览器验证闭环**（本机可复跑，无需用户参与）：受管实例（`--port 0 --no-open`，token 从 stdout 拿）→ `Invoke-WebRequest -SessionVariable` 用 token 换 cookie 后可直接 POST `/api/settings/describe`（信封 `{type:"client-request",rpcId,method:"<ns>/<method>",payload:{args:{}}}`）验证 namespace 已注册 → `test/browser-probe.mjs` / `test/ui-walk.mjs` 用**无头 Edge + CDP**（Node 内置 WebSocket）真实渲染页面：设置 → 插件 → 插件配置 → 断言卡片渲染、展开后控件齐全、控制台零报错。最终态实测：`fontCardVisible: true`，展开后 sans/mono/size/weight/preview/resetAll 全渲染、2 个滑块、控制台干净。

### 修复（开发期自查发现的真实缺陷）

- **卡片首渲染即崩溃（无头浏览器实测抓到的发布阻断 bug）**：`scope.subscribe` 被以裸方法引用传给 React 的 `useSyncExternalStore`，而宿主的 `SettingsScopeController.subscribe` 是读 `this.store` 的原型方法，脱离对象调用时 `this` 为 undefined → `slot entry crashed in 'settings.plugin.item': Cannot read properties of undefined (reading 'store')` → 卡片在插件配置页里根本不出现（其他卡片正常、插件清单里能看到本插件）。修复 = 传给 React 的 subscribe 一律包闭包保住 `this`。离线测试曾漏检：替身的 subscribe 是不依赖 `this` 的闭包，且 React 替身从不调用 subscribe——现两处替身都已改成会暴露该 bug 的形态（严格 scope + 脱离式调用）。
- **字号偏移三连 bug（真实浏览器实测逐个抓到）**：① 缺 `!important`——主题把 `--dsh-content-font-size` 写在 body **内联**样式上，内联声明压过普通样式表规则 → body 本身不缩放、后代缩放，页面字号劈成两半；② **自我污染复利循环**（用户实测"字体一直变大"）——token 刷新每 4 秒重读基准值时把本插件自己样式表里的声明当成"未触碰基准"扫回去，每轮再 ×比例；修复 = 扫描样式表时跳过自己的标签、`--dsh-content-font-*` 直接读 body 内联原值，且**计算样式不再作为基准来源**（规则生效后计算值就是缩放后的，回流即复利）；③ **var 链双重缩放**——DSH 的派生 token（delta/secondary/markdown 全套）都从 `var(--dsh-content-font-size)` 派生，把它们也缩放会 ×比例×比例；修复 = 基准值含 `var(` 的 token 跳过显式缩放，经变量链自动继承。跨两个刷新周期的稳定性实测：content-size 数值不变、样式表 0 个 `var(`、控制台干净。
- **字体族不铺满对话区/侧边栏**：对话 markdown 与侧栏元素的 CSS 自己声明 `font-family: var(--dsw-font-family)`，继承被截断，只写 body 的 font-family 传不进去。修复 = 按 dsh-ui-font 的验证做法在**变量源头**覆盖：`:root,body{--dsw-font-family:<sans>!important}` 与 `--dsw-font-mono`/`--ds-font-family-code`（代码 token 全链 `var(--ds-font-family-code)`）；显式 body/pre,code 规则保留作第二路径。
- **字重吸附到 ±100 档**：原来把任意值 snap 到 300/400/500/600，拖动时看似只 ±100；现按用户所选整数原样写 CSS（可变字体全线性，普通字体内建就近取整），滑块 1 步进。
- 消毒过于宽松时 `Arial"; } body { background: url(evil) }` 能残留 `:` `(` `)`，改写为白名单式。
- host 半从 CJS 共享模块具名导入会让 ESM 加载失败（`Named export not found`），改为默认导入。
- 字号 token 正则漏掉 `--dsh-content-font-size`（该名不含 `-font-` 前缀）与其 `-secondary` 变体。
- 计时器改走 `globalThis`，不再依赖 `window` 上是否存在这两个方法。
