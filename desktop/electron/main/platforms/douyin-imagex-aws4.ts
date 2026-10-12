/**
 * 抖音创作者 STS 的 AWS4-HMAC-SHA256 签名。
 * ImageX（图）与 VOD（视频）共用 Region=cn-north-1；Service 分别为 imagex / vod。
 * 密钥来自 auth/v5；query 键按 ASCII 升序，与官方 Uploader 一致。
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

const REGION = "cn-north-1";

export type DouyinBytedanceAws4Service = "imagex" | "vod";

export interface DouyinImagexSts {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

export function randomImagexSalt(length = 11): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  service: DouyinBytedanceAws4Service,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/**
 * 拼 Apply/Commit query：键按 ASCII 升序（SigV4 canonical query），
 * 服务端验签会重排，签名与 URL 必须用同一排序结果。
 */
export function buildImagexQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export const buildBytedanceAws4Query = buildImagexQuery;

/**
 * 为 ImageX/VOD GET（空 body）生成 Authorization。
 * SignedHeaders 固定为 x-amz-date;x-amz-security-token。
 */
export function signBytedanceGetAuthorization(
  sts: DouyinImagexSts,
  canonicalQuery: string,
  service: DouyinBytedanceAws4Service,
  now = new Date(),
): { authorization: string; amzDate: string; dateStamp: string } {
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders =
    `x-amz-date:${amzDate}\n` +
    `x-amz-security-token:${sts.sessionToken}\n`;
  const signedHeaders = "x-amz-date;x-amz-security-token";
  const payloadHash = sha256Hex("");
  const canonicalRequest = [
    "GET",
    "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${REGION}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    signingKey(sts.secretAccessKey, dateStamp, service),
    stringToSign,
  ).toString("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${sts.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, amzDate, dateStamp };
}

/**
 * CommitImageUpload / CommitUploadInner 等 POST JSON 的 AWS4 签名。
 */
export function signBytedancePostAuthorization(
  sts: DouyinImagexSts,
  canonicalQuery: string,
  body: string,
  service: DouyinBytedanceAws4Service,
  now = new Date(),
): { authorization: string; amzDate: string } {
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalHeaders =
    `x-amz-date:${amzDate}\n` +
    `x-amz-security-token:${sts.sessionToken}\n`;
  const signedHeaders = "x-amz-date;x-amz-security-token";
  const canonicalRequest = [
    "POST",
    "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${REGION}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    signingKey(sts.secretAccessKey, dateStamp, service),
    stringToSign,
  ).toString("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${sts.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, amzDate };
}

export function signImagexGetAuthorization(
  sts: DouyinImagexSts,
  canonicalQuery: string,
  now = new Date(),
): { authorization: string; amzDate: string; dateStamp: string } {
  return signBytedanceGetAuthorization(sts, canonicalQuery, "imagex", now);
}

export function signImagexPostAuthorization(
  sts: DouyinImagexSts,
  canonicalQuery: string,
  body: string,
  now = new Date(),
): { authorization: string; amzDate: string } {
  return signBytedancePostAuthorization(
    sts,
    canonicalQuery,
    body,
    "imagex",
    now,
  );
}

export function signVodGetAuthorization(
  sts: DouyinImagexSts,
  canonicalQuery: string,
  now = new Date(),
): { authorization: string; amzDate: string; dateStamp: string } {
  return signBytedanceGetAuthorization(sts, canonicalQuery, "vod", now);
}

export function signVodPostAuthorization(
  sts: DouyinImagexSts,
  canonicalQuery: string,
  body: string,
  now = new Date(),
): { authorization: string; amzDate: string } {
  return signBytedancePostAuthorization(sts, canonicalQuery, body, "vod", now);
}
