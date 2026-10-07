# 图文实发核对

已通过程序中的抖音账号 Midnight 发布《桌上留一点绿》，仅自己可见。

- 本机内容 ID：`02f8417f-89d8-4dce-aa44-7ddf41bf1386`
- 本机分发目标 ID：`bf2b1d8f-b81e-4d02-a6a6-e33efff38883`
- 平台作品 ID：`7693773543242304768`
- 平台作品链接：https://www.douyin.com/note/7693773543242304768
- 实际顺序：[第一张](desk-green-1.png)、[第二张](desk-green-2.png)。两张配图均通过内置 image_gen 生成，完整提示词与文案见 [manifest.json](manifest.json)。
- 平台回读：[receipt.json](receipt.json)。已核对两张图片、标题及分隔标记、文案、540×720 封面、仅自己可见（`visibilityType=1`，读取自 `status.private_status`）和生成图片声明。
- 程序分发详情显示“全部完成，成功 1 / 共 1 个账号”，成功状态与平台作品 ID 已持久化。

提交只执行一次。平台会整理描述中的空行；回读记录保留平台实际保存的文本。核对记录不含 Cookie 或完整账号资料。平台审核状态以平台为准。

最终检查：桌面端类型检查与构建通过，Vitest 583 项通过、8 项按配置跳过。新增检查覆盖真实接口载荷、图片顺序、声明、可见性、取消、未知回执及隔离会话。


## 头条与小红书（2026-10-07）

- 头条账号「洲谋天下」公开发布《给桌面留一点空》，用户已明确确认公开发布。完整队列成功回执见 [toutiao-queue-test.json](toutiao-queue-test.json)，作品 ID `1878366610401288`；[公开作品](https://www.toutiao.com/w/1878366610401288/)及平台管理页已确认文案与两张有序配图。
- 声明字段核对发现 `extra.info_source` 需另行 JSON 编码，适配器与测试已修正。在同一条作品上选择「引用 AI」并补充文字「配图由 AI 生成。」后保存，公开页已显示新文案与「作品声明：内容由AI生成」。未重复发布新作品；[修改后核对截图](toutiao-declaration-proof.jpg)。[公开页证明](toutiao-publish-proof.jpg)确认声明已生效；平台编辑页不恢复声明控件选中状态，核对采用公开作品页。
- 小红书账号 Midnight 私密发布《给桌面留一点空》，作品 ID `6ac5d1ec0000000018007a83`。完整队列自动保存成功，平台回读确认标题、文案、两张图片顺序、`privacy.type=1` 及 `metadata.user_declaration.origin=2`。见 [xiaohongshu-queue-test.json](xiaohongshu-queue-test.json)。
- 调试过程另有两篇私密测试笔记。《绿意不用很多》已按平台回执同步本机成功状态，见 [xiaohongshu-test.json](xiaohongshu-test.json)；《窗边的这一点绿》平台管理页确认仅自己可见，但提交时 SDK 的成功码 `N/A` 尚未兼容，未取得作品 ID，本机保留结果待确认，不重发。后续适配器已兼容「成功标志 + 有效作品 ID」组合。

本轮验证通过：桌面类型检查、构建，服务端 115 项单元测试、1 项 E2E、ESLint 与构建。桌面全量测试 608 项通过、8 项跳过，覆盖声明编码与 HTTP 拒绝分类。
