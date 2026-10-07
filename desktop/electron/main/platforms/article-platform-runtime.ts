/**
 * 2026-10-06 从平台当前编辑器公开脚本核对。
 * 隐藏 Chromium 只承载平台的 Cookie、上传和签名 SDK；不填表、不点击发布。
 * 抖音使用当前创作者客户端，避免自行伪造签名；模块变化时停止提交。
 */
export const DOUYIN_ARTICLE_RUNTIME = `(async () => {
  if (location.hostname !== 'creator.douyin.com') { return false; }
  // 当前创作者中心通过 Garfish 隔离文章应用的全局变量。
  const micro = [...Object.values(window.Gar?.cacheApps || {}), ...(window.Gar?.activeApps || [])].map(app => app.vmSandbox?.global || app.global)
    .find(global => global?.webpackChunkdouyin_creator_content);
  const chunks = window.webpackChunkdouyin_creator_content || micro?.webpackChunkdouyin_creator_content;
  if (!chunks) {
    // 失效授权会在原网址直接显示登录页，并不一定跳转到 /login。
    if (typeof document !== 'undefined' && document.readyState === 'complete' &&
        document.body?.innerText.includes('扫码登录') && document.body.innerText.includes('密码登录')) {
      return 'AUTH_EXPIRED';
    }
    return false;
  }
  let require;
  // Webpack 不会再次执行已加载 chunk 的回调；每次探测须使用新的标识。
  chunks.push([['pugying_article_api_' + crypto.randomUUID()], {}, (runtime) => { require = runtime; }]);
  if (!require?.m) { return false; }
  // 上传 SDK 位于当前编辑器的按需 chunk，由平台自己的加载器解析版本地址。
  if (!require.m[64477] && require.e) { void require.e(6285).catch(() => {}); return false; }
  if (![56211, 64477, 70858].every(id => require.m[id])) { return false; }
  const client = require(56211).A;
  const Uploader = require(64477).A;
  const getImageUrl = require(70858).sW;
  if (!client?.get || !client?.post || !Uploader || !getImageUrl) { return false; }
  window.__pugyingArticleApi = {
    async request(path, data) {
      const config = { retries: 0, noToast: true, noErrorHandling: true, timeout: 45000 };
      if (data === undefined) { return client.get(path, config); }
      const response = await client.post(path, data, {
        ...config, needSign: true, withSecondVerify: true, returnRaw: true,
        params: { read_aid: 2906 }, headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    },
    async upload(file) {
      const profile = await client.get('/web/api/media/user/info/', { retries: 0, noToast: true });
      const uid = profile?.user?.uid || profile?.uid;
      if (!uid) { throw { code: 'AUTH_EXPIRED' }; }
      const uploader = new Uploader({ type: 'image' }, {}, uid);
      const result = await uploader.uploadFile(file);
      return { uri: result.uri, url: await getImageUrl(result.uri), width: result.imageWidth,
        height: result.imageHeight, size: file.size / 1024 };
    },
    async uploadVideo(file) {
      const profile = await client.get('/web/api/media/user/info/', { retries: 0, noToast: true });
      const uid = profile?.user?.uid || profile?.uid;
      if (!uid) { throw { code: 'AUTH_EXPIRED' }; }
      const uploader = new Uploader({ type: 'video' }, {}, uid);
      window.__pugyingVideoProgress = 0;
      try {
        const result = await uploader.uploadFile(file, percent => {
          window.__pugyingVideoProgress = Math.min(100, Math.max(0, Number(percent) || 0));
        });
        if (!result?.vid) { throw { code: 'ARTICLE_API_CHANGED' }; }
        window.__pugyingVideoProgress = 100;
        if (result.shouldConvert || !(result.duration > 0 && result.width > 0 && result.height > 0 && result.coverUri)) {
          // 当前 SDK 返回的视频须先启用，平台才会生成转码信息和首帧封面。
          const enabled = await client.get('/web/api/media/video/enable/', {
            params: { video_id: result.vid }, retries: 0, noToast: true, timeout: 45000
          });
          if (enabled.status_code !== 0) { throw enabled; }
          const deadline = Date.now() + 900000;
          while (Date.now() < deadline) {
            const meta = await client.get('/web/api/media/video/transend/', {
              params: { video_id: result.vid }, retries: 0, noToast: true, timeout: 45000
            });
            if (meta.status_code !== 0) { throw meta; }
            if (meta.encode === 1 && meta.duration > 0 && meta.width > 0 && meta.height > 0 && meta.poster_uri) {
              return { vid: result.vid, duration: Number(meta.duration), width: Number(meta.width),
                height: Number(meta.height), coverUri: meta.poster_uri };
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          throw { code: 'VIDEO_PROCESSING_TIMEOUT' };
        }
        return { vid: result.vid, duration: result.duration, width: result.width,
          height: result.height, coverUri: result.coverUri };
      } finally { uploader.cancel(); }
    }
  };
  return true;
})()`;

export const TOUTIAO_ARTICLE_RUNTIME = `(() => {
  if (location.hostname !== 'mp.toutiao.com' || !window.Garr?.network?.post ||
      !window.Garr?.network?.get || !window.byted_acrawler) { return false; }
  window.byted_acrawler.init({ aid: 1231, dfp: true, intercept: true,
    enablePathList: ['/mp/agw/article/publish'], urlRewriteRules: [] });
  window.__pugyingArticleApi = {
    async request(path, data) {
      let result;
      if (data === undefined) {
        result = await window.Garr.network.get(path);
      } else {
        // 当前编辑器发布通过签名 SDK 拦截的 fetch 提交 URL 编码表单。
        const body = Object.entries(data).filter(([, value]) => value !== undefined)
          .map(([key, value]) => key + '=' + encodeURIComponent(value)).join('&');
        const response = await fetch(path, { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body });
        if (!response.ok) { throw { code: response.status === 401 ? 'AUTH_EXPIRED' : 'HTTP_REQUEST_FAILED' }; }
        result = JSON.parse(await response.text(), (key, value, context) =>
          typeof value === 'number' && !Number.isSafeInteger(value) && context?.source ? context.source : value);
      }
      if (path.startsWith('/mp/agw/article/new?')) {
        return { ...result, __pugyingRewardRemaining: window.Garr.pgc_info?.creator_project_info?.praise_count_remained };
      }
      return result;
    },
    async upload(file) {
      const data = new FormData();
      data.append('image', file);
      const response = await window.Garr.network.post('/spice/image?upload_source=20020003&aid=1231&device_platform=web', data,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      if (response.code !== 0) { throw response; }
      const image = response.data;
      return { uri: image.origin_image_uri, url: image.origin_image_url,
        width: image.image_width, height: image.image_height, size: file.size / 1024 };
    }
  };
  return true;
})()`;

// B 站新版 opus JSON 接口；WBI 在主进程生成，浏览器携带本任务 Cookie。
export const BILIBILI_ARTICLE_RUNTIME = `(() => {
  if (location.hostname !== 'member.bilibili.com') { return false; }
  let voucher;
  let verificationToken;
  window.__pugyingArticleApi = {
    wbiParams() {
      const params = {
        'x-bili-locale-json': JSON.stringify({ c_locale: { language: 'zh', script: 'Hans' }, always_translate: false }),
        'x-bili-device-req-json': JSON.stringify({ platform: 'web', device: 'pc',
          spmid: document.querySelector('meta[name="spm_prefix"]')?.content || '0.0', mobi_app: 'web_cn' })
      };
      if (window._render_data_?.access_id) { params.w_webid = window._render_data_.access_id; }
      return params;
    },
    async request(path, data) {
      const response = await fetch('https://api.bilibili.com' + path, {
        method: data === undefined ? 'GET' : 'POST', credentials: 'include', redirect: 'error',
        headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data)
      });
      if (!response.ok) { throw { code: response.status === 401 ? 'AUTH_EXPIRED' : 'HTTP_REQUEST_FAILED' }; }
      const result = JSON.parse(await response.text(), (key, value, context) =>
        typeof value === 'number' && !Number.isSafeInteger(value) && context?.source ? context.source : value);
      voucher = result.code === -352 ? response.headers.get('x-bili-gaia-vvoucher') : undefined;
      return result;
    },
    hasVerification() { return Boolean(voucher); },
    async verify() {
      if (!voucher) { throw { code: 'PLATFORM_VERIFICATION_REQUIRED' }; }
      if (!window.CaptchaLoader) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://s1.hdslb.com/bfs/seed/jinkela/risk-captcha-sdk/CaptchaLoader.js';
          script.onload = resolve; script.onerror = reject; document.body.appendChild(script);
        });
      }
      const verify = await window.CaptchaLoader.load();
      verificationToken = await verify({ riskParams: { v_voucher: voucher },
        fromSpmid: document.querySelector('meta[name="spm_prefix"]')?.content || '0.0' });
      if (!verificationToken) { throw { code: 'PLATFORM_VERIFICATION_REQUIRED' }; }
      voucher = undefined;
    },
    async upload(file, query, csrf) {
      const form = new FormData();
      form.append('file_up', file); form.append('biz', 'new_dyn'); form.append('category', 'daily');
      form.append('csrf', csrf);
      const response = await fetch('https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs?' + query,
        { method: 'POST', credentials: 'include', redirect: 'error', body: form });
      if (!response.ok) { throw { code: 'HTTP_REQUEST_FAILED' }; }
      const result = await response.json();
      if (result.code !== 0) { throw result; }
      return { uri: result.data.image_url, url: result.data.image_url,
        width: result.data.image_width, height: result.data.image_height, size: file.size / 1024 };
    },
    async riskParams() {
      if (!window.SecureCollectSDK) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://s1.hdslb.com/bfs/seed/jinkela/short/minntaki-wasm-sdk/bili-sc-sdk.umd.js';
          script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
        });
      }
      if (!window.SecureCollectSDK?.getEnvToken) { throw { code: 'ARTICLE_API_CHANGED' }; }
      const b_wet = await window.SecureCollectSDK.getEnvToken(false);
      if (!b_wet) { throw { code: 'ARTICLE_API_CHANGED' }; }
      const params = { b_wet };
      if (verificationToken) { params.gaia_vtoken = verificationToken; }
      const loadSdk = async (src, name) => {
        if (!window[name]) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src; script.onload = resolve; script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        return window[name];
      };
      let config = window.__riskUserLogConfig__;
      if (!config) {
        try {
          const KvSDK = await loadSdk('https://s1.hdslb.com/bfs/seed/jinkela/kv-sdk/index.js', 'KvSDK');
          config = await new KvSDK({ appKey: '333.1339', apiURL: '//api.bilibili.com', strict: 1, nscode: 9 }).getGroup('user_log');
          window.__riskUserLogConfig__ = config;
        } catch { config = { payload_log: '0' }; }
      }
      if (config?.payload_log === '1') {
        if (!window.__biliUserFp__) {
          window.__USER_FP_CONFIG__ = window.__USER_FP_CONFIG__ || {};
          await loadSdk('https://s1.hdslb.com/bfs/seed/jinkela/short/user-fingerprint/bili-user-fingerprint.min.js', '__biliUserFp__');
        }
        if (!window.__biliUserFp__?.queryUserLog) { throw { code: 'ARTICLE_API_CHANGED' }; }
        const [list, str, cover, inter] = window.__biliUserFp__.queryUserLog({});
        Object.assign(params, { dm_img_list: list, dm_img_str: str, dm_cover_img_str: cover, dm_img_inter: inter });
      } else { params.dm_img_switch = '0'; }
      return params;
    }
  };
  return true;
})()`;

/** 2026-10-07 小红书当前官方图文编辑器的请求客户端与图片上传 SDK。 */
export const XIAOHONGSHU_GRAPHIC_RUNTIME = `(() => {
  if (location.hostname !== 'creator.xiaohongshu.com') { return false; }
  const chunks = window.webpackChunkugc;
  if (!chunks) { return false; }
  let require;
  chunks.push([['pugying_graphic_' + crypto.randomUUID()], {}, runtime => { require = runtime; }]);
  if (![21069, 69517].every(id => require?.m?.[id])) { return false; }
  const client = require(21069).LV;
  const uploader = require(69517).d9;
  if (!client?.get || !client?.post || !uploader?.post) { return false; }
  window.__pugyingArticleApi = {
    async request(path, data) {
      const config = { transform: false, extractData: false, timeout: 45000, withCredentials: true };
      const url = 'https://edith.xiaohongshu.com' + path;
      try {
        if (data === undefined) { return await client.get(url, config); }
        return await client.post(url, data, config);
      } catch (error) {
        // 官方客户端将明确的业务拒绝转换为异常，保留业务码与文案用于区分未知结果。
        if (error?.name === 'HTTPBizError' && typeof error.data?.code === 'number') {
          return {
            code: error.data.code,
            success: false,
            msg: typeof error.data?.msg === 'string' ? error.data.msg : undefined,
            data: error.data?.data,
          };
        }
        if (error?.name === 'HTTPServerError' && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
          return {
            code: typeof error.data?.code === 'number' ? error.data.code : error.status,
            success: false,
            msg: typeof error.data?.msg === 'string' ? error.data.msg : undefined,
          };
        }
        throw error;
      }
    },
    async upload(file) {
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width, height = bitmap.height;
      bitmap.close();
      const result = await uploader.post({ Body: file });
      const image = result?.data;
      // 当前官方回执用 fileId；兼容旧字段 Key。
      const uri = image?.Key || image?.fileId;
      if (result?.success !== true || !uri) {
        throw {
          code: 'ARTICLE_API_CHANGED',
          receipt: {
            stage: 'image_upload',
            success: result?.success,
            keys: result && typeof result === 'object' ? Object.keys(result) : [],
            dataKeys: image && typeof image === 'object' ? Object.keys(image) : [],
          },
        };
      }
      // 官方上传回执中的预览地址，不从本机路径构造远程图片地址。
      const url = image.headers?.['x-ros-preview-url'] || image.previewUrl;
      return { uri, url, width, height, size: file.size / 1024 };
    }
  };
  return true;
})()`;

/** 微头条使用官方客户端的 JSON 发布方法，不复用文章的表单编码。 */
export const TOUTIAO_GRAPHIC_RUNTIME = `(() => {
  if (location.hostname !== 'mp.toutiao.com' || !window.Garr?.network?.post) { return false; }
  window.__pugyingArticleApi = {
    async request(path, data) {
      if (data === undefined) { return window.Garr.network.get(path); }
      try { return await window.Garr.network.post(path, JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        transformResponse: [text => typeof text === 'string' && text ? JSON.parse(text, (key, value, context) =>
          typeof value === 'number' && !Number.isSafeInteger(value) && context?.source ? context.source : value) : text]
      }); } catch (error) {
        const status = error?.response?.status;
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          return { code: status };
        }
        throw error;
      }
    },
    async upload(file) {
      const form = new FormData();
      form.append('image', file);
      const response = await window.Garr.network.post('/spice/image?upload_source=20020004&aid=1231&device_platform=web', form,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      if (response.code !== 0) { throw response; }
      const image = response.data;
      return { uri: image.origin_image_uri, url: image.origin_image_url,
        width: image.image_width, height: image.image_height, size: file.size / 1024 };
    }
  };
  return true;
})()`;
