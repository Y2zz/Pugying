import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Entity } from '@pugying/core/domain/entity.base';
import { ISoftDelete } from '@pugying/core/domain/ISoftDelete';

/**
 * 审计实体基类：UUID id + createdAt / updatedAt。
 * 列映射由持久化层提供，不由本类声明。
 */
export abstract class AuditedEntity extends Entity {
  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * 带软删除的审计实体（无操作人字段）。
 */
export abstract class SoftDeleteAuditedEntity extends AuditedEntity implements ISoftDelete {
  @ApiPropertyOptional({ description: '软删除时间；null 表示未删除' })
  deletedAt?: Date | null;
}
