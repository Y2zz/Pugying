import { describe, expect, it } from 'vitest';
import {
  findMoovAtomOffset,
  mergeMp4Meta,
  readMp4Meta,
} from './channels-graphic-client';

/** 合成 ISO BMFF 盒：size(4) + type(4) + body */
function box(type: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, body]);
}

/**
 * 构造 moov 在文件尾的最小 MP4：头段只有 ftyp+mdat，尾段从 mdat 中部切开会找不到对齐盒，
 * 须靠 findMoovAtomOffset 才能读到时长/尺寸（对齐真实探测文件的失败模式）。
 */
function buildMoovAtEndMp4(options: {
  width: number;
  height: number;
  durationSec: number;
  timescale: number;
  mdatPayload: number;
}): Buffer {
  const timescale = options.timescale;
  const durationRaw = Math.round(options.durationSec * timescale);

  // mvhd v0：timescale@12、duration@16
  const mvhdBody = Buffer.alloc(100);
  mvhdBody[0] = 0;
  mvhdBody.writeUInt32BE(timescale, 12);
  mvhdBody.writeUInt32BE(durationRaw, 16);

  // tkhd v0：宽高为 16.16 定点数，落在 @76 / @80
  const tkhdBody = Buffer.alloc(84);
  tkhdBody[0] = 0;
  tkhdBody.writeUInt32BE(options.width << 16, 76);
  tkhdBody.writeUInt32BE(options.height << 16, 80);

  // 音频轨宽高为 0，合并时须忽略
  const audioTkhd = Buffer.alloc(84);
  audioTkhd[0] = 0;

  const moov = box(
    'moov',
    Buffer.concat([
      box('mvhd', mvhdBody),
      box('trak', box('tkhd', tkhdBody)),
      box('trak', box('tkhd', audioTkhd)),
    ]),
  );
  const ftyp = box('ftyp', Buffer.from('isomisom'));
  const mdat = box('mdat', Buffer.alloc(options.mdatPayload, 0xab));
  return Buffer.concat([ftyp, mdat, moov]);
}

describe('channels mp4 meta', () => {
  it('finds moov in an unaligned tail and merges duration/size without fake 1s default', () => {
    const file = buildMoovAtEndMp4({
      width: 1920,
      height: 1080,
      durationSec: 14.211,
      timescale: 1000,
      mdatPayload: 64 * 1024,
    });
    // 模拟 uploadVideo：头 8KB + 尾 32KB（尾从 mdat 中部起，非盒对齐）
    const headBuf = file.subarray(0, Math.min(8 * 1024, file.length));
    const tailLen = Math.min(32 * 1024, file.length);
    const tailBuf = file.subarray(file.length - tailLen);

    // 头段扫不到 moov；假拼接也会因截断 mdat 停住
    expect(readMp4Meta(headBuf).duration).toBe(0);
    expect(readMp4Meta(Buffer.concat([headBuf, tailBuf])).duration).toBe(0);

    const moovAt = findMoovAtomOffset(tailBuf);
    expect(moovAt).toBeGreaterThanOrEqual(0);
    const meta = mergeMp4Meta([
      readMp4Meta(headBuf),
      readMp4Meta(tailBuf.subarray(moovAt)),
    ]);
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1080);
    expect(meta.duration).toBeCloseTo(14.211, 3);
  });
});
