import { XIAOHONGSHU_GRAPHIC_RUNTIME } from "./article-platform-runtime";

/** 2026-10-07 核对官方 project-publish-vue：PublishCore 分片上传与处理查询。 */
export const XIAOHONGSHU_VIDEO_RUNTIME = `(async () => {
  try {
  if (!await (${XIAOHONGSHU_GRAPHIC_RUNTIME})) { return 'WAIT_GRAPHIC'; }
  let require;
  window.webpackChunkugc.push([['pugying_video_' + crypto.randomUUID()], {}, runtime => { require = runtime; }]);
  // 官方编辑器按需加载字段转换器；chunk 缺失或加载失败时返回未就绪，由外层重试。
  if (!require?.m?.[43257]) {
    if (!require?.e) { return 'WAIT_LOADER'; }
    try {
      await Promise.all(['3330', '1314', '2100'].map(id => require.e(id)));
    } catch (error) {
      return 'WAIT_CHUNK:' + String(error && error.message || error);
    }
  }
  const missing = [67490, 9712, 43257].filter(id => !require?.m?.[id]);
  if (missing.length) { return 'WAIT_MODULES:' + missing.join(','); }
  const core = require(67490);
  const sdk = core.t$;
  const getToken = require(9712).gf;
  const toSnakeCase = require(43257).toSnakeCase;
  if (!sdk?.uploader?.createUploader || !sdk?.media?.queryVideoInfo || !getToken || !core.Nw || !toSnakeCase) {
    return 'WAIT_EXPORTS';
  }
  await core.Nw();
  const request = window.__pugyingArticleApi.request;
  window.__pugyingArticleApi.request = (path, data) => request(path,
    path === '/web_api/sns/v2/note' && data !== undefined ? toSnakeCase(data, { deep: true }) : data);
  window.__pugyingArticleApi.uploadVideo = async file => {
    const info = await sdk.media.queryVideoInfo(file);
    const video = sdk.media.queryVideoTrack(info);
    const audio = sdk.media.queryAudioTrack(info);
    const general = sdk.media.queryGeneralTrack(info);
    const duration = Number(video?.Duration || general?.Duration);
    const rotated = [90, 270].includes(Math.abs(Number(video?.Rotation)) % 360);
    const width = Number(rotated ? video?.Height : video?.Width);
    const height = Number(rotated ? video?.Width : video?.Height);
    if (!(duration > 0 && duration <= 14400 && width > 0 && height > 0)) { throw { code: 'VIDEO_UNSUPPORTED' }; }
    const needsTranscode = video.Format !== 'AVC' || !!(audio && audio.Format !== 'AAC');
    const uploader = sdk.uploader.createUploader('pugying-video-' + crypto.randomUUID(), {
      scene: needsTranscode ? 'preview_video' : 'video', bizName: 'spectrum', getToken,
      enableResume: true, enableChannelMeasurement: true
    });
    let instance, taskId;
    window.__pugyingVideoProgress = 0;
    uploader.onProgress(event => {
      window.__pugyingVideoProgress = Math.min(100, Math.max(0, Number(event.percent) * 100 || 0));
    });
    uploader.onInstanceCreated(value => { instance = value; });
    uploader.onTaskReady(value => { taskId = value; });
    try {
      const uploaded = await uploader.upload(file);
      const id = uploaded?.videoId || await uploader.generatorID(uploaded?.fileId, '217');
      if ((!['string', 'number'].includes(typeof id)) ||
          (typeof id === 'number' && !Number.isSafeInteger(id)) || !id || String(id) === '-1' || !uploaded?.fileId) {
        // 把回执摘要塞进错误码，主进程可记录字段变化（不含 Cookie）。
        throw {
          code: 'ARTICLE_API_CHANGED',
          receipt: {
            idType: typeof id,
            id: id == null ? null : String(id).slice(0, 32),
            fileId: uploaded?.fileId == null ? null : String(uploaded.fileId).slice(0, 64),
            keys: uploaded && typeof uploaded === 'object' ? Object.keys(uploaded) : [],
          },
        };
      }
      window.__pugyingVideoProgress = 100;
      const deadline = Date.now() + 900000;
      while (Date.now() < deadline) {
        const processed = await sdk.media.queryTranscode(String(id), needsTranscode, needsTranscode ? '14' : undefined);
        if (processed?.hasFirstFrame && processed.firstFrameFileId &&
            (!needsTranscode || (processed.hasTranscodeVideo && processed.transcodeVideoFileId))) {
          return { vid: String(id), duration, width, height, coverUri: processed.firstFrameFileId,
            fileId: needsTranscode ? processed.transcodeVideoFileId : uploaded.fileId,
            originalMetadata: { video, audio: audio || null } };
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      throw { code: 'VIDEO_PROCESSING_TIMEOUT' };
    } finally {
      if (instance && taskId) { uploader.cancel(instance, taskId); }
    }
  };
  return true;
  } catch (error) {
    return 'WAIT_ERROR:' + String(error && error.message || error);
  }
})()`;
