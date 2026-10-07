import { open, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  findMoovAtomOffset,
  mergeMp4Meta,
  readMp4Meta,
} from './channels-graphic-client';

const PROBE = '/tmp/pugying-channels-video-probe.mp4';

describe('channels mp4 meta', () => {
  it('reads duration from moov-at-end probe without fake 1s default', async () => {
    const info = await stat(PROBE);
    const handle = await open(PROBE, 'r');
    try {
      const headLen = Math.min(info.size, 8 * 1024 * 1024);
      const headBuf = Buffer.alloc(headLen);
      await handle.read(headBuf, 0, headLen, 0);
      const tailLen = Math.min(info.size, 4 * 1024 * 1024);
      const tailBuf = Buffer.alloc(tailLen);
      await handle.read(tailBuf, 0, tailLen, info.size - tailLen);
      const moovAt = findMoovAtomOffset(tailBuf);
      expect(moovAt).toBeGreaterThanOrEqual(0);
      const meta = mergeMp4Meta([
        readMp4Meta(headBuf),
        readMp4Meta(tailBuf.subarray(moovAt)),
      ]);
      // 此前假拼接默认成 1280x720 / 1s；真实 moov 为 1920x1080、约 14s
      expect(meta.width).toBe(1920);
      expect(meta.height).toBe(1080);
      expect(meta.duration).toBeGreaterThan(10);
      expect(meta.duration).toBeLessThan(20);
    } finally {
      await handle.close();
    }
  });
});
