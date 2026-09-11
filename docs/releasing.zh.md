# 发版与上架

> [English](releasing.md) · **中文** · [目录](README.zh.md)

1. 同步 package.json 版本、锁文件和 CHANGELOG，保持两版 README 准确。
2. 本地跑完整 CI，GitHub CI 绿后合入 main。
3. 推送匹配版本的 v 前缀 tag。Release 工作流核对 tag/版本、验证、构建、打包后才发布。
4. 验证公开资产可下载，包含 cordis.patch.yml 和双半边，并能免源码构建安装。

固定资产名 dsh-drop.tgz：https://github.com/Crosery/dsh-drop/releases/latest/download/dsh-drop.tgz。latest 动态解析但文件名按字面取，所以文件名不带版本。需要固定版本时使用 releases/download/v0.1.3/dsh-drop.tgz。每次发布附 SHA256SUMS。当前未配置 npm 发布，不要宣传 npm 包名安装渠道。仓库提交了双半边产物且没有 prepare 脚本，git 源码安装无需 allowBuilds 授权；可复现安装仍以 tarball 为准。

## 市场

向 https://github.com/awesome-dsh-plugin/awesome-dsh-plugin 仅提交 data/plugins/Crosery__dsh-drop.yml，包含准确仓库 URL/name、ui 分类、事实性中英文描述及 tarball。截图在本仓库 screenshots.json 声明，不修改市场自动生成的 README 或其他条目。仓库添加 dsh-plugin topic。

2026-09-05 核对的 contributing.md 要求仓库创建满一天，旧的十次提交门槛已移除。上架前重新核对规则；新仓 PR 若卡年龄，要明确披露、真实满足时间后请求重跑，不造时间戳或空历史。已提交不等于已合并。

来源：市场 contributing.md、本仓库 .github/workflows/release.yml。
