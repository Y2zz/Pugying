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
