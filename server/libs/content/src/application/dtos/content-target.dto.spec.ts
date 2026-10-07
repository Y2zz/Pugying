import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TargetOverridesDto } from './content-target.dto';
import { AUTHOR_DECLARATIONS } from '../../domain/author-declaration';

describe('图文自主声明', () => {
  it.each(AUTHOR_DECLARATIONS)('accepts %s', async (authorDeclaration) => {
    const dto = Object.assign(new TargetOverridesDto(), { authorDeclaration, allowDownload: false });
    expect(await validate(dto)).toEqual([]);
  });
  it('rejects unsupported values', async () => {
    const dto = Object.assign(new TargetOverridesDto(), { authorDeclaration: 'unknown' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'authorDeclaration')).toBe(true);
  });
});

describe('文章账号设置校验', () => {
  it('validates nested settings and allows explicit false values', async () => {
    const dto = plainToInstance(TargetOverridesDto, {
      articleSettings: {
        summary: '😀'.repeat(30),
        comments: 'closed',
        original: false,
        customCover: false,
        coverMode: 'none',
        allowReward: false,
        declarations: ['ai', 'opinion'],
      },
    });
    expect(await validate(dto)).toEqual([]);
  });
  it.each([
    { summary: '字'.repeat(31) },
    { comments: 'invalid' },
    { coverMode: 'invalid' },
    { customCover: 'false' },
    { original: 'false' },
    { declarations: ['invalid'] },
    { declarations: ['ai', 'ai'] },
  ])('rejects invalid settings %j', async (articleSettings) => {
    const dto = plainToInstance(TargetOverridesDto, { articleSettings });
    expect((await validate(dto)).some((error) => error.property === 'articleSettings')).toBe(true);
  });
});

describe('平台话题资源', () => {
  it('accepts topic refs with platform ids', async () => {
    const dto = plainToInstance(TargetOverridesDto, {
      topicRefs: [{ id: '1234', name: '日常' }],
      tags: ['日常'],
    });
    expect(await validate(dto)).toEqual([]);
  });
  it.each([
    [{ id: 'abc', name: '日常' }],
    [{ id: '123', name: 'bad tag' }],
    [{ id: '123', name: '' }],
  ])('rejects invalid topic refs %j', async (topicRefs) => {
    const dto = plainToInstance(TargetOverridesDto, { topicRefs });
    expect((await validate(dto)).some((error) => error.property === 'topicRefs')).toBe(true);
  });
});

describe('Bilibili video settings', () => {
  it('accepts numeric platform configuration and source', async () => {
    const dto = plainToInstance(TargetOverridesDto, {
      bilibiliVideoSettings: { partitionId: 21, copyright: 2, source: 'original source', creationStatementId: 123 },
    });
    expect(await validate(dto)).toEqual([]);
  });
  it.each([
    { partitionId: '21', copyright: 1 },
    { partitionId: -1, copyright: 1 },
    { partitionId: 21, copyright: 3 },
    { partitionId: 21, copyright: 1, creationStatementId: -1 },
    { partitionId: 21, copyright: 2, source: 123 },
  ])('rejects invalid video settings %j', async (bilibiliVideoSettings) => {
    const dto = plainToInstance(TargetOverridesDto, { bilibiliVideoSettings });
    expect((await validate(dto)).some((error) => error.property === 'bilibiliVideoSettings')).toBe(true);
  });
});
