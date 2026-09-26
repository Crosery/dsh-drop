# 上游兼容性

> [English](harness-compatibility.md) · **中文** · [目录](README.zh.md)

开发 pin 为 **0.1.7-rc.2** 包序列与 Cordis 4.0.4——即桌面应用自带的运行时和 npm `next`。支持范围：Web 上覆盖**从 0.1.0-rc.8 到 0.1.7-rc.2 的每个已发布序列**，桌面应用为 **0.1.7-rc.2**。区间内每个序列都做了类型检查、测试和 peer 准入检查；[已验证序列](#已验证序列)中列出的序列上还对打包后的插件做了启动冒烟——用 `dsh plugin add` 安装、激活、实际调用路由、浏览器半边被服务端提供。

## peer 闸门

Host peer 对每个支持的元组各用一个带预发布标记的比较器：`>=0.1.0-rc.8 <0.1.1-0 || >=0.1.1-rc.0 <0.1.2-0 || >=0.1.2-alpha.0 <0.1.3-0 || … || >=0.1.7-alpha.0 <0.1.8-0`。这样写是为了躲开两个坑：默认 node-semver 下，通配符或看似宽泛的稳定范围根本不接纳预发布；而从 `-rc` 起步的比较器会排除同元组的 alpha，因为 `alpha` 排在 `rc` 之前——每个元组从 `-alpha.0`（或第一个受支持的构建）起步才能两者都接纳。

从 0.1.7 起 harness 自己执行这些范围。`@deepseek-ai/dsh-app-boot` 的 `evaluatePluginCompatibility` 用 `semver.satisfies(version, range, { includePrerelease: true })` 检查每个 `@deepseek-ai/dsh*` peer：`dsh plugin add` 会拒绝这样的插件并回滚 profile（"installation rejected … is incompatible with dsh"），已安装的则在启动时被跳过，stderr 只有一行（"skipping profile bundle"），Web 界面照常起来、只是没有这个插件。桌面应用运行的是同一套代码。所以范围一旦漏掉正在运行的序列，插件就永远加载不了——v0.1.3 的范围止于 `<0.1.6-0`，在 0.1.7 上根本不存在。npm 和 pnpm 对 peer 仍用默认规则，所以范围必须在两种规则下都接纳该序列。

`scripts/check-invariants.mjs` 在两种规则下断言每个已验证序列都被接纳，并在两种规则下拒绝支持范围之外的每个序列（含 0.1.8）：新序列只有验证后才会被接纳。运行时服务包放 peer，dev 镜像已验证的具体版本。发布 checkout 不得依赖本地 link:、file:、workspace:。

## CI 组合

`scripts/harness-target.mjs` 把每一格解析为一个精确的 `@deepseek-ai/dsh` 版本，由 `.github/workflows/harness-compat.yml` 执行。

| 格 | 版本 | 运行时机 | 门禁 |
| --- | --- | --- | --- |
| `pinned` | devDependency 的 pin（0.1.7-rc.2），按锁文件安装 | 每个 PR、每次发版 | PR 合入、发版 |
| `floor` | 0.1.1-rc.2，有实机证据的最旧序列 | 每个 PR、每次发版 | PR 合入、发版 |
| `desktop` | 两个桌面更新 feed 发布的版本——`nightly` 是唯一频道，mac-arm64 与 win-x64 是仅有的平台，两者必须一致——且 npm 上要有同版本的 `@deepseek-ai/dsh`，也就是桌面启动的那个 Web 应用 | 每个 PR（仅供参考）、每天 | 发版 |
| `latest`、`next`、`alpha` | `@deepseek-ai/dsh` 的 npm dist-tag | 每天 | — |
| `sweep` | 从 peer 范围接纳的最低版本起、运行时从 npm 读取的每个已发布 `@deepseek-ai/dsh` 版本 | 每周；发版时 | 发版（类型、测试、准入） |
| `desktop-bytes` | 桌面安装包本体，在 macOS 上 | 每天、每周、发版时 | 发版 |

每格跑四项：

- **types**：Host、客户端、测试三个程序对该序列声明做类型检查，再跑 `check-dist.mjs --bundle-only`——客户端产物读取的每个 harness 模块成员都必须是该序列真实导出的；
- **tests**：测试套件对该序列的包运行；
- **admission**：每个 harness peer 在两种 semver 规则下都接纳该版本；
- **smoke**：`scripts/smoke-boot.mjs`——打包当前 checkout，把精确版本的 `@deepseek-ai/dsh` 装进系统临时目录下的一次性 `DSH_HOME`，用 `dsh plugin add` 添加 tarball（不加豁免），启动 `dsh --profile web`，并要求：没有指向本插件的 "skipping profile bundle" 或 "did not activate"；三条路由已挂载，在具备 `connection.requestRejection` 的 harness（0.1.2 起）上无登录 cookie 时返回 401、带 cookie 时可用——实际暂存一个文件到该 home 并解析成功；插件及其 `dsh.client.inject` 目标出现在 `__DSH_BOOT__` 中；服务端提供的产物能按 shell 自己的模块表求值；产物读取的每个 harness 成员都存在于该序列已安装的包里。扫描行默认只对每个元组的最新构建以及各命名格解析出的版本做冒烟（`smoke: heads`），也可按需全做。

`desktop-bytes` 下载 feed 指向的 mac-arm64 zip，要求其 sha512 与 feed 一致、内置的 `desktop-runtime.json` 和 `@deepseek-ai/dsh` 与 feed 版本一致，然后以应用的 Electron 可执行文件作为 Node（`ELECTRON_RUN_AS_NODE=1`）对 `Contents/Resources/app.asar/dsh` 跑同样的冒烟，PATH 上用应用自带的 pnpm。应用窗口、preload 桥（`__DSH_HOST_PATHS__`）和原生拖放不在 CI 范围内。

某序列发布时缺少本插件需要的包，或 npm 上还没有，记为**不完整**：该格为中性，不开也不关 issue，但 admission 仍会运行——准入不需要安装，范围拒绝的版本即便 npm 上还不全也算漂移。只有 npm 对包本身的回答才会判为不完整：某个包或版本 E404、ETARGET，或依赖图 ERESOLVE，并且同版本 `@deepseek-ai/dsh` 的裸安装也以同类回答失败。registry 不应答、返回错误或超时，则判该格失败；`pinned` 与 `floor` 永远不会是不完整。定时或手动触发时，失败的格会新开（或追加评论到）`upstream-drift` issue「Harness compatibility broken against @<格>」；某格全部通过时会在该 issue 下评论并关闭它。CI 从不放宽范围，也不发布。

各格与扫描安装序列的方式（`scripts/harness-lib.mjs`）：

- **devDependencies（types、tests）。** 该序列发布过的每个 `@deepseek-ai/dsh-*` devDependency 改指向该精确版本。从未发布的保持本仓库的 pin——0.1.0 与 0.1.1 上的 `@deepseek-ai/dsh-client-store`，其声明并不 import 它——除非插件离不开它（`dsh-client-ui-renderer`、`-conversation`、`-slots` 或任一 peer），那样该序列就不在支持范围内。`@deepseek-ai/dsh-client-runtime` 在 0.1.0–0.1.1 上声明 slot 注册表、之后不再发布，会以该序列的版本补进来。Cordis 跟随该序列 `@deepseek-ai/dsh` 实际携带的版本，并固定为该范围实际安装到的精确版本。其余 devDependency——TypeScript、`@types/*`、esbuild、semver——固定为 package-lock.json 中的版本：改指向后的副本不带锁文件安装，隔夜发布的编译器或类型包不能把某个序列弄红。peer 会被安装；peer 图遇到 ERESOLVE 的序列（0.1.1-rc.1 与 0.1.5 系列）改用 legacy peer 模式重装，并把已固定包的每个 harness peer 固定到该序列版本。
- **harness 本身（smoke）。** 按发布时的依赖图安装 `@deepseek-ai/dsh@<版本>`：用 `--before` 截止到下一个 harness 发布之前，因为 cordis 系列在每个序列下都是浮动的——今天全新安装 0.1.1-rc.2，不装任何插件也会在启动时报 "user patch-layer watching requires the Cordis HMR service"。npm 在 90 秒内解不完 peer 图时（npm 11 下 0.1.1-rc.2 要耗约十分钟 CPU），改用 legacy peer 模式安装，再把它留下的每个未满足的必需 peer 按声明范围补齐。

## 已验证序列

以上结果于 2026-09-26 由 `node scripts/sweep-trains.mjs`（每一行：安装、三个类型检查、产物对 harness 模块的读取和 279 项测试）与 `node scripts/smoke-boot.mjs`（`--dsh <版本>`，按发布时的依赖图安装 harness；桌面应用用 `--harness-dir` 指向其自带的 `app.asar`）得出。每一行在两种 semver 规则下都被全部 harness peer 接纳。

| 序列 | 类型、产物读取、测试 | 启动冒烟 |
| --- | --- | --- |
| 0.1.0-rc.8 | 通过（保留 `dsh-client-store` pin） | 通过；路由对匿名调用开放（0.1.2 之前没有登录检查） |
| 0.1.1-rc.1 | 通过（保留 pin；legacy peer） | — |
| **0.1.1-rc.2**——地板 | 通过（保留 pin） | 通过；路由对匿名调用开放 |
| 0.1.2-alpha.2、alpha.3、alpha.4、alpha.5 | 通过 | — |
| 0.1.2-rc.1 | 通过 | 通过；匿名调用得到 401 |
| 0.1.3-alpha.2 | 通过 | 通过；401 |
| 0.1.5-alpha.1、alpha.2、rc.1、rc.2 | 通过（legacy peer） | — |
| 0.1.5-rc.3——npm `latest` | 通过（legacy peer） | 通过；401 |
| 0.1.6-alpha.1 | 通过 | — |
| 0.1.6-alpha.2 | 通过 | 通过；401 |
| 0.1.7-alpha.1、rc.1 | 通过 | — |
| 0.1.7-alpha.2——npm `alpha` | 通过 | 通过；401 |
| **0.1.7-rc.2**——开发 pin、npm `next`、桌面应用 | 通过；另有 build、`check`、`check:dist` | npm 与桌面应用运行时（Electron Node 24.18.1、自带 pnpm 11.7.0）上均通过；401。另在由桌面应用运行时驱动的隔离 Web 实例上实测拖放文件与文件夹（桌面路径桥为模拟） |

已发布的 v0.1.3 tarball 以同样方式在桌面应用运行时上冒烟：安装阶段即失败（"installation rejected … incompatible with dsh 0.1.7-rc.2"）；加 `--accept-risk` 后能装上，但 `host-routes`（无鉴权、无 batch 路由）和 `client-exports`（0.1.7-rc.2 的 primitives 不再导出 `IconCloseOutline16`、`IconPlayOutline16`、`IconChevronLeftOutline14`、`IconChevronRightOutline14`）两项失败。

## 不在支持范围内

| 序列 | 原因 |
| --- | --- |
| 0.0.1-rc.1、rc.2 | 上游不完整：`@deepseek-ai/dsh` 自身依赖从未发布的包（`dsh-pty`、`dsh-environment`、`dsh-skill-local` 等），harness 本身就装不上。 |
| 0.0.1-rc.5、0.1.0-rc.2 – rc.7 | 插件加载器已存在（`dsh.bundle.patch`、`dsh.client` Web 模块），但输入框没有 `conversation.input.attachments` 席位——拖放监听和附件条都由输入栏自己持有——且 `@deepseek-ai/dsh-client-ui-renderer` 在 0.1.0-rc.8 之前未发布。附件栏无席位可占。 |

## 0.1.7 序列改了什么

1. **peer 闸门。** 见上：范围不接纳 0.1.7 时，插件在安装时被拒、启动时被跳过，Web 与桌面应用都一样。
2. **没有"当前会话"。** `sessions.list.getSnapshot()` 变成 `{ids, byId, phase, projectionsBySession}`，选中状态改为私有。每条附件栏从 slot 的 `inject(sessionId)` 工厂取得会话并按挂载登记自己（子智能体侧栏会再挂一个输入框）。手势路由到输入框卡片包含事件目标的那条附件栏。
3. **图标改名。** `IconCloseOutline16` 等带尺寸后缀的 primitives 改为 `…Regular` / `…Medium` / 无后缀名；缺失的导出是 `undefined`，第一张卡片渲染时 React 就会抛错。附件栏改用内联 SVG，产物不再 require primitives 模块（`check` 会检查）。
4. **输入框。** 自 0.1.2 起输入框是 Lexical `contenteditable`，不再是 `<textarea>`，以 textarea 为条件的 Enter 拦截从不触发，消息会不带暂存文件发出。0.1.7 新增 `inputActions.captureInsertion()` / `insertText(text, span)`；发送拦截借它追加引用（0.1.2–0.1.6 用作用域事件 `slash/input-insert-text`），再交给输入框自己的处理器提交。同一类名在 Web 产物与桌面应用中不同（`uV2eYG_primary` / `QJwAZG_primary`），因此发送与停止按钮按结构识别。
5. **席位 props。** `attachments` 是 `image` 与 `file` 草稿的联合，旁边还有 `uploads`、`onRetryFile`、`canAcceptDrop`、`dropLimits`（多数自 0.1.3 起）。附件栏全部渲染，并遵守 `canAcceptDrop`。
6. **桌面路径。** 桌面 preload 发布 `globalThis.__DSH_HOST_PATHS__.pathFor(file)`；它没有声明文件，因此按特性检测。
7. **路由鉴权。** `connection.requestRejection(req)` 让原始 Web 路由复用 harness 自身的鉴权——它自 0.1.2-alpha.2 起就存在，启动冒烟在 0.1.2 及之后的每个序列上都看到匿名调用被拒绝；该服务存在时三条路由（stage、resolve 与文件夹 batch 路由）都会调用，`connection` 服务不在时（它异步提供，改配置时会重启）回 503。客户端请求改为相对文档，因为桌面页面是 `dsh-app://app/`，其转发器会剥掉 `Origin` 与 `Sec-Fetch-Site`。
8. **设置。** `ctx.settings` 变成 `SettingsForms`：`installSection` 与 `register` 都不存在了；表单按 profile 条目（`drop`）由导出的 `Config` 生成，且只包含标记为 volatile 的字段；一次性的 `settings.yaml` 导入按条目 id 对应段名——`crosery-drop` 不会被迁移。
9. **引用芯片。** `data-decoration="chip"` 与 `data-ref-chip` 只存在于 textarea 序列；reference-fit 样式表只在附件栏发现 textarea 输入框时才安装。

## 0.1.2 序列改了什么

上游两处搬迁会击垮"静态 import 单一序列"的插件；本插件改为读取运行中的 harness，而不是按包名绑定。

1. **设置挂载搬迁。** 0.1.1 的包导出 `installSettingsSection(ctx, ns, schema, entry, hooks)` 在 0.1.2 变成服务方法 `ctx.settings.installSection(owner, ns, schema, entry, hooks)`，`settingsNamespace()` 同时被删除。`src/index.ts` 为此导出 `mountSettingsSection`：服务有 `installSection` 就用它，只有旧 `register` 就退回旧路径，两者都没有时仍以组装入口为唯一来源。静态 import 已删除的导出不是降级而是致命：ESM 在任何代码执行前解析具名导出，0.1.2 及之后整个 Host 入口直接加载失败。
2. **客户端服务搬迁。** `ctx.slots` 在 0.1.1 由 `@deepseek-ai/dsh-client-runtime` 声明，0.1.2 改由 `@deepseek-ai/dsh-client-ui-renderer` 声明；`ctx.sessions` 迁到 `@deepseek-ai/dsh-api-session-controller`，且 0.1.1 的原属包已停止发布。因此 client 半边用 `ctx.get` 按名读取 `sessions`，并把实际调用的切片结构化声明，任何 import 都不再点名某一序列的包。

较小的改动也由同一姿势吸收：0.1.2 起 `sessionId` 不再作为标准 prop 下发（改由注册的 `inject` 工厂提供）；0.1.3-alpha.2 起草稿附件新增无 `previewUrl` 的 file 成员（DropRail 对其渲染身份行），席位 owner 动词改为 `onAddFiles` / `onRemoveAttachment`（rail 用收到的哪套名字就调哪套）。

## 类型解析依赖 `@deepseek-ai/dsh-client-store`

自 0.1.2 序列起，`@deepseek-ai/dsh-client-ui-slots` 改为从独立的 `@deepseek-ai/dsh-client-store` 包再导出 `SnapshotSelectorHook`、`PropsStore`、`StoreDecl`、`BoundActions` 和 `HandleOf`，而不再用自己的 `store.ts`。该包在 0.1.1 序列上并不存在，过去也没有任何东西会把它装进来。

不装它时，ui-slots 内的这个 import 解析为 `any`，`skipLibCheck` 又把错误盖住，于是每个选择器 hook 都静默丢失参数类型：`useInput((state) => ...)` 与框架合成的 `useAttached` 都报 `TS7006: Parameter implicitly has an 'any' type`，而构建其余部分看起来一切正常。它作为 devDependency 固定在开发序列；0.1.0 与 0.1.1 序列本来就不 import 它。

## 产物入库

`lib/` 提交进仓库，并由 `.gitignore` 保持。仓库没有 npm 包时，插件市场的降级通道就是 git 安装，而 pnpm 默认拒绝执行 git 托管包的构建脚本，除非用户在 profile 的 `allowBuilds` 里预先放行——因此在安装期构建的插件，对相当一部分用户等于装不上。`npm run check:dist` 会把源码构建到临时目录并拒绝与 `src/` 不一致的已提交产物；CI 在两个 Node 主版本上都跑这一步。

每日与每周的组合负责发现上游漂移，修复仍需人工：先读新版本的公开声明，运行 `node scripts/smoke-boot.mjs --dsh <版本> --accept-risk`（诊断用，先授予精确版本豁免，以区分「范围太窄」和「代码坏了」），pin 需要移动时同步更新相关 DSH pin，重新生成 package-lock.json，运行扫描、构建、产物一致性检查，再实测 Web 与桌面的输入框。只有类型检查、测试和上述冒烟都通过后才放宽范围，并把该版本加入 `scripts/check-invariants.mjs` 的 `VERIFIED_TRAINS` 和上表。single 附件席位、输入 phase/actions、捕获提交选择器和 UI-primitives 基线尤其敏感。

来源：package.json、package-lock.json、scripts/harness-lib.mjs、scripts/harness-target.mjs、scripts/smoke-boot.mjs、scripts/check-invariants.mjs、scripts/check-dist.mjs、.github/workflows/harness-compat.yml，以及公开安装的 `dsh-client-ui-conversation` / `dsh-client-ui-slots` / `dsh-settings` 声明。
