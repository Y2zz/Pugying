import { ApiProperty } from '@nestjs/swagger';
import { Entity } from './entity.base';

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
 * Soft-delete marker (reserved for future use).
 */
export interface ISoftDelete {
  deletedAt?: Date | null;
}
