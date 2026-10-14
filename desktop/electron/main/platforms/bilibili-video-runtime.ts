/** 当前 videoup 模块 64533：官方普通视频 stdSlice；33601 旧 UPOS 对 ugcfx/bup 会 400。 */
export const BILIBILI_VIDEO_UPLOAD_RUNTIME = `(() => {
  if (location.hostname !== 'member.bilibili.com') { return false; }
  if (!Array.isArray(window.webpackChunkvideoup)) { return false; }
  let require;
  window.webpackChunkvideoup.push([['pugying_video_' + crypto.randomUUID()], {}, runtime => { require = runtime; }]);
  if (!require?.m?.[64533]) { return false; }
  const Slice = require(64533)?.O0;
  if (typeof Slice !== 'function') { return false; }
  const ACCEPT_EXT = 'mp4,flv,avi,wmv,mov,webm,mpeg4,ts,mpg,rm,rmvb,mkv,m4v';
  window.__pugyingBilibiliVideoUpload = file => {
    if (!(file?.size > 0 && file.size <= 16 * 1024 ** 3)) { return Promise.reject({ code: 'VIDEO_UNSUPPORTED' }); }
    const profile = typeof window._profile?.upload === 'string' && window._profile.upload
      ? window._profile.upload
      : 'ugcfx/bup';
    // 与投稿页 VideoTask 一致：stdSlice + 账号 profile；关闭降级到 33601，避免 ?uploads 400。
    const uploader = new Slice(file, {
      primaryUploaderType: 'stdSlice',
      fallbackTarget: null,
      sliceProfile: profile,
      recommendSegSize: 0xa00000,
      fileSingleSizeLimit: 16 * 1024 ** 3,
      acceptExt: ACCEPT_EXT,
      skipAutoOS: true,
      skipSpeedTest: true,
      metaSupport: false,
      parsePackets: false,
    });
    window.__pugyingVideoProgress = 0;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, receipt) => {
        if (settled) { return; }
        settled = true;
        if (error) { reject(error); } else { resolve(receipt); }
      };
      const identity = event => {
        const raw = event?.cid ?? uploader.cid;
        const filename = event?.filename || uploader.filename;
        const id = typeof raw === 'string' ? raw : Number.isSafeInteger(raw) ? String(raw) : '';
        if (!/^[1-9][0-9]*$/.test(id) || typeof filename !== 'string' || !filename) { return undefined; }
        return { cid: id, filename };
      };
      uploader.on('progress', event => {
        if (settled) { return; }
        const value = Number(event?.progress);
        window.__pugyingVideoProgress = Math.min(100, Math.max(0, value > 1 ? value : value * 100));
      });
      uploader.on('uploadComplete', event => {
        const result = identity(event);
        if (!result) { finish({ code: 'ARTICLE_API_CHANGED' }); return; }
        window.__pugyingVideoProgress = 100;
        finish(undefined, result);
      });
      uploader.on('error', event => {
        const msg = event?.msg;
        finish({
          code: 'VIDEO_UPLOAD_FAILED',
          receipt: {
            stage: 'stdslice_error',
            type: event?.type,
            profile,
            detail: typeof msg === 'string' ? msg.slice(0, 200)
              : typeof msg?.message === 'string' ? msg.message.slice(0, 200) : undefined,
          },
        });
      });
      Promise.resolve(uploader.startUpload()).catch(error => {
        finish({
          code: 'VIDEO_UPLOAD_FAILED',
          receipt: {
            stage: 'startUpload',
            message: typeof error?.message === 'string' ? error.message.slice(0, 160) : undefined,
          },
        });
      });
    });
  };
  return true;
})()`;

/** 使用 videoup 原生客户端完成 CSRF、风控及投稿；不复用专栏的 WBI 请求。 */
export const BILIBILI_VIDEO_RUNTIME = `(() => {
  if (!(${BILIBILI_VIDEO_UPLOAD_RUNTIME})) { return false; }
  const app = document.querySelector('#video-up-app')?.__vue__;
  const client = app?.$api;
  if (!client?.pre || !client?.uploadImage || !client?.submitArchive) { return false; }
  // getProfile 可能晚于 Vue 挂载；与官方 initProfile 缺省一致，避免 ready 长期 false。
  if (typeof window._profile?.upload !== 'string' || !window._profile.upload) {
    window._profile = { upload: 'ugcfx/bup', meta: 'fxmeta/bup' };
  }
  window.__pugyingArticleApi = {
    async request(path, data) {
      if (path === '/x/vupre/web/archive/pre' && data === undefined) {
        const result = await client.pre();
        if (!result?.isLogin) { throw { code: 'AUTH_EXPIRED' }; }
        return { code: 0, data: result };
      }
      if (path !== '/x/vu/web/add/v3' || data === undefined) { throw { code: 'invalid_payload' }; }
      // 官方客户端明确 code=0 才 resolve，返回 data 中的 aid/bvid。
      try { return { code: 0, data: await client.submitArchive(data) }; }
      catch (error) {
        // 保留平台业务码与文案，便于本机诊断 PUBLISH_REJECTED，不暴露给用户界面。
        if (typeof error?.code === 'number') {
          return {
            code: error.code,
            message: typeof error?.message === 'string' ? error.message.slice(0, 200)
              : typeof error?.msg === 'string' ? error.msg.slice(0, 200) : undefined,
          };
        }
        throw { code: 'PUBLISH_RESULT_UNKNOWN' };
      }
    },
    async upload(file) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject({ code: 'ARTICLE_IMAGE_UNSUPPORTED' });
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const result = await client.uploadImage(dataUrl);
      if (typeof result?.url !== 'string' || !result.url) { throw { code: 'ARTICLE_API_CHANGED' }; }
      return { uri: result.url, url: result.url, width: image.naturalWidth, height: image.naturalHeight, size: file.size / 1024 };
    },
    async uploadVideo(file) {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      try {
        const metadata = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject({ code: 'VIDEO_UNSUPPORTED' }), 15000);
          video.onloadedmetadata = () => { clearTimeout(timer); resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }); };
          video.onerror = () => { clearTimeout(timer); reject({ code: 'VIDEO_UNSUPPORTED' }); };
          video.preload = 'metadata'; video.src = url;
        });
        // 与其它平台一致：允许短于 1 秒的探测素材，仍受平台最长 10 小时约束。
        if (!(metadata.duration > 0 && metadata.duration <= 36000 && metadata.width > 0 && metadata.height > 0)) { throw { code: 'VIDEO_UNSUPPORTED' }; }
        const upload = await window.__pugyingBilibiliVideoUpload(file);
        return { vid: upload.cid, fileId: upload.filename, coverUri: '', ...metadata };
      } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
    }
  };
  return true;
})()`;
