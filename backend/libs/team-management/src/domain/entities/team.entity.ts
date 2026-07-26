import { ApiProperty } from '@nestjs/swagger';
import { SoftDeleteAuditedEntity } from '@pugying/core';

/**
 * Team entity. Table mapping lives in infrastructure/typeorm.
 */
export class Team extends SoftDeleteAuditedEntity {
  @ApiProperty({ example: '示例团队', description: '团队名称' })
  displayName: string;

  @ApiProperty({ example: 'example-team', description: '团队标识（唯一）' })
  name: string;

  @ApiProperty({ example: true, description: '是否启用' })
  active: boolean;
}
