# 开发规范

> [English](development.md) · **中文** · [目录](README.zh.md)

## 改边界，不改宿主

Host 注册 POST /crosery/dsh-drop/resolve（只 stat 比对路径）和 POST /crosery/dsh-drop/stage（限额流式上传）。浏览器持有按会话隔离的 AttachedFiles 和页面内 PreviewStore。附件栏以 priority -1 占用 single 席位 conversation.input.attachments，卸载后恢复出厂条目；占席位也必须接管纯图片接收。

拖放规划、文件名归约、引用拼写和预览分类放在无 DOM 的纯函数。客户端仅用公开 slot props 和 inputActions。捕获阶段的提交拦截是兼容接缝，不是另一套发送实现。修改时验证 Enter、IME、Shift+Enter、禁用/只读控件、引用菜单、失败和纯文件发送。

## 状态与生命周期

引用在发送前不进草稿，用户文字放在路径前面，保持标题可读。PNG/JPEG/WebP/GIF 通过 onAddImages 沿用宿主校验。未发送的非图片引用及预览字节只存在页面内，刷新或卸载会丢失。提交失败由组合器保留拼好路径的草稿，同时清空待发清单，重试不会重复拼接。

状态放在 apply/effect 内；卸载取消上传、移除 document 监听。object URL 在卸载时撤销，长会话可能占用较多内存。文本只预览前 64 KiB；Office 和压缩包只提供身份卡。

## 安全与存储

上传文件名归约为单段，按 UTF-8 字节限制长度，加同名后缀。完整临时文件通过原子、不覆盖的硬链接发布，并发不能改变已经返回路径的字节。stage 强制非简单请求的名称头、拒绝非同源 Fetch Metadata、不授予 CORS 权限。这是 CSRF 防护，不是鉴权：保持 DSH 仅监听本机或置于认证访问之后；同源插件和受信任本地客户端仍具有宿主权限。

禁止在新标签导航拖入文件的 blob URL：SVG 在 img 中安全不代表顶层文档安全。HTML/XML 只显示转义源码；PDF 即使收到 HTML MIME 也强制 application/pdf。浏览器不一定支持所有编解码器/PDF。不会自动执行或解压文件。清理会删除 DSH_HOME/drops 下过期日期目录，目录内手工放的东西也会一起删除。

## 验证

运行 npm run typecheck、npm test、npm run build、npm run check、npm run check:dist。Host 测试使用真实 HTTP 和临时目录。两半边分开 typecheck；测试可以包含 DOM 类型，但不能同时拉入相冲突的 Context 增强。新增行为补能在旧实现上失败的回归。UI 修改要在已有 DSH URL 刷新后用合成文件验证：纯图片、混合拖放、粘贴、移除、文本/PDF 预览、灯箱键盘焦点、窄栏、纯文件 Enter。截图不能暴露真实文档和会话历史。仅记录实际跑过的验证。

来源：src/index.ts、src/contract.ts、两条 route、src/client/rail-entry.ts 及 pin 版本的 dsh-client-ui-conversation 公开声明。
