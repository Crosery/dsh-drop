# 更新记录

> [English](CHANGELOG.md) · **中文**

## 0.1.3

- 修复附件栏 `useMemo` 的依赖列表：图片行闭包引用的是解析后的删除动词，只提供 `onRemoveAttachment` 的序列（0.1.2 及之后，此时 `onRemoveImage` 恒为 undefined）可能在跨渲染时保留旧处理器。
- 移除 `>=0.1.0-rc.1 <0.1.1-0` 这条 peer 分支：它是沿用而非验证得来，且接纳了本仓库文档明确不支持的 0.1.0-rc 序列；范围现在从 README 所述 0.1.1 地板开始。
- `npm run check` 现在逐项校验文档所列序列落在 peer 范围内，并拒绝地板以下的序列，prose 与清单不会再各说各话。
- 固定安装示例指向当前发布版本。

## 0.1.2

- peer 范围补上 alpha 分支。此前每个元组只有 `-rc` 比较器，而 `alpha` 在 semver 里排序低于 `rc`，因此 `>=0.1.5-rc.0` 不匹配 `0.1.5-alpha.2`——全部 alpha 版 harness 都被拒绝，市场收录规范对此有明文警告。现已对 8 个已验证序列（含 0.1.2-alpha.5、0.1.3-alpha.2、0.1.5-alpha.1/2）逐一验证并写入范围。

## 0.1.1

- 兼容 0.1.1 到 0.1.5 的全部 DSH 序列，覆盖当前 `latest`、`next`、`alpha` 三个 tag；对 0.1.1-rc.2、0.1.2-rc.1、0.1.5-rc.1、0.1.5-rc.2、0.1.5-alpha.2 逐一做了类型检查与测试验证。
- 按运行中的 harness 实际提供的 API 挂载设置。0.1.2 删除了 `installSettingsSection` 与 `settingsNamespace`，改为 `ctx.settings.installSection`；静态 import 那对旧导出会让整个 Host 入口加载失败，这就是 0.1.2 用户看到的"插件坏掉"。
- 客户端按名读取 `sessions` 服务、结构化声明实际调用的切片，并重述附件席位改名后的 owner 动词（`onAddFiles`、`onRemoveAttachment`）与变宽的草稿附件形状。`@deepseek-ai/dsh-client-runtime` 在 0.1.1 之后停止发布，点名它等于把插件钉死在单一序列。
- `sessionId` 改从注册的 `inject` 工厂取（0.1.2 把它挪到了那里），不再依赖标准 prop。
- 双半边产物入库并移除 `prepare` 脚本：git 安装不再需要 `allowBuilds` 授权，也就是插件市场此前 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 失败的根因。`npm run check:dist` 守住已提交产物与源码一致。
- 新增 `@deepseek-ai/dsh-client-store` dev pin：0.1.2 起 `dsh-client-ui-slots` 从该包再导出选择器 hook 类型，缺它会让每个 hook 静默丢失参数类型。
- peer 范围只扩到已验证序列；兼容性 job 的漂移 issue 会写明某序列缺了哪些包。

## 0.1.0

- 将现有 DSH Drop 提取为自足 MIT 仓库，使用公开依赖 pin。
- 原生图片与文件引用共用预览栏，发送时才拼路径。
- 修复接管附件栏后纯图片接收缺失。
- 移除不受信任 blob 顶层导航并防止 PDF MIME 混淆。
- 并发同名上传不覆盖；拒绝简单跨站写入；Unicode 文件名按 UTF-8 字节限长。
- 补双语贡献规范、CI/发版门禁、原创图标与合成截图。

页面内未发送清单、快捷键等限制见 README。
