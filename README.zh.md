<p align="center"><img src="assets/logo.png" width="128" alt="DSH Drop 图标" /></p>

# DSH Drop

> [English](README.md) · **中文**

把文件拖进或粘贴进 **DeepSeek Harness**——Web 版和桌面应用都支持。图片和文件共用一条预览栏，草稿只保留你打的字；**发送时才追加文件路径**。

[![CI](https://github.com/Crosery/dsh-drop/actions/workflows/ci.yml/badge.svg)](https://github.com/Crosery/dsh-drop/actions/workflows/ci.yml) [![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![统一附件栏](assets/screenshot-rail.png)

## 安装

要求 DeepSeek Harness **0.1.0-rc.8 至 0.1.7**——该区间内每个已发布序列都做过类型检查和测试，包括 0.1.1-rc.2、0.1.5-rc.2（npm `latest` 为 0.1.5-rc.3）以及桌面应用运行时 0.1.7-rc.2；逐版本结果见[上游兼容性](docs/harness-compatibility.zh.md)。DSH 0.1.7 会拒绝安装或加载 peer 范围不包含它的插件，所以本插件的旧版本在 0.1.7 上无法加载。

**Web：** PATH 上有 pnpm，以及 DSH 支持的偶数 Node 主版本（CI：22.19 / 24）。安装预构建包，然后**重启 profile**：

~~~sh
dsh plugin --profile web add https://github.com/Crosery/dsh-drop/releases/latest/download/dsh-drop.tgz
~~~

tarball 已包含双半边产物，安装不用运行插件构建。固定版本时将 latest/download 替换为 download/v0.1.3。仓库同时提交了构建产物，因此 `dsh plugin --profile web add github:crosery/dsh-drop` 不需要任何构建授权即可安装；需要可复现时优先用打 tag 的 tarball。若本地 patch 已挂载 @crosery/dsh-drop，勿重复安装。

~~~sh
dsh plugin --profile web remove @crosery/dsh-drop
~~~

移除后同样需要重启。[源码安装与发版流程](docs/releasing.zh.md)。

**桌面应用：** `dsh plugin` 命令行拒绝操作桌面 profile。在应用里打开 **插件 → 添加插件**，粘贴上面的发布地址；升级已安装的插件需要重启应用。

## 文件如何抵达模型

| 文件 | 发送方式 | 预览 |
| --- | --- | --- |
| PNG / JPEG / WebP / GIF | 出厂图片附件，沿用模型能力、大小、数量校验 | 缩略图和图片灯箱 |
| 通过输入框自带 **+** 选择的文件 | 出厂文件附件（0.1.3 起），由 DSH 上传 | 卡片显示上传进度、失败与重试 |
| 其他图片 | 文件引用 | 浏览器支持时显示图片 |
| 视频 / 音频 | 文件引用 | 原生播放控件，取决于编解码器 |
| PDF | 文件引用 | 浏览器有 PDF 阅读器时可预览 |
| Markdown / 代码 / 日志 / CSV / HTML | 文件引用 | 转义文本，前 64 KiB；不执行 HTML |
| Office / iWork / 压缩包 / 未知类型 | 文件引用 | 文件名、大小、格式徽标；没有文档渲染器 |
| 文件夹 | 跳过并提示（文件夹支持在计划中） | 不递归上传 |

非图片文件成为 **@路径**，不是新的模型内容块。模型必须显式调用文件工具才看得到内容，因此大日志在被读取前只花一个路径的 token。本插件不新增模型工具；它与 [DSH Viewer](https://github.com/Crosery/dsh-viewer) 互补，后者负责模型向你展示文件。

1. 打开一个会话，把文件拖入或粘贴进页面。落在哪个输入框上就进哪个输入框，落在别处则进当前对话的输入框；暂不接收文件的输入框（子智能体的、正在发送的）会直接提示原因。混合批次中的图片仍走出厂通道。
2. 在同一条栏中检查卡片：路径就绪前卡片显示「准备中…」；点击预览，逐个移除不会改变你打的字。同一个文件拖两次只会加一次。
3. 输入要求，按 Enter 或点发送按钮。模型先收到你的话，再收到文件引用。**只发文件时可以按 Enter，也可以直接点灰色的发送按钮。**

![文本预览](assets/screenshot-preview.png)

## 优先原文件，否则暂存

**桌面应用：** 应用会把每个拖入文件的真实路径告诉页面，引用直接指向原文件——不复制，之后的修改在模型读取时即可见。

**Web：** 浏览器 File 不提供 OS 路径。拖拽若额外携带本地 file:// 提示，Host 比对文件大小和修改时间（允许 2 秒误差），匹配普通文件则引用原路径。元数据匹配只是启发式，不代表字节完全一致，也不是权限检查。路径中含双引号或控制字符时无法写成引用，退回暂存。

否则字节流入 **$DSH_HOME/drops/YYYY-MM-DD/**。完整副本以不覆盖的方式发布，并发同名上传也不会互相改写。编辑副本不会回写原文件；想可靠引用工作区文件，用输入框 @ 补全。远程 agent 必须能读取 Host 路径；本插件不自动同步远程工作区。

## 配置

**0.1.0–0.1.6**：$DSH_HOME/settings.yaml 中命名空间 **crosery-drop**，修改即时生效。

**0.1.7**：settings.yaml 已取消。请在 profile 的 `cordis.patch.yml` 里给插件条目（id `drop`）写配置（需重写整个 `config` 块——patch 会替换该行的配置）。0.1.7 的一次性导入**不会**迁移 `crosery-drop` 段：它按段名寻找同名条目，而本条目叫 `drop`；旧值留在 `settings.yaml.imported` 里。0.1.7 的设置页不会为这两个字段生成表单。

| 键 | 默认值 | 含义 |
| --- | ---: | --- |
| maxBytes | 536870912（512 MiB） | 每个暂存文件的字节上限，必须大于零。 |
| keepDays | 30 | 按日期目录保留的天数，0 关闭清理。 |

启动及保留期改变时清理过期日期目录，**目录内手工放入的东西也会删除**；其他名称的目录和零散文件不动。移除卡片**不会**删除副本。

## 重要限制

- **未发送的非图片清单只存在页面内。刷新或卸载会丢失待发引用和预览，发送前需重新拖入。** 磁盘上有副本不代表待发清单恢复了。
- 复制没有字节级进度，也没有总磁盘配额。卡片仍显示「准备中…」时发送会被拦下并提示；未能暂存的文件会按数量提示。
- 在 0.1.2 起的输入框上，引用在你发送的那一刻追加到消息末尾，再由输入框自己的 Enter 或发送按钮投递——Cmd/Ctrl+Enter 的 steer/排队、上传检查和斜杠命令都照常生效。若输入框拒绝发送（例如它自己的上传还没完成），追加的引用会被撤回，文件继续留在栏中。Shift+Enter、输入法组字、高亮中的补全菜单都不会被当作发送；停止按钮永远不会带走文件。0.1.0–0.1.1 的 textarea 输入框仍由插件改写草稿并自行提交。
- 已发出的消息若之后失败，输入框会把带引用的文字恢复到草稿供重试，引用不会回到附件栏。本插件无法新增通用文件内容块。
- 附件留在栏中时预览字节保存在内存里，发送或移除后即释放。预览显示的是拖入时的字节，模型读取的是实际文件。媒体、HEIC、PDF 支持因浏览器而异。
- 接管 single 附件席位而非加一条并列栏；其他插件若占用相同优先级可能冲突。卸载后恢复出厂栏。

## 安全

没有第三方上传服务、分析统计、自动执行或解压。暂存是 Host 写端点：文件名归约成单段、限制大小、拒绝简单跨站 POST、不授予 CORS。在 **0.1.7** 上两条路由还要求 harness 自身的登录鉴权（其 connection 检查），没有登录 cookie 的其他本机进程会被拒绝。**更早的序列上这两条路由没有自己的鉴权**：保持 DSH 仅本机可访问或置于认证之后，不向不受信任用户暴露宿主权限。同源插件拥有页面权限。

SVG 留在图片元素，HTML 只展示转义源码，PDF blob 强制 application/pdf；预览不提供顶层 blob 导航。默认保留期清理不等于安全擦除。参见[开发与安全边界](docs/development.zh.md)。

## 开发

~~~sh
npm ci
npm run typecheck
npm test
npm run build
npm run check
npm run check:dist
~~~

仓库自足，依赖公开 pin 版本，不要求兄弟 checkout。[AGENTS.md](AGENTS.md) 路由到[双语开发、PR、发版与兼容规范](docs/README.zh.md)。四套工作流分别负责 CI、确定性 PR 评审、受验证约束的 Release 和定期上游漂移检测。

## 许可

[MIT](LICENSE)，包括原创图标和合成演示素材。源码起源于 Crosery 的插件工作区，本仓库是独立分发版本。
