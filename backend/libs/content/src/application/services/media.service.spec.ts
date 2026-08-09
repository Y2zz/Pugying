import { UnauthorizedException } from '@nestjs/common';
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

  async findAllForCurrentTeam(): Promise<MediaAsset[]> {
    return [...this.items.values()];
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
});
