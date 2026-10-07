import { net, protocol, type Session } from 'electron';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SCHEME = 'pugying-publish-media';
const ORIGIN = 'https://creator.douyin.com';

export type PublishMediaOrigin =
  | typeof ORIGIN
  | 'https://mp.toutiao.com'
  | 'https://member.bilibili.com'
  | 'https://creator.xiaohongshu.com'
  | 'https://channels.weixin.qq.com';

export function registerPublishMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export interface PublishMediaChannel {
  expose(path: string): string;
  revoke(): void;
  dispose(): void;
}

/** 须在创建 BrowserWindow 前注册，Chromium 的文件请求工厂才能识别此协议。 */
export function createPublishMediaChannel(
  isolated: Session,
  origin: PublishMediaOrigin = ORIGIN,
): PublishMediaChannel {
  let file: { url: string; path: string } | undefined;
  isolated.protocol.handle(SCHEME, async (request) => {
    if (
      !file ||
      request.url !== file.url ||
      request.method !== 'GET' ||
      !('initiatorOrigin' in request) ||
      request.initiatorOrigin !== origin
    ) {
      return new Response(null, { status: 403 });
    }
    try {
      const response = await net.fetch(pathToFileURL(file.path).href);
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return new Response(null, {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': origin },
      });
    }
  });
  return {
    expose(path) {
      file = { url: `${SCHEME}://video/${randomUUID()}`, path };
      return file.url;
    },
    revoke() {
      file = undefined;
    },
    dispose() {
      file = undefined;
      isolated.protocol.unhandle(SCHEME);
    },
  };
}
