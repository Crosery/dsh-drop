# 开发规范

> [English](development.md) · **中文** · [目录](README.zh.md)

## 改边界，不改宿主

Host 注册 POST /crosery/dsh-drop/resolve（只 stat 比对路径，文件或文件夹）、POST /crosery/dsh-drop/stage（限额流式上传；带批次 id 时是文件夹副本中的一个文件）和 POST /crosery/dsh-drop/batch（文件夹副本：`limits`、`begin`、`commit`、`abort`）。浏览器持有按会话隔离的 AttachedFiles（条目在路径取得前为 `pending`，之后为 `ready`；同一会话内同一路径只暂存一次）、按附件分键的页面内 PreviewStore，以及 RailRegistry。附件栏以 priority -1 占用 single 席位 conversation.input.attachments，卸载后恢复出厂条目；占席位也必须接管纯图片接收，并按种类渲染输入框的每个草稿——图片，以及 0.1.3 起的文件草稿及其上传进度、失败与重试。

**路由。** 页面上可能有多个输入框（0.1.7 的子智能体侧栏会再挂一个）。每个挂载的附件栏按身份登记、按身份注销，不读取"当前会话"（0.1.7 已删除 `sessions.list.getSnapshot().current`）。拖放或粘贴交给 `[data-composer-card]` 包含事件目标的那条栏；否则交给最近挂载、有会话且席位报告 `canAcceptDrop` 的那条。拒收的输入框在浮层显示受阻状态，落下时给出提示；页面上完全没有输入框时用 toast 提示。

**取得路径。** 非图片文件按以下顺序取第一个可行的：桌面桥 `globalThis.__DSH_HOST_PATHS__.pathFor(file)`（特性检测，在事件内读取；返回 `''` 表示不在磁盘上）直接原地引用；`text/uri-list` 提示经 resolve 路由确认；否则暂存字节。请求使用相对文档的地址（`crosery/dsh-drop/…`）：桌面页面是 `dsh-app://app/`，其转发器会带上 Host 的鉴权 cookie。上游 `formatFileMention` 会拒绝的路径（含 `"` 或 C0/C1 控制字符）绝不直接引用，而是以安全文件名复制。

拖放规划、文件名归约、引用拼写、发送判定和路由都放在无 DOM 的纯函数（`contract.ts`、`client/send-plan.ts`、`client/registry.ts`、`client/composer-face.ts`）。客户端结构化读取席位 props（见 DropRail：owner 动词、附件联合类型和上传形状都是重述的，因为它们在各序列间变过），按名读取 `sessions` 与 `conversation`。附件栏图标为内联 SVG：primitives 模块在序列间改过图标名，浏览器产物不得 require 它。

**发送。** 捕获阶段的提交拦截是兼容接缝，不是另一套发送实现，分两种形态。在 0.1.0–0.1.1 的 textarea 输入框上，拦截器用 `setDraft` 改写草稿、经 `inputActions.submit` 提交并清空。在 0.1.2 起的 Lexical 输入框上，它在文档末尾追加 `"\n\n" + 每行一个引用`——0.1.7 用 `inputActions.insertText` 配合 `captureInsertion()` 的修订号，0.1.2–0.1.6 用作用域事件 `slash/input-insert-text`，只有草稿里没有引用芯片时才整体改写——然后交给输入框自己的 Enter 或发送处理器提交。末尾偏移使用 detect 坐标（`draft.length − Σ occurrence.length + occurrences.length`）。一个宏任务之后再检查：草稿已清空或进入事务阶段即视为已发送，此时才清空暂存条目；否则把追加的内容撤回。Alt、AltGraph、Ctrl+Meta 加 Enter 在 0.1.7-rc.1 及之前会发送，0.1.7-rc.2 起被吞掉但不阻止浏览器默认的 Enter，后者会在引用块后插入换行、被误判为已发送；对这些按键，拦截器追加引用并只阻止默认行为，输入框自己的处理器照常运行。发送与停止按钮靠结构区分（卡片中最后一个按钮；`path` 箭头与 `rect` 方块），绝不靠带哈希的类名。禁用的发送按钮（空草稿、只有暂存文件）不会派发 click，因此在它的 `pointerdown` 上经 action face 提交——仅在空闲时，因为此时 action face 固定的排队模式与按钮本身一致。修改时验证 Enter、IME、Shift+Enter、Cmd/Ctrl+Enter、Alt/AltGraph/Ctrl+Meta+Enter、补全菜单、停止、禁用/只读控件、未就绪的暂存文件、被拒发送和纯文件发送。

## 状态与生命周期

引用在发送前不进草稿，用户文字放在路径前面，保持标题可读。PNG/JPEG/WebP/GIF 通过席位自带的文件接收口（`onAddFiles`，0.1.2 及之前是 `onAddImages`）沿用宿主校验，席位中已有的文件（名称、大小、修改时间相同）会被去重。未发送的非图片引用及预览字节只存在页面内，刷新或卸载会丢失。输入框拒绝的发送会保留暂存条目；已受理但之后失败的发送由输入框把带引用的文字恢复到草稿，因此不会重新暂存。

粘贴会接收文件并保留真实文字：只有当 `text/plain` 只是重复所粘贴文件的文件名（Finder 或资源管理器的复制）时才丢弃，否则插入到选区（0.1.7 用 `inputActions.insertText`，更早用浏览器自身的文字插入）。粘贴到其他插件字段里的内容不受影响。

**文件夹。** `planDrop` 以 `folders` 携带每个拖入的文件夹（其 `webkitGetAsEntry()` entry 和 `getAsFile()` 所得 File 的桥接路径，都在处理器内同步读取）。一个文件夹是一条 kind 为 `'directory'` 的 `AttachedFile`，发送时是一条 `mentionFor(path, 'directory')`——带尾部斜杠，含空格时引号闭合——其中的图片绝不进入出厂图片接收口。取得顺序（`client/folder-acquire.ts`）：有桥接路径时立即原地引用，只为卡片计数（默认忽略列表，封顶于默认文件数上限）；否则先向 batch 路由要 `limits`，按上限遍历 entry 树（`folder.ts`：循环 `readEntries` 直到返回空批次，忽略的名称不打开，计数无法读取的条目，碰到第一个上限就停，对全是空目录的树另有访问上限），用前八个文件作证据向 resolve 路由核对 `file://` 提示，否则整个拒绝超限的文件夹，或按每次四个文件上传到批次并提交。期间卡片为 `pending` 并显示已完成文件数，任何条目 pending 时发送拦截器都会拦下发送。移除卡片会中止上传并发送 `abort`；`abort` 没送到时由 Host 的空闲清扫兜底。混合拖入的每一部分各自处理，一个坏文件夹不会连累同批其他条目（上游会拒绝整批）。

状态放在 apply/effect 内；卸载取消上传、移除 document 监听；每个待定条目（文件或文件夹）都在各自的中止信号下运行（`staging-jobs.ts` 中的 `EntryJobs`），移除其卡片即停止上传，由移除导致的失败不会上报；Web 服务作用域结束时删除所有未完成的文件夹批次。附件离开附件栏（发送或移除）时撤销其 object URL 并释放字节，卸载时撤销其余全部。文本只预览前 64 KiB；Office 和压缩包只提供身份卡。

## 安全与存储

上传文件名归约为单段（去掉 C0/C1 控制字符和 `"`），按 UTF-8 字节限制长度，加同名后缀。完整临时文件通过原子、不覆盖的硬链接发布，并发不能改变已经返回路径的字节。

文件夹副本是一个批次。`begin` 创建 `drops/DAY/.batch-<uuid>/`（组装中的 `tree/` 和存放仍在传输字节的 `parts/`），返回一个随机 id——它只是该目录的访问凭据——以及为该批次冻结的上限；同时最多八个，空闲 30 分钟即删除。文件夹自身的名字在 `begin` 时由 `safeFolderName` 确定，win32 上套用与下面路径相同的规则，Windows 不接受的名字不会等整份上传完才在 `commit` 时失败；单个文件的名字经 `safeStageName` 得到同样的规则。每个文件的相对路径都在 Host 上由 `safeRelativeSegments` 重新清洗，从不信任：`.`/`..` 段直接拒绝，开头的根或盘符去掉，去掉 C0/C1 控制字符，win32 上替换保留字符、设备名和结尾的点或空格，每段沿用文件名字节限制、总长不超过 1024 字节——然后拼到 `tree/` 下、用 `insideRoot` 复查，并以同样不覆盖的硬链接发布（清洗后同名的加后缀）。单文件 `maxBytes` 以及文件夹的 `folderMaxFiles`、`folderMaxBytes`、`folderMaxDepth` 按实际到达的字节执行，传输中的上传也计入；超过任一上限返回 413 并注明上限，同时删除整个批次。`commit` 先用独占 `mkdir` 占住最终名称，再把 `tree/` rename 到这个空占位上（Windows 上先删占位），重名时依次尝试 `name-2`、`name-3`……，读者永远看不到半个文件夹；没有文件的批次会被拒绝。`abort`、空闲清扫和卸载都会 `rm -r` 批次目录；与 abort 赛跑的上传会删掉自己重建的目录。`.env` 这类机密文件和其他文件一样会被复制，只有忽略列表会跳过。空子目录不会重建。

resolve 路由上的文件夹声明用最多八个文件（相对路径、大小、修改时间）代替大小和修改时间。每个都必须是不同的文件——按 `lstat` 的设备号与 inode 判断，因为在不区分大小写或 Unicode 规范化的卷上 `readme.md` 与 `README.md` 是同一个文件——通过 `safeRelativeSegments`、是 `lstat` 意义上的普通文件、真实路径位于该目录真实路径之内，且在 2 秒误差内匹配；样本数必须达到文件夹允许的数量（`min(8, 文件数)`），空样本要求目录里只有被忽略的名称。之后才统计文件夹——广度优先 `readdir`，链接只计数不跟随，忽略的名称计数但不打开，上限 50 000 个条目、2 秒和层级上限，碰到任一上限即标记 `truncated`——返回的只有计数，没有名称。原位引用的文件夹就是真实目录：模型能在那里列出 `.git`。

三条路由都先询问 Host 的准入检查，每次请求时经 `ctx.get('connection')?.requestRejection(req)` 读取：从 0.1.2 起（该服务出现于 0.1.2-alpha.2）它是 harness 的 Host/Origin 围栏加登录 cookie 鉴权，未鉴权的调用方在读写任何东西之前就收到 401。0.1.0 与 0.1.1 发布的该服务没有检查，一律放行。`connection` 服务不在时——启动时其异步 `apply` 尚未完成、改配置后重启、激活失败——所有序列都回 503 而不是放行：在 0.1.2 及之后，这正是 harness 自己的 `/api` 也关着的时刻；在 0.1.0–0.1.1 上该服务与 Web 服务器同时就绪。其后是 CSRF 闸门：stage 要求非简单请求头（名称头，文件夹文件则是批次头），resolve 和 batch 要求 `application/json` 请求体，三者都拒绝非同源 Fetch Metadata（缺失时放行——桌面转发器会剥掉它），且不授予 CORS 权限。在 0.1.0–0.1.1 上这只是 CSRF 防护，不是鉴权：保持 DSH 仅监听本机或置于认证访问之后；同源插件和受信任本地客户端仍具有宿主权限。

禁止在新标签导航拖入文件的 blob URL：SVG 在 img 中安全不代表顶层文档安全。HTML/XML 只显示转义源码；PDF 即使收到 HTML MIME 也强制 application/pdf。浏览器不一定支持所有编解码器/PDF。不会自动执行或解压文件。清理会删除 DSH_HOME/drops 下过期日期目录，目录内手工放的东西也会一起删除。启动时那一遍还会删除这些目录里的上传残留——最近一次写入（批次看其目录、`parts/` 和每个分片）早于 30 分钟批次超时的 `.batch-*` 目录和 `.incoming-*` 文件——从不跟随链接；之后因保留期改变而运行的清理不碰它们，因此本 Host 正在写入的批次不会被误删。

## 验证

按顺序运行 npm run typecheck、npm test、npm run check:dist、npm run build、npm run check：check:dist 用临时构建比对已提交的 `lib/`，先构建会把差异掩盖掉。Host 测试使用真实 HTTP 和临时目录；发送拦截在 `tests/submit-flow.test.ts` 中以小型文档模型验证。两半边分开 typecheck；测试可以包含 DOM 类型，但不能同时拉入相冲突的 Context 增强。新增行为补能在旧实现上失败的回归。UI 修改要在已有 DSH URL 刷新后用合成文件验证：纯图片、混合拖放、粘贴、移除（焦点落到相邻卡片，附件栏清空时回到输入框）、文本/PDF 预览、灯箱键盘焦点、窄栏（出现后变宽的卡片也会让箭头跟着出现）、纯文件 Enter；文件夹则用 CDP `Input.dispatchDragEvent` 拖入真实文件夹（`data.files` 可以是目录路径）、打桩的 `__DSH_HOST_PATHS__`、超限文件夹，以及在 `Network.emulateNetworkConditions` 限速下上传中途移除。截图不能暴露真实文档和会话历史。仅记录实际跑过的验证。

任何客户端改动都必须对全部已发布序列通过类型检查和测试，而不只是 pin 的那一个：`node scripts/sweep-trains.mjs` 为每个序列复制一份树，用与 CI 各格相同的 `scripts/harness-target.mjs --repoint --install` 切到该精确版本，再运行 typecheck、按该序列自己的 shell 模块表与导出检查产物（`check-dist.mjs --bundle-only --train <版本>`）和测试（见 docs/harness-compatibility.zh.md）。改动 Host 路由、清单或产物时还要跑 `node scripts/smoke-boot.mjs --dsh <版本>`：它在一次性 home 里用 `dsh plugin add` 安装打包后的插件，启动 `dsh --profile web`，检查激活、三条路由（0.1.2 起无登录 cookie 返回 401，并实际暂存与解析一次）以及按 shell 模块表和该序列导出评估的浏览器产物。`lib/` 已入库，因此源码改动要跟着跑 npm run build 并提交重新生成的产物，否则 check:dist 会红。

来源：src/index.ts、src/contract.ts、src/folder.ts、三条 route（stage-route、folder-stage、resolve-route）、src/client/*.ts 及 pin 版本的 dsh-client-ui-conversation 公开席位与输入声明。
