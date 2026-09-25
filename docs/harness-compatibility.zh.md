# 上游兼容性

> [English](harness-compatibility.md) · **中文** · [目录](README.zh.md)

开发 pin 为 **0.1.7-rc.2** 包序列与 Cordis 4.0.4——即桌面应用自带的运行时和 npm `next`。支持范围覆盖**从 0.1.0-rc.8 到 0.1.7-rc.2 的每个已发布序列**；下表逐一做了类型检查和测试，0.1.1-rc.2 地板另外通过了 build、`check` 与 `check:dist`。

Host peer 对每个支持的元组各用一个带预发布标记的比较器：`>=0.1.0-rc.8 <0.1.1-0 || >=0.1.1-rc.0 <0.1.2-0 || >=0.1.2-alpha.0 <0.1.3-0 || … || >=0.1.7-alpha.0 <0.1.8-0`。这样写是为了躲开两个坑：默认 node-semver 下，通配符或看似宽泛的稳定范围根本不接纳预发布；而从 `-rc` 起步的比较器会排除同元组的 alpha，因为 `alpha` 排在 `rc` 之前——每个元组从 `-alpha.0`（或第一个受支持的构建）起步才能两者都接纳。从 0.1.7 起 harness 自己执行这些范围：安装插件前、以及每次启动时，它都用 `includePrerelease` 检查每个 `@deepseek-ai/dsh*` peer，不满足就以 "incompatible" 跳过该 bundle——范围漏掉正在运行的序列，插件就永远加载不了。`scripts/check-invariants.mjs` 在两种规则下断言每个已验证序列都被接纳，并拒绝支持范围之外的每个序列（含 0.1.8）：新序列只有在扫描验证后才会被接纳。运行时服务包放 peer，dev 镜像已验证的具体版本。发布 checkout 不得依赖本地 link:、file:、workspace:。

## 已验证序列

下表由 `node scripts/sweep-trains.mjs` 生成：对每个已发布的 `@deepseek-ai/dsh` 版本，在临时副本里把全部 `@deepseek-ai/dsh-*` devDependency 指向该精确版本，执行 `npm install --ignore-scripts`、`npm run typecheck`（三个程序）和 `npm test`。

| 序列 | 结果 |
| --- | --- |
| 0.1.0-rc.8 | 类型检查、201 项测试 |
| 0.1.1-rc.1 | 类型检查、201 项测试 |
| 0.1.1-rc.2 | 类型检查、201 项测试；build、check、check:dist |
| 0.1.2-alpha.2、alpha.3、alpha.4、alpha.5 | 类型检查、201 项测试 |
| 0.1.2-rc.1 | 类型检查、201 项测试 |
| 0.1.3-alpha.2 | 类型检查、201 项测试 |
| 0.1.5-alpha.1、alpha.2 | 类型检查、201 项测试 |
| 0.1.5-rc.1、rc.2、rc.3 | 类型检查、201 项测试 |
| 0.1.6-alpha.1、alpha.2 | 类型检查、201 项测试 |
| 0.1.7-alpha.1、alpha.2、rc.1 | 类型检查、201 项测试 |
| 0.1.7-rc.2 | 类型检查、201 项测试；build、check、check:dist；在由桌面应用运行时驱动的隔离 Web 实例上端到端实测 |

扫描遵循的规则：序列上从未发布的 dev pin 保持本仓库的版本——0.1.0 与 0.1.1 上的 `@deepseek-ai/dsh-client-store`，这两个序列的声明并不 import 它。`@deepseek-ai/dsh-client-runtime` 在 0.1.0–0.1.1 上声明 slot 注册表、之后不再发布，会以该序列的版本补进副本。peer 会被安装；若某序列自身的 peer 图在 npm 下无法解析（0.1.1-rc.1、0.1.5 系列），安装退回 `--legacy-peer-deps`，扫描输出的表会注明。每周 harness-compat 工作流探测 next 与 alpha tag，失败时开 upstream-drift issue；它从不发布，也不扩大 peer 范围。

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
7. **路由鉴权。** `connection.requestRejection(req)` 让原始 Web 路由复用 harness 自身的鉴权；该服务存在时两条路由都会调用。客户端请求改为相对文档，因为桌面页面是 `dsh-app://app/`，其转发器会剥掉 `Origin` 与 `Sec-Fetch-Site`。
8. **设置。** `ctx.settings` 变成 `SettingsForms`：`installSection` 与 `register` 都不存在了；表单按 profile 条目（`drop`）由导出的 `Config` 生成，且只包含标记为 volatile 的字段；一次性的 `settings.yaml` 导入按条目 id 对应段名——`crosery-drop` 不会被迁移。
9. **引用芯片。** `data-decoration="chip"` 与 `data-ref-chip` 只存在于 textarea 序列；reference-fit 样式表只在附件栏发现 textarea 输入框时才安装。

## 0.1.2 序列改了什么

上游两处搬迁会击垮"静态 import 单一序列"的插件；本插件改为读取运行中的 harness，而不是按包名绑定。

1. **设置挂载搬迁。** 0.1.1 的包导出 `installSettingsSection(ctx, ns, schema, entry, hooks)` 在 0.1.2 变成服务方法 `ctx.settings.installSection(owner, ns, schema, entry, hooks)`，`settingsNamespace()` 同时被删除。`src/index.ts` 为此导出 `mountSettingsSection`：服务有 `installSection` 就用它，只有旧 `register` 就退回旧路径，两者都没有时仍以组装入口为唯一来源。静态 import 已删除的导出不是降级而是致命：ESM 在任何代码执行前解析具名导出，0.1.2 及之后整个 Host 入口直接加载失败。
2. **客户端服务搬迁。** `ctx.slots` 在 0.1.1 由 `@deepseek-ai/dsh-client-runtime` 声明，0.1.2 改由 `@deepseek-ai/dsh-client-ui-renderer` 声明；`ctx.sessions` 迁到 `@deepseek-ai/dsh-api-session-controller`，且 0.1.1 的原属包已停止发布。因此 client 半边用 `ctx.get` 按名读取 `sessions`，并把实际调用的切片结构化声明，任何 import 都不再点名某一序列的包。

还有三处小改名由同一姿势吸收：草稿附件新增无 `previewUrl` 的 file 成员（DropRail 对其渲染身份行）、席位 owner 动词改为 `onAddFiles` / `onRemoveAttachment`（rail 用收到的哪套名字就调哪套）、`sessionId` 不再作为标准 prop 下发（改由注册的 `inject` 工厂提供）。

## 类型解析依赖 `@deepseek-ai/dsh-client-store`

自 0.1.2 序列起，`@deepseek-ai/dsh-client-ui-slots` 改为从独立的 `@deepseek-ai/dsh-client-store` 包再导出 `SnapshotSelectorHook`、`PropsStore`、`StoreDecl`、`BoundActions` 和 `HandleOf`，而不再用自己的 `store.ts`。该包在 0.1.1 序列上并不存在，过去也没有任何东西会把它装进来。

不装它时，ui-slots 内的这个 import 解析为 `any`，`skipLibCheck` 又把错误盖住，于是每个选择器 hook 都静默丢失参数类型：`useInput((state) => ...)` 与框架合成的 `useAttached` 都报 `TS7006: Parameter implicitly has an 'any' type`，而构建其余部分看起来一切正常。它作为 devDependency 固定在开发序列；0.1.0 与 0.1.1 序列本来就不 import 它。

## 产物入库

`lib/` 提交进仓库，并由 `.gitignore` 保持。仓库没有 npm 包时，插件市场的降级通道就是 git 安装，而 pnpm 默认拒绝执行 git 托管包的构建脚本，除非用户在 profile 的 `allowBuilds` 里预先放行——因此在安装期构建的插件，对相当一部分用户等于装不上。`npm run check:dist` 会把源码构建到临时目录并拒绝与 `src/` 不一致的已提交产物；CI 在两个 Node 主版本上都跑这一步。

上游漂移仍需人工处理：先读目标版本公开声明，同步更新相关 DSH pin，重新生成 package-lock.json，运行扫描、构建、产物一致性和加载器模块表检查，再实测 Web 与桌面的输入框，最后才扩兼容范围。single 附件席位、输入 phase/actions、捕获提交选择器和 UI-primitives 基线尤其敏感。

来源：package.json、package-lock.json、scripts/check-invariants.mjs、scripts/check-dist.mjs，以及公开安装的 `dsh-client-ui-conversation` / `dsh-client-ui-slots` / `dsh-settings` 声明。
