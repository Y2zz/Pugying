import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Entity } from '@pugying/core/domain/entity.base';
import { ISoftDelete } from '@pugying/core/domain/ISoftDelete';

/**
 * Audited entity base: UUID id + createdAt / updatedAt (ABP-style AuditedEntity).
 * Column mapping is provided by the persistence layer, not by this class.
 */
export abstract class AuditedEntity extends Entity {
  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * Audited entity with soft-delete support (ABP-style FullAudited without actor ids).
 */
export abstract class SoftDeleteAuditedEntity extends AuditedEntity implements ISoftDelete {
  @ApiPropertyOptional({ description: '软删除时间；null 表示未删除' })
  deletedAt?: Date | null;
}
