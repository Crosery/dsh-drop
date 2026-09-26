# 提交与 PR

> [English](pull-requests.md) · **中文** · [目录](README.zh.md)

提交标题用英文祈使句 type: summary（feat、fix、docs、test、ci、chore、refactor）。正文解释逼出设计的约束，而不是复述 diff。一个 PR 一个可核验的主张；rebase 跟上 main，不重写他人工作。

评审前运行 package.json 中的验证命令，说明复现、行为变化、测试、兼容性和限制。用户文档中英同步；AGENTS.md 和 CLAUDE.md 保持单语。

必须通过：分开 typecheck、测试、构建、客户端模块表纯度以及产物对 harness 模块成员的读取（按固定序列的真实导出核对）、打包 patch/入口/类型/素材、词典键一致、公开依赖及预发布 peer 范围、截图路径和文档配对。新增不变量要故意破坏一次临时样本，证明它会失败。

## PR 上的 CI

| 检查 | 是否必需 | 内容 |
| --- | --- | --- |
| `node 22.19`、`node 24` | 是 | `npm ci`、类型检查、测试、`check:dist`（用临时构建比对已提交的 `lib/`）、构建（不得改动已提交的树）、`check` |
| `harness / harness@pinned` | 是 | 在固定开发序列（0.1.7-rc.2）上跑四项 harness 检查 |
| `harness / harness@floor` | 是 | 在 0.1.1-rc.2 地板上跑同样四项，所有 `@deepseek-ai/dsh-*` 开发依赖改指向该版本 |
| `desktop / harness@desktop` | 否 | 在桌面应用更新 feed 当前发布的版本上跑同样四项；feed 会在 PR 打开期间变化，这个信号归定时任务负责 |
| `invariants`（PR review） | 是 | `check` 与 `check:dist` |

四项 harness 检查是 **types**（三个 TypeScript 程序加 `check-dist.mjs --bundle-only --train <版本>`）、**tests**、**admission**（每个 harness peer 在 node-semver 默认规则和 `includePrerelease` 下都接纳该版本；dsh ≥0.1.7 在安装和启动时强制执行后者）和 **smoke**（`scripts/smoke-boot.mjs`：在一次性 home 里用 `dsh plugin add` 安装打包插件、启动、激活、检查三条 Host 路由，并按 shell 模块表和该序列的导出评估浏览器产物）。步骤摘要会写明失败的检查项和精确版本。本地复现某一格：

~~~sh
node scripts/harness-target.mjs floor --repoint --install   # 会改写 package.json 和 node_modules；用 git checkout + npm ci 还原
npm run typecheck && node scripts/check-dist.mjs --bundle-only --train 0.1.1-rc.2 && npm test
node scripts/harness-target.mjs 0.1.1-rc.2 --admits
git checkout -- package.json package-lock.json && node scripts/smoke-boot.mjs --dsh 0.1.1-rc.2
~~~

不要为了让 admission 通过而放宽 peer 范围：只有某版本的类型检查、测试和 `smoke-boot.mjs --dsh <版本> --accept-risk` 都已通过，才放宽到该版本，并同时写进 `scripts/check-invariants.mjs` 的已验证列表和[上游兼容性](harness-compatibility.zh.md)。

CI 和 PR review 使用 pull_request 和只读 contents 权限，包括 fork；不以 pull_request_target 特权执行贡献者代码。harness 任务声明 `issues: write` 与 `actions: read` 只是因为可复用工作流的结论步骤和兜底的 `unreported` 任务能上报漂移；PR 上 `report` 关闭，fork 的 token 无论如何都是只读。确定性评审无需付费 API key。人工仍需检查描述与代码是否一致，以及预览/HTTP 修改是否削弱安全边界。
