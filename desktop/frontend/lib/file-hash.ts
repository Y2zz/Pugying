/** 计算本地文件 SHA-256（小写 hex），用于上传前去重 */

export async function sha256File(
  file: Blob,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  onProgress?.(0);
  const buffer = await file.arrayBuffer();
  onProgress?.(0.6);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  onProgress?.(1);
  return bufferToHex(digest);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
