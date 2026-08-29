import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { CurrentTeam } from '@pugying/core';
import { MediaAsset } from '@pugying/content/domain/entities/media-asset.entity';
import type { IMediaAssetRepository } from '@pugying/content/domain/repositories/media-asset.repository';
import type { IMediaStorage } from '@pugying/content/domain/repositories/media-storage';
import { LocalMediaStorage } from '@pugying/content/infrastructure/local/local-media-storage';
import { MediaService } from './media.service';

class FakeCurrentTeam {
  id: string | null = 'team-a';

  get isAvailable(): boolean {
    return this.id !== null;
  }
}

class FakeAssets implements IMediaAssetRepository {
  items = new Map<string, MediaAsset>();

  create(data: Partial<MediaAsset>): MediaAsset {
    return Object.assign(new MediaAsset(), data);
  }

  async save(asset: MediaAsset): Promise<MediaAsset> {
    if (!asset.id) {
      asset.id = `asset-${this.items.size + 1}`;
    }
    this.items.set(asset.id, asset);
    return asset;
  }

  async findById(id: string): Promise<MediaAsset | null> {
    return this.items.get(id) ?? null;
  }

  async findByIdUnscoped(id: string): Promise<MediaAsset | null> {
    return this.findById(id);
  }

  async findPagedForCurrentTeam(
    filter: {
      kinds?: MediaAsset['kind'][];
      q?: string;
      page?: number;
      pageSize?: number;
      sortBy?: 'originalName' | 'kind' | 'sizeBytes' | 'createdAt';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ): Promise<{ rows: MediaAsset[]; total: number }> {
    let rows = [...this.items.values()];
    if (filter.kinds && filter.kinds.length > 0) {
      rows = rows.filter((item) => filter.kinds!.includes(item.kind));
    }
    const q = filter.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (item) =>
          item.originalName.toLowerCase().includes(q) ||
          item.mimeType.toLowerCase().includes(q),
      );
    }
    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'desc';
    const factor = sortOrder === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortBy) {
        case 'originalName':
          return factor * a.originalName.localeCompare(b.originalName, 'zh-CN');
        case 'kind':
          return factor * a.kind.localeCompare(b.kind);
        case 'sizeBytes':
          return factor * (a.sizeBytes - b.sizeBytes);
        case 'createdAt':
        default:
          return factor * (a.createdAt.getTime() - b.createdAt.getTime());
      }
    });
    const total = rows.length;
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    return { rows: rows.slice(skip, skip + pageSize), total };
  }

  async findKindStatsForCurrentTeam(): Promise<
    Array<{ kind: MediaAsset['kind']; count: number; bytes: number }>
  > {
    const byKind = new Map<MediaAsset['kind'], { count: number; bytes: number }>();
    for (const item of this.items.values()) {
      const bucket = byKind.get(item.kind) ?? { count: 0, bytes: 0 };
      bucket.count += 1;
      bucket.bytes += item.sizeBytes;
      byKind.set(item.kind, bucket);
    }
    return [...byKind.entries()].map(([kind, stat]) => ({
      kind,
      count: stat.count,
      bytes: stat.bytes,
    }));
  }

  async findByChecksumForCurrentTeam(
    checksumSha256: string,
    kind?: MediaAsset['kind'],
  ): Promise<MediaAsset | null> {
    for (const item of this.items.values()) {
      if (item.checksumSha256 !== checksumSha256) {
        continue;
      }
      if (kind && item.kind !== kind) {
        continue;
      }
      return item;
    }
    return null;
  }

  async softRemove(asset: MediaAsset): Promise<void> {
    this.items.delete(asset.id);
  }
}

describe('MediaService signed URL', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'http://media.test:3000';
    process.env.MEDIA_SIGNING_SECRET = 'test-sign-secret';
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  function createService(
    assets: FakeAssets,
    storage: IMediaStorage = new LocalMediaStorage(),
  ): MediaService {
    return new MediaService(
      assets,
      new FakeCurrentTeam() as unknown as CurrentTeam,
      storage,
    );
  }

  it('builds a signed download URL against MEDIA_PUBLIC_BASE_URL', async () => {
    const assets = new FakeAssets();
    const asset = await assets.save(
      assets.create({
        teamId: 'team-a',
        kind: 'video',
        originalName: 'a.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 10,
        storageKey: 'video/x',
        checksumSha256: null,
      }),
    );
    const service = createService(assets);
    const signed = service.createSignedDownloadUrl(asset.id, 60);
    expect(signed.url.startsWith(
      `http://media.test:3000/media/assets/${asset.id}/download?exp=`,
    )).toBe(true);
    expect(signed.url).toContain('&sig=');
    expect(signed.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects bad signatures', async () => {
    const assets = new FakeAssets();
    const asset = await assets.save(
      assets.create({
        teamId: 'team-a',
        kind: 'cover',
        originalName: 'c.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 3,
        storageKey: 'cover/y',
        checksumSha256: null,
      }),
    );
    const service = createService(assets);
    const exp = String(Math.floor(Date.now() / 1000) + 60);
    await expect(
      service.openSignedDownload(asset.id, exp, 'deadbeef'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired signatures', async () => {
    const assets = new FakeAssets();
    const service = createService(assets);
    await expect(
      service.openSignedDownload('asset-x', '1', 'anything'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('finds duplicate by checksum within team', async () => {
    const assets = new FakeAssets();
    const checksum =
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    await assets.save(
      assets.create({
        teamId: 'team-a',
        kind: 'video',
        originalName: 'same.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 10,
        storageKey: 'video/x',
        checksumSha256: checksum,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );
    const service = createService(assets);
    const hit = await service.checkDuplicate('video', checksum);
    expect(hit.duplicate?.originalName).toBe('same.mp4');
    expect(hit.duplicate?.url).toContain('/media/assets/');

    const miss = await service.checkDuplicate(
      'video',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(miss.duplicate).toBeNull();
  });

  it('lists assets with server-side sort', async () => {
    const assets = new FakeAssets();
    await assets.save(
      assets.create({
        teamId: 'team-a',
        kind: 'video',
        originalName: 'b.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 20,
        storageKey: 'video/b',
        checksumSha256: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
      }),
    );
    await assets.save(
      assets.create({
        teamId: 'team-a',
        kind: 'cover',
        originalName: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        storageKey: 'cover/a',
        checksumSha256: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );
    const service = createService(assets);
    const byName = await service.listAssets(
      undefined,
      undefined,
      1,
      20,
      'originalName',
      'asc',
    );
    expect(byName.items.map((row) => row.originalName)).toEqual(['a.jpg', 'b.mp4']);

    await expect(
      service.listAssets(undefined, undefined, 1, 20, 'bad' as 'originalName', 'asc'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aggregates library stats by video and image', async () => {
    const assets = new FakeAssets();
    await assets.save(
      assets.create({
        teamId: 'team-a',
        kind: 'video',
        originalName: 'a.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 100,
        storageKey: 'video/a',
        checksumSha256: null,
      }),
    );
    await assets.save(
      assets.create({
        teamId: 'team-a',
        kind: 'cover',
        originalName: 'b.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 30,
        storageKey: 'cover/b',
        checksumSha256: null,
      }),
    );
    await assets.save(
      assets.create({
        teamId: 'team-a',
        kind: 'cover_landscape',
        originalName: 'c.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 20,
        storageKey: 'cover/c',
        checksumSha256: null,
      }),
    );
    const service = createService(assets);
    const stats = await service.getLibraryStats();
    expect(stats.totalCount).toBe(3);
    expect(stats.totalBytes).toBe(150);
    expect(stats.byCategory.video).toEqual({ count: 1, bytes: 100 });
    expect(stats.byCategory.image).toEqual({ count: 2, bytes: 50 });
  });

  it('batch removes existing assets and reports missing ids', async () => {
    const assets = new FakeAssets();
    const a = await assets.save(
      assets.create({
        teamId: 'team-a',
        kind: 'video',
        originalName: 'a.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 10,
        storageKey: 'video/a',
        checksumSha256: null,
      }),
    );
    const b = await assets.save(
      assets.create({
        teamId: 'team-a',
        kind: 'cover',
        originalName: 'b.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 20,
        storageKey: 'cover/b',
        checksumSha256: null,
      }),
    );
    const service = createService(assets);
    const result = await service.removeAssets([
      a.id,
      b.id,
      '00000000-0000-4000-8000-000000000099',
    ]);
    expect(result.deletedIds).toEqual([a.id, b.id]);
    expect(result.missingIds).toEqual([
      '00000000-0000-4000-8000-000000000099',
    ]);
    expect(assets.items.size).toBe(0);
  });
});
