# 发版与上架

> [English](releasing.md) · **中文** · [目录](README.zh.md)

1. 同步 package.json 版本、锁文件和 CHANGELOG（中英两版），保持两版 README 准确，包括固定版本的安装示例（`npm run check` 会核对它与版本一致）。
2. 本地跑完整 CI（`npm ci`、`npm run typecheck`、`npm test`、`npm run check:dist`、`npm run build`——之后 `git status` 必须干净——以及 `npm run check`），GitHub CI 绿后才合入 main——包括 Node 矩阵和两个必需的 harness 组合 `harness@pinned`、`harness@floor`。
3. 推送匹配版本的 v 前缀 tag。Release 工作流的 `pack` 任务核对 tag 与版本一致，跑类型检查和测试，在任何重建之前用临时构建比对已提交的 `lib/`（`check:dist`），要求 `npm run build` 不改动已提交的树，跑 `check`，然后只打包一次 `dsh-drop.tgz` 和 `SHA256SUMS`。随后 `gate` 任何一项不通过都不发布：
   - `harness-compat.yml` 的 **pinned**、**floor**、**desktop** 三格，针对 tag 自己的代码树：类型检查（含产物对 harness 模块的读取）、测试、两种 semver 规则下的 peer 准入，以及这个打好的 `dsh-drop.tgz` 在该精确版本 `@deepseek-ai/dsh` 上的启动冒烟——`desktop` 是两个桌面更新 feed 共同发布的版本，以及 npm 上同版本的 Web 应用；
   - **desktop-bytes**：在 macOS 上、用桌面应用自带的运行时对同一个文件跑同样的冒烟；此前先核对下载的 zip 与 feed 的 sha512 一致、内置运行时版本与 feed 一致；
   - **sweep**：对 peer 范围所接纳的最低版本（0.0.1-rc.1）起、运行时从 npm 读取的每个已发布 `@deepseek-ai/dsh` 版本做类型检查、测试、peer 准入，并对同一个 `dsh-drop.tgz` 做启动冒烟。`@deepseek-ai/dsh` 本身装不上的版本（0.0.1-rc.1 与 rc.2）记为中性，摘要里引用 npm 的原始回答（其 peer 准入仍然计入）；其他任何失败——包括 registry 无应答——都会阻止发版。
   之后 release 任务校验 `SHA256SUMS`，只要 gate 留下的任一冒烟记录指向别的字节就拒绝发布，否则用同一个文件创建发布，并把已验证的 harness 版本表放在自动生成的发布说明之前。
4. 验证公开资产可下载，包含 cordis.patch.yml 和双半边，并能免源码构建安装——Web 上用 `dsh plugin --profile web add <url>`，桌面应用里用 **插件 → 添加插件**。

固定资产名 dsh-drop.tgz：https://github.com/Crosery/dsh-drop/releases/latest/download/dsh-drop.tgz。latest 动态解析但文件名按字面取，所以文件名不带版本。需要固定版本时使用 releases/download/v0.3.0/dsh-drop.tgz。每次发布附 SHA256SUMS。当前未配置 npm 发布，不要宣传 npm 包名安装渠道。仓库提交了双半边产物且没有 prepare 脚本，git 源码安装无需 allowBuilds 授权；可复现安装仍以 tarball 为准。

门禁若在本次发版没改动的格子上失败——桌面 feed 更新了，或隔夜发布了新的 harness——这仍是真实结论：tag 的代码在那里跑不起来。先修复（按[上游兼容性](harness-compatibility.zh.md)验证后放宽范围或适配），再打新 tag；不要反复重跑直到变绿。

## 市场

向 https://github.com/awesome-dsh-plugin/awesome-dsh-plugin 仅提交 data/plugins/Crosery__dsh-drop.yml，包含准确仓库 URL/name、ui 分类、事实性中英文描述及 tarball。截图在本仓库 screenshots.json 声明，不修改市场自动生成的 README 或其他条目。仓库添加 dsh-plugin topic。

2026-09-05 核对的 contributing.md 要求仓库创建满一天，旧的十次提交门槛已移除。上架前重新核对规则；新仓 PR 若卡年龄，要明确披露、真实满足时间后请求重跑，不造时间戳或空历史。已提交不等于已合并。

来源：市场 contributing.md、本仓库 .github/workflows/release.yml 与 harness-compat.yml。
