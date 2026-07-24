import { ApiProperty } from '@nestjs/swagger';
import { AuditedEntity } from '@pugying/core';

/**
 * Tenant entity. Table mapping lives in @pugying/typeorm.
 */
export class Tenant extends AuditedEntity {
  @ApiProperty({ example: '示例公司', description: '租户名称' })
  displayName: string;

  @ApiProperty({ example: 'example-corp', description: '租户标识（唯一）' })
  name: string;

  @ApiProperty({ example: true, description: '是否启用' })
  active: boolean;
}
