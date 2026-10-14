/**
 * 小红书创作者请求 XYS_（x-s）签名。
 * 签名算法失效时抛错并停用相关能力。
 */
import { createHash, randomBytes, randomInt } from "node:crypto";

const VERSION_BYTES = [121, 104, 96, 41] as const;
const TIMESTAMP_LE_LENGTH = 8;
const MD5_XOR_LENGTH = 8;
const A1_LENGTH = 52;
const APP_ID_LENGTH = 10;
const PAYLOAD_LENGTH = 144;
const ENV_TABLE = [
  115, 248, 83, 102, 103, 201, 181, 131, 99, 94, 4, 68, 250, 132, 21,
] as const;
const ENV_CHECKS_DEFAULT = [
  0, 1, 18, 1, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0,
] as const;
const A3_PREFIX = [2, 97, 51, 16] as const;
const HASH_IV = [1831565813, 461845907, 2246822507, 3266489909] as const;
const HEX_KEY = Buffer.from(
  "71a302257793271ddd273bcee3e4b98d9d7935e1da33f5765e2ea8afb6dc77a51a499d23b67c20660025860cbf13d4540d92497f58686c574e508f46e1956344f39139bf4faf22a3eef120b79258145b2feb5193b6478669961298e79bedca646e1a693a926154a5a7a1bd1cf0dedb742f917a747a1e388b234f2277516db7116035439730fa61e9822a0eca7bff72d8",
  "hex",
);
const STANDARD_B64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CUSTOM_B64 =
  "ZmserbBoHQtNP+wOcza/LpngG8yJq42KWYj0DSfdikx3VT16IlUAFM97hECvuRX5";
const X3_B64 =
  "MfgqrsbcyzPQRStuvC7mn501HIJBo2DEFTKdeNOwxWXYZap89+/A4UVLhijkl63G";
const X3_PREFIX = "mns0301_";
const XYS_PREFIX = "XYS_";
/** 外层 XYS JSON 模板 */
const SIGNATURE_TEMPLATE = {
  x0: "4.3.5",
  x1: "xhs-pc-web",
  x2: "Windows",
  x4: "object",
} as const;

const ENV_TIME_OFFSET_MIN = 10;
const ENV_TIME_OFFSET_MAX = 50;
const SEQUENCE_MIN = 15;
const SEQUENCE_MAX = 50;
const WINDOW_PROPS_MIN = 1000;
const WINDOW_PROPS_MAX = 1200;

export const XHS_DEFAULT_XSEC_APPID = "xhs-pc-web";

export class XiaohongshuXsSignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XiaohongshuXsSignError";
  }
}

export interface XiaohongshuXsSignOptions {
  /** Unix 秒；默认当前时间 */
  timestampSec?: number;
  /** 应用标识，写入载荷；默认 xhs-pc-web */
  xsecAppid?: string;
  /** 测试用：固定随机源 */
  random?: XiaohongshuXsRandomSource;
}

export interface XiaohongshuXsRandomSource {
  randomInt32(): number;
  randomInRange(min: number, max: number): number;
}

export interface XiaohongshuSignedHeaders {
  "x-s": string;
  "x-t": string;
}

const defaultRandom: XiaohongshuXsRandomSource = {
  randomInt32() {
    return randomBytes(4).readUInt32LE(0);
  },
  randomInRange(min, max) {
    return randomInt(min, max + 1);
  },
};

function md5Hex(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}

function intToLeBytes(value: number, length: number): number[] {
  // 时间戳为 8 字节 LE，不可对整值 >>> 0（会截断到 32 位）
  const out: number[] = [];
  let val = BigInt(Math.floor(value));
  for (let i = 0; i < length; i += 1) {
    out.push(Number(val & 0xffn));
    val >>= 8n;
  }
  return out;
}

function rotateLeft(val: number, n: number): number {
  const v = val >>> 0;
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

/** a3 字段自定义哈希（8 字节对齐输入 → 16 字节） */
function customHashV2(input: number[]): number[] {
  // 显式 number：避免 as const 字面量元组在 >>> / 赋值时被收窄成不可变字面量类型
  let s0: number = HASH_IV[0];
  let s1: number = HASH_IV[1];
  let s2: number = HASH_IV[2];
  let s3: number = HASH_IV[3];
  const length = input.length;
  s0 = (s0 ^ length) >>> 0;
  s1 = (s1 ^ (length << 8)) >>> 0;
  s2 = (s2 ^ (length << 16)) >>> 0;
  s3 = (s3 ^ (length << 24)) >>> 0;
  const buf = Buffer.from(input);
  for (let i = 0; i < Math.floor(length / 8); i += 1) {
    const v0 = buf.readUInt32LE(i * 8);
    const v1 = buf.readUInt32LE(i * 8 + 4);
    s0 = rotateLeft((((s0 + v0) >>> 0) ^ s2) >>> 0, 7);
    s1 = rotateLeft(((v0 ^ s1) + s3) >>> 0, 11);
    s2 = rotateLeft((((s2 + v1) >>> 0) ^ s0) >>> 0, 13);
    s3 = rotateLeft(((s3 ^ v1) + s1) >>> 0, 17);
  }
  const t0 = (s0 ^ length) >>> 0;
  const t1 = (s1 ^ t0) >>> 0;
  const t2 = (s2 + t1) >>> 0;
  const t3 = (s3 ^ t2) >>> 0;
  const rot0 = rotateLeft(t0, 9);
  const rot1 = rotateLeft(t1, 13);
  const rot2 = rotateLeft(t2, 17);
  const rot3 = rotateLeft(t3, 19);
  s0 = (rot0 + rot2) >>> 0;
  s1 = (rot1 ^ rot3) >>> 0;
  s2 = (rot2 + s0) >>> 0;
  s3 = (rot3 ^ s1) >>> 0;
  return [
    ...intToLeBytes(s0, 4),
    ...intToLeBytes(s1, 4),
    ...intToLeBytes(s2, 4),
    ...intToLeBytes(s3, 4),
  ];
}

function buildPayloadArray(
  dValue: string,
  mValue: string,
  a1: string,
  appId: string,
  content: string,
  timestampSec: number,
  random: XiaohongshuXsRandomSource,
): number[] {
  const seed = random.randomInt32() >>> 0;
  const seedByte = seed & 0xff;
  const payload: number[] = [...VERSION_BYTES];
  payload.push(...intToLeBytes(seed, 4));
  const tsBytes = intToLeBytes(
    Math.floor(timestampSec * 1000),
    TIMESTAMP_LE_LENGTH,
  );
  payload.push(...tsBytes);

  const timeOffset = random.randomInRange(
    ENV_TIME_OFFSET_MIN,
    ENV_TIME_OFFSET_MAX,
  );
  payload.push(
    ...intToLeBytes(
      Math.floor((timestampSec - timeOffset) * 1000),
      TIMESTAMP_LE_LENGTH,
    ),
  );
  payload.push(
    ...intToLeBytes(random.randomInRange(SEQUENCE_MIN, SEQUENCE_MAX), 4),
  );
  payload.push(
    ...intToLeBytes(
      random.randomInRange(WINDOW_PROPS_MIN, WINDOW_PROPS_MAX),
      4,
    ),
  );
  payload.push(...intToLeBytes(Buffer.byteLength(content, "utf8"), 4));

  const md5Bytes = Buffer.from(dValue, "hex");
  for (let i = 0; i < MD5_XOR_LENGTH; i += 1) {
    payload.push(md5Bytes[i]! ^ seedByte);
  }

  const a1Bytes = Buffer.alloc(A1_LENGTH);
  Buffer.from(a1, "utf8").copy(a1Bytes, 0, 0, A1_LENGTH);
  payload.push(A1_LENGTH);
  payload.push(...a1Bytes);

  const appBytes = Buffer.alloc(APP_ID_LENGTH);
  Buffer.from(appId, "utf8").copy(appBytes, 0, 0, APP_ID_LENGTH);
  payload.push(APP_ID_LENGTH);
  payload.push(...appBytes);

  payload.push(1, seedByte ^ ENV_TABLE[0]!);
  for (let i = 1; i < 15; i += 1) {
    payload.push(ENV_TABLE[i]! ^ ENV_CHECKS_DEFAULT[i]!);
  }

  const md5PathBytes: number[] = [];
  for (let i = 0; i < 32; i += 2) {
    md5PathBytes.push(Number.parseInt(mValue.slice(i, i + 2), 16));
  }
  const hashed = customHashV2([...tsBytes, ...md5PathBytes]);
  payload.push(...A3_PREFIX);
  for (const b of hashed) {
    payload.push(b ^ seedByte);
  }
  return payload;
}

function xorTransform(source: number[]): Buffer {
  const out = Buffer.alloc(source.length);
  for (let i = 0; i < source.length; i += 1) {
    out[i] =
      i < HEX_KEY.length
        ? (source[i]! ^ HEX_KEY[i]!) & 0xff
        : source[i]! & 0xff;
  }
  return out;
}

function translateAlphabet(input: string, from: string, to: string): string {
  let out = "";
  for (const ch of input) {
    const idx = from.indexOf(ch);
    out += idx >= 0 ? to[idx]! : ch;
  }
  return out;
}

function encodeCustomBase64(data: Buffer | string): string {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return translateAlphabet(bytes.toString("base64"), STANDARD_B64, CUSTOM_B64);
}

function encodeX3(data: Buffer): string {
  return translateAlphabet(data.toString("base64"), STANDARD_B64, X3_B64);
}

function extractUri(uriOrUrl: string): string {
  const trimmed = uriOrUrl.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed.split("?")[0] ?? trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname;
  } catch {
    throw new XiaohongshuXsSignError("签名路径无效");
  }
}

function buildPostContent(
  uri: string,
  payload: Record<string, unknown>,
): string {
  return uri + JSON.stringify(payload);
}

/**
 * GET 签名内容串：path 或 path?k=v&…。
 * 值使用 encodeURIComponent，逗号保留。
 */
function buildGetContent(
  uri: string,
  params: Record<string, string | number | boolean> = {},
): string {
  const keys = Object.keys(params);
  if (keys.length === 0) {
    return uri;
  }
  const parts: string[] = [];
  for (const key of keys) {
    const raw = params[key];
    const value =
      raw === undefined || raw === null
        ? ""
        : typeof raw === "boolean"
          ? raw
            ? "true"
            : "false"
          : String(raw);
    parts.push(
      `${key}=${encodeURIComponent(value).replace(/%2C/gi, ",")}`,
    );
  }
  return `${uri}?${parts.join("&")}`;
}

function buildXsSignature(
  content: string,
  uriForM: string,
  a1: string,
  options: XiaohongshuXsSignOptions,
  /** GET 时 m 与 d 相同；POST 时 m=md5(path) */
  mEqualsD: boolean,
): string {
  if (!a1 || a1.length < 8) {
    throw new XiaohongshuXsSignError("缺少登录凭证，请重新授权");
  }
  const dValue = md5Hex(content);
  const mValue = mEqualsD ? dValue : md5Hex(uriForM);
  const timestampSec = options.timestampSec ?? Date.now() / 1000;
  const appId = options.xsecAppid?.trim() || XHS_DEFAULT_XSEC_APPID;
  const random = options.random ?? defaultRandom;
  const array = buildPayloadArray(
    dValue,
    mValue,
    a1,
    appId,
    content,
    timestampSec,
    random,
  );
  if (array.length < PAYLOAD_LENGTH) {
    throw new XiaohongshuXsSignError("签名载荷异常");
  }
  const xored = xorTransform(array);
  const x3 = X3_PREFIX + encodeX3(xored.subarray(0, PAYLOAD_LENGTH));
  const signatureData = {
    x0: SIGNATURE_TEMPLATE.x0,
    x1: SIGNATURE_TEMPLATE.x1,
    x2: SIGNATURE_TEMPLATE.x2,
    x3,
    x4: SIGNATURE_TEMPLATE.x4,
  };
  return (
    XYS_PREFIX +
    encodeCustomBase64(JSON.stringify(signatureData))
  );
}

/**
 * 生成 POST 请求的 XYS_ 签名串（x-s）。
 * payload 须与实际请求体 JSON 序列化一致（无空格、ensure_ascii 等价）。
 */
export function signXiaohongshuXsPost(
  uriOrUrl: string,
  a1: string,
  payload: Record<string, unknown>,
  options: XiaohongshuXsSignOptions = {},
): string {
  const uri = extractUri(uriOrUrl);
  const content = buildPostContent(uri, payload);
  return buildXsSignature(content, uri, a1, options, false);
}

/**
 * 生成 GET 请求的 XYS_ 签名串。
 * params 须已是线上 snake_case，且与 URL query 完全一致（含布尔 false→"false"）。
 */
export function signXiaohongshuXsGet(
  uriOrUrl: string,
  a1: string,
  params: Record<string, string | number | boolean> = {},
  options: XiaohongshuXsSignOptions = {},
): string {
  const uri = extractUri(uriOrUrl);
  const content = buildGetContent(uri, params);
  return buildXsSignature(content, uri, a1, options, true);
}

export function xiaohongshuXt(timestampSec?: number): string {
  const sec = timestampSec ?? Date.now() / 1000;
  return String(Math.floor(sec * 1000));
}

/** 发帖所需的 x-s / x-t。 */
export function signXiaohongshuPostHeaders(
  uriOrUrl: string,
  a1: string,
  payload: Record<string, unknown>,
  options: XiaohongshuXsSignOptions = {},
): XiaohongshuSignedHeaders {
  const timestampSec = options.timestampSec ?? Date.now() / 1000;
  return {
    "x-s": signXiaohongshuXsPost(uriOrUrl, a1, payload, {
      ...options,
      timestampSec,
    }),
    "x-t": xiaohongshuXt(timestampSec),
  };
}

/** GET（如 query_transcode / videoid）所需的 x-s / x-t。 */
export function signXiaohongshuGetHeaders(
  uriOrUrl: string,
  a1: string,
  params: Record<string, string | number | boolean> = {},
  options: XiaohongshuXsSignOptions = {},
): XiaohongshuSignedHeaders {
  const timestampSec = options.timestampSec ?? Date.now() / 1000;
  return {
    "x-s": signXiaohongshuXsGet(uriOrUrl, a1, params, {
      ...options,
      timestampSec,
    }),
    "x-t": xiaohongshuXt(timestampSec),
  };
}

/** @internal 测试用：导出 MD5 / 内容串 */
export function __testBuildPostContent(
  uri: string,
  payload: Record<string, unknown>,
): { content: string; d: string; m: string } {
  const path = extractUri(uri);
  const content = buildPostContent(path, payload);
  return { content, d: md5Hex(content), m: md5Hex(path) };
}

/** @internal 测试用：GET 内容串 */
export function __testBuildGetContent(
  uri: string,
  params: Record<string, string | number | boolean>,
): { content: string; d: string } {
  const path = extractUri(uri);
  const content = buildGetContent(path, params);
  return { content, d: md5Hex(content) };
}
