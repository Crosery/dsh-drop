# 上游兼容性

> [English](harness-compatibility.md) · **中文** · [目录](README.zh.md)

可复现基线为公开发布的 DSH 0.1.1-rc.2 包序列及 Cordis 4.0.2；从该基线到 0.1.5 的每个包序列均已端到端验证。Host peer 显式接纳这些预发布元组。node-semver 的通配符或看似宽泛的稳定范围不会自动接纳预发布；不变量脚本逐项核对 dev pin 与 peer。运行时服务包放 peer，dev 镜像已验证的具体版本。发布 checkout 不得依赖本地 link:、file:、workspace:。

## 已验证序列

| 序列 | 结果 |
| --- | --- |
| 0.1.1-rc.2 | 类型检查、构建、103 项测试 |
| 0.1.2-rc.1 | 类型检查、构建、103 项测试 |
| 0.1.5-rc.1 | 类型检查、构建、103 项测试 |
| 0.1.5-rc.2 | 类型检查、构建、103 项测试 |
| 0.1.5-alpha.2 | 类型检查、构建、103 项测试 |

每行都是在临时副本里把全部 `@deepseek-ai/dsh-*` devDependency 指向该序列的精确发布版本，再依次执行 `npm install --ignore-scripts`、`npm run typecheck` 与 `npm test`。每周 harness-compat 探测 next/alpha，失败创建或更新 upstream-drift issue，不自动发布或扩大 peer。缺 tag 必须报告，不能算兼容；安装失败与 API/type 失败要分开诊断。

## 0.1.2 序列改了什么

上游两处搬迁会击垮"静态 import 单一序列"的插件；本插件改为读取运行中的 harness，而不是按包名绑定。

1. **设置挂载搬迁。** 0.1.1 的包导出 `installSettingsSection(ctx, ns, schema, entry, hooks)` 在 0.1.2 变成服务方法 `ctx.settings.installSection(owner, ns, schema, entry, hooks)`，`settingsNamespace()` 同时被删除。`src/index.ts` 为此导出 `mountSettingsSection`：服务有 `installSection` 就用它，只有旧 `register` 就退回旧路径，两者都没有时仍以组装入口为唯一来源。静态 import 已删除的导出不是降级而是致命：ESM 在任何代码执行前解析具名导出，0.1.2 及之后整个 Host 入口直接加载失败。
2. **客户端服务搬迁。** `ctx.slots` 在 0.1.1 由 `@deepseek-ai/dsh-client-runtime` 声明，0.1.2 改由 `@deepseek-ai/dsh-client-ui-renderer` 声明；`ctx.sessions` 迁到 `@deepseek-ai/dsh-api-session-controller`，且 0.1.1 的原属包已停止发布。因此 client 半边用 `ctx.get` 按名读取 `sessions`，并把实际调用的切片结构化声明，任何 import 都不再点名某一序列的包。

还有三处小改名由同一姿势吸收：草稿附件新增无 `previewUrl` 的 file 成员（DropRail 对其渲染身份行）、席位 owner 动词改为 `onAddFiles` / `onRemoveAttachment`（rail 用收到的哪套名字就调哪套）、`sessionId` 不再作为标准 prop 下发（改由注册的 `inject` 工厂提供）。

## 类型解析依赖 `@deepseek-ai/dsh-client-store`

自 0.1.2 序列起，`@deepseek-ai/dsh-client-ui-slots` 改为从独立的 `@deepseek-ai/dsh-client-store` 包再导出 `SnapshotSelectorHook`、`PropsStore`、`StoreDecl`、`BoundActions` 和 `HandleOf`，而不再用自己的 `store.ts`。该包在 0.1.1 序列上并不存在，过去也没有任何东西会把它装进来。

不装它时，ui-slots 内的这个 import 解析为 `any`，`skipLibCheck` 又把错误盖住，于是每个选择器 hook 都静默丢失参数类型：`useInput((state) => ...)` 与框架合成的 `useAttached` 都报 `TS7006: Parameter implicitly has an 'any' type`，而构建其余部分看起来一切正常。它作为 devDependency 固定在已验证的最新序列；旧序列本来就不 import 它。

## 产物入库

`lib/` 提交进仓库，并由 `.gitignore` 保持。仓库没有 npm 包时，插件市场的降级通道就是 git 安装，而 pnpm 默认拒绝执行 git 托管包的构建脚本，除非用户在 profile 的 `allowBuilds` 里预先放行——因此在安装期构建的插件，对相当一部分用户等于装不上。`npm run check:dist` 会把源码构建到临时目录并拒绝与 `src/` 不一致的已提交产物；CI 在两个 Node 主版本上都跑这一步。

上游漂移仍需人工处理：先读目标版本公开声明，同步更新相关 DSH pin，重新生成 package-lock.json，分别检查两半边并跑测试、构建、产物一致性和加载器模块表，再实测 Web 组合器，最后才扩兼容范围。single 附件席位、输入 phase/actions、捕获提交选择器和 UI-primitives 基线尤其敏感。

来源：package.json、package-lock.json、scripts/check-invariants.mjs、scripts/check-dist.mjs，以及公开安装的 `dsh-client-ui-conversation` / `dsh-client-ui-slots` / `dsh-settings` 声明。
