# 开发规范

> [English](development.md) · **中文** · [目录](README.zh.md)

## 改边界，不改宿主

Host 注册 POST /crosery/dsh-drop/resolve（只 stat 比对路径）和 POST /crosery/dsh-drop/stage（限额流式上传）。浏览器持有按会话隔离的 AttachedFiles（条目在路径取得前为 `pending`，之后为 `ready`；同一会话内同一路径只暂存一次）、按附件分键的页面内 PreviewStore，以及 RailRegistry。附件栏以 priority -1 占用 single 席位 conversation.input.attachments，卸载后恢复出厂条目；占席位也必须接管纯图片接收，并按种类渲染输入框的每个草稿——图片，以及 0.1.3 起的文件草稿及其上传进度、失败与重试。

**路由。** 页面上可能有多个输入框（0.1.7 的子智能体侧栏会再挂一个）。每个挂载的附件栏按身份登记、按身份注销，不读取"当前会话"（0.1.7 已删除 `sessions.list.getSnapshot().current`）。拖放或粘贴交给 `[data-composer-card]` 包含事件目标的那条栏；否则交给最近挂载、有会话且席位报告 `canAcceptDrop` 的那条。拒收的输入框在浮层显示受阻状态，落下时给出提示；页面上完全没有输入框时用 toast 提示。

**取得路径。** 非图片文件按以下顺序取第一个可行的：桌面桥 `globalThis.__DSH_HOST_PATHS__.pathFor(file)`（特性检测，在事件内读取；返回 `''` 表示不在磁盘上）直接原地引用；`text/uri-list` 提示经 resolve 路由确认；否则暂存字节。请求使用相对文档的地址（`crosery/dsh-drop/…`）：桌面页面是 `dsh-app://app/`，其转发器会带上 Host 的鉴权 cookie。上游 `formatFileMention` 会拒绝的路径（含 `"` 或 C0/C1 控制字符）绝不直接引用，而是以安全文件名复制。

拖放规划、文件名归约、引用拼写、发送判定和路由都放在无 DOM 的纯函数（`contract.ts`、`client/send-plan.ts`、`client/registry.ts`、`client/composer-face.ts`）。客户端结构化读取席位 props（见 DropRail：owner 动词、附件联合类型和上传形状都是重述的，因为它们在各序列间变过），按名读取 `sessions` 与 `conversation`。附件栏图标为内联 SVG：primitives 模块在序列间改过图标名，浏览器产物不得 require 它。

**发送。** 捕获阶段的提交拦截是兼容接缝，不是另一套发送实现，分两种形态。在 0.1.0–0.1.1 的 textarea 输入框上，拦截器用 `setDraft` 改写草稿、经 `inputActions.submit` 提交并清空。在 0.1.2 起的 Lexical 输入框上，它在文档末尾追加 `"\n\n" + 每行一个引用`——0.1.7 用 `inputActions.insertText` 配合 `captureInsertion()` 的修订号，0.1.2–0.1.6 用作用域事件 `slash/input-insert-text`，只有草稿里没有引用芯片时才整体改写——然后交给输入框自己的 Enter 或发送处理器提交。末尾偏移使用 detect 坐标（`draft.length − Σ occurrence.length + occurrences.length`）。一个宏任务之后再检查：草稿已清空或进入事务阶段即视为已发送，此时才清空暂存条目；否则把追加的内容撤回。发送与停止按钮靠结构区分（卡片中最后一个按钮；`path` 箭头与 `rect` 方块），绝不靠带哈希的类名。禁用的发送按钮（空草稿、只有暂存文件）不会派发 click，因此在它的 `pointerdown` 上经 action face 提交——仅在空闲时，因为此时 action face 固定的排队模式与按钮本身一致。修改时验证 Enter、IME、Shift+Enter、Cmd/Ctrl+Enter、补全菜单、停止、禁用/只读控件、未就绪的暂存文件、被拒发送和纯文件发送。

## 状态与生命周期

引用在发送前不进草稿，用户文字放在路径前面，保持标题可读。PNG/JPEG/WebP/GIF 通过席位自带的文件接收口（`onAddFiles`，0.1.1 上是 `onAddImages`）沿用宿主校验，席位中已有的文件（名称、大小、修改时间相同）会被去重。未发送的非图片引用及预览字节只存在页面内，刷新或卸载会丢失。输入框拒绝的发送会保留暂存条目；已受理但之后失败的发送由输入框把带引用的文字恢复到草稿，因此不会重新暂存。

粘贴会接收文件并保留真实文字：只有当 `text/plain` 只是重复所粘贴文件的文件名（Finder 或资源管理器的复制）时才丢弃，否则插入到选区（0.1.7 用 `inputActions.insertText`，更早用浏览器自身的文字插入）。粘贴到其他插件字段里的内容不受影响。

文件夹由 `planDrop` 以 `folders` 携带（含 entry 与桥接路径）并提示已跳过；`AttachedFile.kind` 已有 `'directory'`，`mentionFor(path, 'directory')` 已有尾部斜杠写法，留给文件夹阶段。

状态放在 apply/effect 内；卸载取消上传、移除 document 监听。附件离开附件栏（发送或移除）时撤销其 object URL 并释放字节，卸载时撤销其余全部。文本只预览前 64 KiB；Office 和压缩包只提供身份卡。

## 安全与存储

上传文件名归约为单段（去掉 C0/C1 控制字符和 `"`），按 UTF-8 字节限制长度，加同名后缀。完整临时文件通过原子、不覆盖的硬链接发布，并发不能改变已经返回路径的字节。

两条路由都先询问 Host 的准入检查，每次请求时经 `ctx.get('connection')?.requestRejection(req)` 读取：在 0.1.7 上它是 harness 的 Host/Origin 围栏加登录 cookie 鉴权，未鉴权的调用方在读写任何东西之前就收到 401。更早的序列没有该服务，检查一律放行。其后是 CSRF 闸门：stage 要求非简单请求的名称头，resolve 要求 `application/json` 请求体，两者都拒绝非同源 Fetch Metadata（缺失时放行——桌面转发器会剥掉它），且不授予 CORS 权限。在 0.1.7 之前的序列上这只是 CSRF 防护，不是鉴权：保持 DSH 仅监听本机或置于认证访问之后；同源插件和受信任本地客户端仍具有宿主权限。

禁止在新标签导航拖入文件的 blob URL：SVG 在 img 中安全不代表顶层文档安全。HTML/XML 只显示转义源码；PDF 即使收到 HTML MIME 也强制 application/pdf。浏览器不一定支持所有编解码器/PDF。不会自动执行或解压文件。清理会删除 DSH_HOME/drops 下过期日期目录，目录内手工放的东西也会一起删除。

## 验证

运行 npm run typecheck、npm test、npm run build、npm run check、npm run check:dist。Host 测试使用真实 HTTP 和临时目录；发送拦截在 `tests/submit-flow.test.ts` 中以小型文档模型验证。两半边分开 typecheck；测试可以包含 DOM 类型，但不能同时拉入相冲突的 Context 增强。新增行为补能在旧实现上失败的回归。UI 修改要在已有 DSH URL 刷新后用合成文件验证：纯图片、混合拖放、粘贴、移除、文本/PDF 预览、灯箱键盘焦点、窄栏、纯文件 Enter。截图不能暴露真实文档和会话历史。仅记录实际跑过的验证。

任何客户端改动都必须对全部已发布序列通过类型检查和测试，而不只是 pin 的那一个：`node scripts/sweep-trains.mjs` 为每个序列复制一份树，把 `@deepseek-ai/dsh-*` devDependency 指向该精确版本，再运行 typecheck 和测试（见 docs/harness-compatibility.zh.md）。`lib/` 已入库，因此源码改动要跟着跑 npm run build 并提交重新生成的产物，否则 check:dist 会红。

来源：src/index.ts、src/contract.ts、两条 route、src/client/*.ts 及 pin 版本的 dsh-client-ui-conversation 公开席位与输入声明。
