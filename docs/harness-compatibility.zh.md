# 上游兼容性

> [English](harness-compatibility.md) · **中文** · [目录](README.zh.md)

可复现基线为公开发布的 DSH 0.1.1-rc.2 包序列及 Cordis 4.0.2，Host peer 显式接纳该预发布元组。node-semver 的通配符或看似宽泛的稳定范围不会自动接纳预发布；不变量脚本逐项核对 dev pin 与 peer。运行时服务包放 peer，dev 镜像已验证的具体版本。发布 checkout 不得依赖本地 link:、file:、workspace:。

上游漂移时先读目标版本公开声明，同步更新相关 DSH pin，重新生成 package-lock.json，分别检查两半边和测试、构建、核对加载器模块表，并实测 Web 组合器后再扩兼容范围。single 附件席位、输入 phase/actions、捕获提交选择器和 UI-primitives 基线尤其敏感。CI 测 Node 22.19 和 24；harness 使用偶数主版本。

每周 harness-compat 探测 next/alpha，失败创建或更新 upstream-drift issue，不自动发布或扩大 peer。缺 tag 必须报告，不能算兼容；安装失败与 API/type 失败要分开诊断。

来源：package.json、package-lock.json、scripts/check-invariants.mjs，以及公开安装的 dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts。
