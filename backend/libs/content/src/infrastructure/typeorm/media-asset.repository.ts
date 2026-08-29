import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { MediaAssetKind } from '@pugying/content/domain/content-types';
import { MediaAsset } from '@pugying/content/domain/entities/media-asset.entity';
import type {
  IMediaAssetRepository,
  MediaAssetListFilter,
  MediaAssetSortField,
} from '@pugying/content/domain/repositories/media-asset.repository';
import { TypeOrmTeamFilter, TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, In, Repository } from 'typeorm';

/** LIKE 通配符转义，避免用户输入 %/_ 扩大匹配面 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

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

  private resolveSort(filter: MediaAssetListFilter): {
    field: MediaAssetSortField;
    direction: 'ASC' | 'DESC';
  } {
    const field = filter.sortBy ?? 'createdAt';
    const direction = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
    return { field, direction };
  }

  async findPagedForCurrentTeam(
    filter: MediaAssetListFilter = {},
  ): Promise<{ rows: MediaAsset[]; total: number }> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const q = filter.q?.trim();
    const kinds = filter.kinds;
    const { field, direction } = this.resolveSort(filter);

    const where =
      kinds && kinds.length > 0 ? { kind: In(kinds) } : {};

    if (!q) {
      const [rows, total] = await this.repo.findAndCount(
        this.teamFilter.applyMany<MediaAsset>({
          where,
          order: { [field]: direction },
          skip,
          take: pageSize,
        }),
      );
      return { rows, total };
    }

    const qb = this.repo.createQueryBuilder('asset');

    const scoped = this.teamFilter.applyMany<MediaAsset>({});
    const teamWhere = scoped.where;
    if (
      teamWhere &&
      !Array.isArray(teamWhere) &&
      typeof teamWhere === 'object' &&
      'teamId' in teamWhere &&
      typeof (teamWhere as { teamId?: unknown }).teamId === 'string'
    ) {
      qb.andWhere('asset.teamId = :teamId', {
        teamId: (teamWhere as { teamId: string }).teamId,
      });
    }

    qb.andWhere('asset.deletedAt IS NULL');

    if (kinds && kinds.length > 0) {
      qb.andWhere('asset.kind IN (:...kinds)', { kinds });
    }

    const pattern = `%${escapeLike(q)}%`;
    qb.andWhere(
      `(asset.originalName LIKE :pattern ESCAPE '\\' OR asset.mimeType LIKE :pattern ESCAPE '\\')`,
      { pattern },
    );

    qb.orderBy(`asset.${field}`, direction);

    const [rows, total] = await qb.skip(skip).take(pageSize).getManyAndCount();
    return { rows, total };
  }

  async findKindStatsForCurrentTeam(): Promise<
    Array<{ kind: MediaAssetKind; count: number; bytes: number }>
  > {
    const qb = this.repo
      .createQueryBuilder('asset')
      .select('asset.kind', 'kind')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(asset.sizeBytes)', 'bytes')
      .andWhere('asset.deletedAt IS NULL');

    const scoped = this.teamFilter.applyMany<MediaAsset>({});
    const teamWhere = scoped.where;
    if (
      teamWhere &&
      !Array.isArray(teamWhere) &&
      typeof teamWhere === 'object' &&
      'teamId' in teamWhere &&
      typeof (teamWhere as { teamId?: unknown }).teamId === 'string'
    ) {
      qb.andWhere('asset.teamId = :teamId', {
        teamId: (teamWhere as { teamId: string }).teamId,
      });
    }

    qb.groupBy('asset.kind');

    const raw = await qb.getRawMany<{
      kind: MediaAssetKind;
      count: string;
      bytes: string;
    }>();

    return raw.map((row) => ({
      kind: row.kind,
      count: Number(row.count),
      bytes: Number(row.bytes),
    }));
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
