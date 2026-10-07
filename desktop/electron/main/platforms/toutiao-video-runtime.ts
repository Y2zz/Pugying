/** 2026-10-07 当前头条视频页：西瓜模块 36758 封装官方分片 SDK 与上传凭据。 */
export const TOUTIAO_VIDEO_UPLOAD_RUNTIME = `(() => {
  if (location.hostname !== 'mp.toutiao.com') { return false; }
  const apps = [...Object.values(window.Garfish?.apps || {}), ...Object.values(window.Garfish?.cacheApps || {}), ...(window.Garfish?.activeApps || [])];
  const globals = [window, ...apps.map(app => app.vmSandbox?.global || app.global).filter(Boolean)];
  const global = globals.find(global => Object.keys(global).some(key => /^@mp\\/xigua:/.test(key) && Array.isArray(global[key])));
  if (!global) { return false; }
  const key = Object.keys(global).find(key => /^@mp\\/xigua:/.test(key) && Array.isArray(global[key]));
  let require;
  global[key].push([['pugying_video_' + crypto.randomUUID()], {}, runtime => { require = runtime; }]);
  if (!require?.m) { return false; }
  if (![36758, 7234, 14562].every(id => require.m[id])) {
    // 初始上传页尚未挂载编辑器；交由当前版本的平台加载器解析依赖地址。
    if (require.e) { void Promise.all([380, 7234, 4562].map(id => require.e(id))).catch(() => {}); }
    return false;
  }
  const createUploader = require(36758).Z;
  if (typeof createUploader !== 'function') { return false; }
  window.__pugyingToutiaoVideoUpload = async file => {
    // 投稿接口对 VOD STS（第五参数 true）回执会报 provider 非法；当前页默认走 object 上传。
    const uploader = await createUploader(file, 'video', undefined, undefined, false);
    if (!uploader?.on || !uploader?.start) { throw { code: 'ARTICLE_API_CHANGED' }; }
    window.__pugyingVideoProgress = 0;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, result) => {
        if (settled) { return; }
        settled = true;
        if (error) { reject(error); } else { resolve(result); }
      };
      uploader.on('progress', event => {
        if (!settled) { window.__pugyingVideoProgress = Math.min(100, Math.max(0, Number(event.percent) || 0)); }
      });
      uploader.on('complete', event => {
        const result = event?.uploadResult;
        if (typeof result?.Vid !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(result.Vid)) {
          finish({ code: 'ARTICLE_API_CHANGED' });
          return;
        }
        window.__pugyingVideoProgress = 100;
        // 保留官方完整回执；投稿侧可能需要 Provider / PosterUri 等字段。
        finish(undefined, result);
      });
      uploader.on('error', () => { finish({ code: 'VIDEO_UPLOAD_FAILED' }); });
      try { uploader.start(); } catch { finish({ code: 'VIDEO_UPLOAD_FAILED' }); }
    });
  };
  return true;
})()`;

/** 投稿采用西瓜视频 JSON/CSRF 契约；保留大整数作品 ID。 */
export const TOUTIAO_VIDEO_RUNTIME = `(() => {
  if (!(${TOUTIAO_VIDEO_UPLOAD_RUNTIME})) { return false; }
  if (!window.Garr?.network?.post) { return false; }
  window.__pugyingArticleApi = {
    async request(path, data) {
      const token = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('xigua_csrf_token='))?.slice('xigua_csrf_token='.length);
      if (data !== undefined && !token) { throw { code: 'AUTH_EXPIRED' }; }
      const response = await fetch(path, {
        method: data === undefined ? 'GET' : 'POST', credentials: 'include', redirect: 'error',
        headers: data === undefined ? {} : { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: data === undefined ? undefined : JSON.stringify(data)
      });
      if (!response.ok) { throw { code: response.status === 401 ? 'AUTH_EXPIRED' : 'HTTP_REQUEST_FAILED' }; }
      return JSON.parse(await response.text(), (key, value, context) =>
        typeof value === 'number' && !Number.isSafeInteger(value) && context?.source ? context.source : value);
    },
    async upload(file) {
      const form = new FormData(); form.append('image', file);
      const response = await window.Garr.network.post('/spice/image?upload_source=20020004&aid=1231&device_platform=web', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (response?.code !== 0) { throw { code: 'ARTICLE_API_CHANGED' }; }
      const image = response.data;
      return { uri: image.origin_image_uri, url: image.origin_image_url, width: image.image_width, height: image.image_height, size: file.size / 1024 };
    },
    async uploadVideo(file) {
      const source = URL.createObjectURL(file);
      const video = document.createElement('video');
      try {
        const metadata = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { reject({ code: 'VIDEO_UNSUPPORTED' }); }, 15000);
          video.onloadedmetadata = () => { clearTimeout(timer); resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }); };
          video.onerror = () => { clearTimeout(timer); reject({ code: 'VIDEO_UNSUPPORTED' }); };
          video.preload = 'metadata'; video.src = source;
        });
        if (!(metadata.duration > 0 && metadata.duration <= 10800 && metadata.width > 0 && metadata.height > 0)) { throw { code: 'VIDEO_UNSUPPORTED' }; }
        const receipt = await window.__pugyingToutiaoVideoUpload(file);
        return {
          vid: receipt.Vid,
          ...metadata,
          coverUri: typeof receipt.PosterUri === 'string' ? receipt.PosterUri : '',
          provider: receipt.VideoMeta?.Provider ?? receipt.Provider ?? receipt.provider,
          uploadResult: receipt,
        };
      } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(source); }
    }
  };
  return true;
})()`;
