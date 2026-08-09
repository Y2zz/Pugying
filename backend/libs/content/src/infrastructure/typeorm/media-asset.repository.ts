import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { MediaAssetKind } from '@pugying/content/domain/content-types';
import { MediaAsset } from '@pugying/content/domain/entities/media-asset.entity';
import type { IMediaAssetRepository } from '@pugying/content/domain/repositories/media-asset.repository';
import { TypeOrmTeamFilter, TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, In, Repository } from 'typeorm';

@Injectable()
export class TypeOrmMediaAssetRepository implements IMediaAssetRepository {
  constructor(
    @InjectRepository(MediaAsset)
    private readonly repository: Repository<MediaAsset>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly teamFilter: TypeOrmTeamFilter,
  ) {}

  private get repo(): Repository<MediaAsset> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(
      MediaAsset,
    );
  }

  create(data: Partial<MediaAsset>): MediaAsset {
    return this.repo.create(data);
  }

  async findById(id: string): Promise<MediaAsset | null> {
    return this.repo.findOne(
      this.teamFilter.applyOne<MediaAsset>({ where: { id } }),
    );
  }

  async findByIdUnscoped(id: string): Promise<MediaAsset | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAllForCurrentTeam(
    kinds?: MediaAssetKind[],
  ): Promise<MediaAsset[]> {
    return this.repo.find(
      this.teamFilter.applyMany<MediaAsset>({
        where: kinds && kinds.length > 0 ? { kind: In(kinds) } : {},
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async findByChecksumForCurrentTeam(
    checksumSha256: string,
    kind?: MediaAssetKind,
  ): Promise<MediaAsset | null> {
    return this.repo.findOne(
      this.teamFilter.applyOne<MediaAsset>({
        where: kind
          ? { checksumSha256, kind }
          : { checksumSha256 },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async save(asset: MediaAsset): Promise<MediaAsset> {
    return this.repo.save(asset);
  }

  async softRemove(asset: MediaAsset): Promise<void> {
    await this.repo.softRemove(asset);
  }
}
