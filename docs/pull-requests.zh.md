# 提交与 PR

> [English](pull-requests.md) · **中文** · [目录](README.zh.md)

提交标题用英文祈使句 type: summary（feat、fix、docs、test、ci、chore、refactor）。正文解释逼出设计的约束，而不是复述 diff。一个 PR 一个可核验的主张；rebase 跟上 main，不重写他人工作。

评审前运行 package.json 中的验证命令，说明复现、行为变化、测试、兼容性和限制。用户文档中英同步；AGENTS.md 和 CLAUDE.md 保持单语。

必须通过：分开 typecheck、测试、构建、客户端模块表纯度、打包 patch/入口/类型/素材、词典键一致、公开依赖及预发布 peer 范围、截图路径和文档配对。新增不变量要故意破坏一次临时样本，证明它会失败。

CI 和 PR review 使用 pull_request 和只读 contents 权限，包括 fork；不以 pull_request_target 特权执行贡献者代码。确定性评审无需付费 API key。人工仍需检查描述与代码是否一致，以及预览/HTTP 修改是否削弱安全边界。
