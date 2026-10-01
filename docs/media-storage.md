# 媒体存储说明（已变更）

开源版**已取消独立媒体库**（无 `media_asset`、无分片上传、无签名下载、无 `IMediaStorage`）。

| 素材 | 存储方式 |
|------|----------|
| 视频 / 图文轮播图 / 文章插图 | Content.`mediaPaths` 记录本机**绝对路径**（不拷贝） |
| 竖/横封面及账号差异封面 | SQLite **BLOB**（Content / ContentTarget 列） |

`mediaPaths` 语义随 `Content.type`：

| type | mediaPaths |
|------|------------|
| `article` | 正文插图路径（可空） |
| `graphic` | 轮播图有序列表（至少 1 张才可发布） |
| `video` | 视频文件（通常 1 个） |

源文件被移动、删除或拔盘后，草稿仍可打开，但预览/发布会失败，需重新选择文件。

商业包 `@pugying/media-storage-pro` 规划已作废；勿再实现 `IMediaStorage` 替换钩子。
