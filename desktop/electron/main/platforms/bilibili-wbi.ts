import { createHash } from 'node:crypto';

const ORDER = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

/** 与当前 B 站编辑器 WBI 算法一致；密钥从本账号 nav 响应获取。 */
export function signBilibiliQuery(
  params: Record<string, unknown>,
  imageKey: string,
  subKey: string,
  now = Date.now(),
): string {
  const keys = imageKey + subKey;
  const secret = ORDER.map((index) => keys[index] || '')
    .join('')
    .slice(0, 32);
  const values = { ...params, wts: Math.round(now / 1000) } as Record<
    string,
    unknown
  >;
  const query = Object.keys(values)
    .sort()
    .filter((key) => values[key] !== undefined && values[key] !== null)
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(values[key]).replace(/[!'()*]/g, ''))}`,
    )
    .join('&');
  const signature = createHash('md5')
    .update(query + secret)
    .digest('hex');
  return `${query}&w_rid=${signature}`;
}
