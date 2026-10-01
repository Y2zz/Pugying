# 图文发布：核心目标与验收标准

1. **一条图文**：多图轮播（有序 `mediaPaths`）+ 标题 / 文案分离（纯文本 `body`）+ 竖版封面为主（可自首图裁切）
2. **多方分发**：抖音图文、小红书、视频号图文；同平台可多选账号，各一份 Target
3. **个性化**：图片与文案共用；其余按账号走独立平台表单
4. **持久化**：保存草稿（Content `type=graphic` + Targets + overrides + 封面 BLOB）
5. **与文章区分**：图文是图文分离；文章是富文本内嵌图，见 [`publish-article.md`](publish-article.md)
6. **约束**：不改 `components/ui/**`；用户文案克制

## 存量

- 历史上 `type=article` 且按「多图 + 竖封面」发布的内容，迁移后为 `graphic`
