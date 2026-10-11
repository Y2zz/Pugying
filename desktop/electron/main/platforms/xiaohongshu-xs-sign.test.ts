import {
  __testBuildGetContent,
  __testBuildPostContent,
  signXiaohongshuGetHeaders,
  signXiaohongshuPostHeaders,
  signXiaohongshuXsGet,
  signXiaohongshuXsPost,
  xiaohongshuXt,
  type XiaohongshuXsRandomSource,
} from "./xiaohongshu-xs-sign";

/** 与 Python xhshow Fixed 随机源对齐：int32=0x12345678，区间取 min */
const fixedRandom: XiaohongshuXsRandomSource = {
  randomInt32: () => 0x12345678,
  randomInRange: (min) => min,
};

const URI = "/web_api/sns/v2/note";
const A1 = "1a0f9f0d012345678901234567890123456789012345678901";
const PAYLOAD = {
  common: { type: "normal" },
  image_info: { images: [] as unknown[] },
  video_info: null,
};
const TS = 1760000000;

it("builds the same content/MD5 as xhshow for POST note", () => {
  const built = __testBuildPostContent(URI, PAYLOAD);
  expect(built.content).toBe(
    '/web_api/sns/v2/note{"common":{"type":"normal"},"image_info":{"images":[]},"video_info":null}',
  );
  expect(built.d).toBe("886c4ada4e43c0cd345a81269e975dd3");
  expect(built.m).toBe("12f5434119fb0280ea9b079fe542f75e");
});

it("matches the xhshow golden XYS_ vector with fixed seed", () => {
  const xs = signXiaohongshuXsPost(URI, A1, PAYLOAD, {
    timestampSec: TS,
    random: fixedRandom,
  });
  expect(xs).toBe(
    "XYS_2UQhPsHCH0c1PUhMHjIj2erjwjQhyoPTqBPT49pjHjIj2eHjwjQgynEDJ74AHjIj2ePjwjQTJdPIPAZlg94aGLTl/L4Aq0SoPfD3J9Qrqemk8emPpBH7/dbawepnJ04x2bSpyFLUy0p0+FDF8r+Oz0q3qLYr4pSOLgS8+nptySihJLr3aerI+/8QLpqEppYpa0QaLBzd2Bbx/FPIcSpVqD+Lad+y2/ZFaezna9zL/empPLka8pD9PFTPznbScSz+c9EIqMQCLDkcpnbLP9IUJDT/Jfznnfl0yLLIaSQQyAmOarEaLSz+qFYspD8FwpzrNFzh/npsPsT/8BYAaUHVHdWFH0ijJ9Qx8n+FHdF=",
  );
  expect(xiaohongshuXt(TS)).toBe("1760000000000");
});

it("returns x-s and x-t headers together", () => {
  const headers = signXiaohongshuPostHeaders(URI, A1, PAYLOAD, {
    timestampSec: TS,
    random: fixedRandom,
  });
  expect(headers["x-s"].startsWith("XYS_")).toBe(true);
  expect(headers["x-t"]).toBe("1760000000000");
});

it("builds GET content with snake_case query and false as lowercase", () => {
  const built = __testBuildGetContent(
    "/web_api/sns/capa/postgw/query_transcode",
    {
      video_id: "138144985481771762",
      need_transcode: false,
      resource_type: 0,
    },
  );
  expect(built.content).toBe(
    "/web_api/sns/capa/postgw/query_transcode?video_id=138144985481771762&need_transcode=false&resource_type=0",
  );
  const headers = signXiaohongshuGetHeaders(
    "/web_api/sns/capa/postgw/query_transcode",
    A1,
    {
      video_id: "138144985481771762",
      need_transcode: false,
      resource_type: 0,
    },
    { timestampSec: TS, random: fixedRandom },
  );
  expect(signXiaohongshuXsGet).toBeTypeOf("function");
  expect(headers["x-s"].startsWith("XYS_")).toBe(true);
  expect(headers["x-t"]).toBe("1760000000000");
});
