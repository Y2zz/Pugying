import { ApiProperty } from '@nestjs/swagger';
import { SoftDeleteAuditedEntity } from '@pugying/core';

/**
 * Global user identity (shared-account strategy). Team membership lives in account-pro.
 */
export class User extends SoftDeleteAuditedEntity {
  @ApiProperty({ example: 'user@example.com', description: '邮箱地址' })
  email: string;

  @ApiProperty({ example: '张三', description: '用户名' })
  username: string;

  passwordHash: string;

  @ApiProperty({ example: true, description: '是否启用' })
  active: boolean;
}
