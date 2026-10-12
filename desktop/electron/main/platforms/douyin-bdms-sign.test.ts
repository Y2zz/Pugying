import {
  douyinBdmsScriptDigest,
  resetDouyinBdmsSignCache,
  signDouyinCreatorUrl,
} from "./douyin-bdms-sign";

/** 极简官方拦截器替身：把 a_bogus 挂到 URL，供主进程签名契约测试。 */
const FAKE_BDMS = `
window.bdms = {
  init: function () {
    var original = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : String(input);
      if (url.indexOf('a_bogus=') === -1) {
        url += (url.indexOf('?') >= 0 ? '&' : '?') + 'a_bogus=test_bogus_token';
      }
      return original.call(this, url, init);
    };
  },
  getReferer: function () { return location.href; }
};
`;

beforeEach(() => {
  resetDouyinBdmsSignCache();
});

it("signs creator URLs with a_bogus using the official interceptor contract", async () => {
  const signed = await signDouyinCreatorUrl(
    "/aweme/v1/life/video_api/search/poi/?keyword=x&count=20&aid=1128",
    { script: FAKE_BDMS },
  );
  expect(signed).toContain("a_bogus=test_bogus_token");
  expect(signed.startsWith("https://creator.douyin.com/")).toBe(true);
});

it("leaves already signed URLs unchanged", async () => {
  const input =
    "https://creator.douyin.com/web/api/media/user/info/?a_bogus=keep";
  await expect(
    signDouyinCreatorUrl(input, { script: FAKE_BDMS }),
  ).resolves.toBe(input);
});

it("digests script content without exposing the body", () => {
  expect(douyinBdmsScriptDigest("hello")).toHaveLength(16);
  expect(douyinBdmsScriptDigest("hello")).not.toContain("hello");
});
