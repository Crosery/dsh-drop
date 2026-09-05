<p align="center"><img src="assets/logo.png" width="128" alt="DSH Drop 图标" /></p>

# DSH Drop

> [English](README.md) · **中文**

把文件拖进或粘贴进 **DeepSeek Harness Web**。图片和文件共用一条预览栏，草稿只保留你打的字；**发送时才追加文件路径**。

[![CI](https://github.com/Crosery/dsh-drop/actions/workflows/ci.yml/badge.svg)](https://github.com/Crosery/dsh-drop/actions/workflows/ci.yml) [![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![统一附件栏](assets/screenshot-rail.png)

## 安装

要求 DSH Web **0.1.1-rc.2** 包序列、PATH 上有 pnpm，以及 DSH 支持的偶数 Node 主版本（CI：22.19 / 24）。安装预构建包，然后**重启 profile**：

~~~sh
dsh plugin --profile web add https://github.com/Crosery/dsh-drop/releases/latest/download/dsh-drop.tgz
~~~

tarball 已包含双半边产物，安装不用运行插件构建。固定版本时将 latest/download 替换为 download/v0.1.0。当前没有发布 npm。若本地 patch 已挂载 @crosery/dsh-drop，勿重复安装。

~~~sh
dsh plugin --profile web remove @crosery/dsh-drop
~~~

移除后同样需要重启。[源码安装与发版流程](docs/releasing.zh.md)。

## 文件如何抵达模型

| 文件 | 发送方式 | 预览 |
| --- | --- | --- |
| PNG / JPEG / WebP / GIF | 出厂图片附件，沿用模型能力、大小、数量校验 | 缩略图和图片灯箱 |
| 其他图片 | 文件引用 | 浏览器支持时显示图片 |
| 视频 / 音频 | 文件引用 | 原生播放控件，取决于编解码器 |
| PDF | 文件引用 | 浏览器有 PDF 阅读器时可预览 |
| Markdown / 代码 / 日志 / CSV / HTML | 文件引用 | 转义文本，前 64 KiB；不执行 HTML |
| Office / iWork / 压缩包 / 未知类型 | 文件引用 | 文件名、大小、格式徽标；没有文档渲染器 |
| 文件夹 | 跳过并提示 | 不递归上传 |

非图片文件成为 **@路径**，不是新的模型内容块。模型必须显式调用文件工具才看得到内容，因此大日志在被读取前只花一个路径的 token。本插件不新增模型工具；它与 [DSH Viewer](https://github.com/Crosery/dsh-viewer) 互补，后者负责模型向你展示文件。

1. 打开一个会话，把文件拖入或粘贴进页面；混合批次中的图片仍走出厂通道。
2. 在同一条栏中检查卡片，点击预览，逐个移除不会改变你打的字。
3. 输入要求并发送。模型先收到你的话，再收到文件引用。**只发文件可以按 Enter**；没有文字或出厂图片时，出厂发送按钮仍是灰的。

![文本预览](assets/screenshot-preview.png)

## 优先原文件，否则暂存

浏览器 File 不提供 OS 路径。拖拽若额外携带本地 file:// 提示，Host 比对文件大小和修改时间（允许 2 秒误差），匹配普通文件则引用原路径。无法用引用语法表达的路径退回暂存。元数据匹配只是启发式，不代表字节完全一致，也不是权限检查。

否则字节流入 **$DSH_HOME/drops/YYYY-MM-DD/**。完整副本以不覆盖的方式发布，并发同名上传也不会互相改写。编辑副本不会回写原文件；想可靠引用工作区文件，用输入框 @ 补全。远程 agent 必须能读取 Host 路径；本插件不自动同步远程工作区。

## 配置

$DSH_HOME/settings.yaml 中命名空间 **crosery-drop**，修改即时生效。

| 键 | 默认值 | 含义 |
| --- | ---: | --- |
| maxBytes | 536870912（512 MiB） | 每个暂存文件的字节上限，必须大于零。 |
| keepDays | 30 | 按日期目录保留的天数，0 关闭清理。 |

启动及保留期改变时清理过期日期目录，**目录内手工放入的东西也会删除**；其他名称的目录和零散文件不动。移除卡片**不会**删除副本。

## 重要限制

- **未发送的非图片清单只存在页面内。刷新或卸载会丢失待发引用和预览，发送前需重新拖入。** 磁盘上有副本不代表待发清单恢复了。
- 暂无上传进度和总磁盘配额，卡片出现前请勿发送；大文件需要等待。部分批次失败目前记录到 console；整批失败显示提示。
- 有待发文件时 Enter 被接管为发送（排除 Shift+Enter、IME）。Cmd/Ctrl+Enter 降为普通投递，不 steer；此路径不遵循自定义提交快捷键偏好。没有待发文件时完全沿用出厂手势。
- 提交失败后路径留在拼好的草稿中供重试，不回到附件栏。斜杠命令与队列行为由组合器处理，使用时需留意；本插件无法新增通用文件内容块。
- 预览字节保留到卸载，长会话可能占内存；原地路径修改后重拖可能沿用旧预览，但模型读取实际文件。媒体、HEIC、PDF 支持因浏览器而异。
- 接管 single 附件席位而非加一条并列栏；其他插件若占用相同优先级可能冲突。卸载后恢复出厂栏。

## 安全

没有第三方上传服务、分析统计、自动执行或解压。暂存是 Host 写端点：文件名归约成单段、限制大小、拒绝简单跨站 POST、不授予 CORS。**这不等于鉴权。** 保持 DSH 仅本机可访问或置于认证之后，不向不受信任用户暴露宿主权限。同源插件拥有页面权限。

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
