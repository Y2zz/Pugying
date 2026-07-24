import { ApiProperty } from '@nestjs/swagger';
import { AuditedEntity, type IMultiTenant } from '@pugying/core';

/**
 * User entity. Table name remains `account` (mapped in @pugying/typeorm).
 */
export class User extends AuditedEntity implements IMultiTenant {
  @ApiProperty({ example: 'user@example.com', description: '邮箱地址' })
  email: string;

  @ApiProperty({ example: '张三', description: '用户名' })
  username: string;

  passwordHash: string;

  @ApiProperty({ example: true, description: '是否启用' })
  active: boolean;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: '所属租户 UUID',
  })
  tenantId: string;

  /**
   * Granted permissions stored as a string array.
   */
  @ApiProperty({
    example: ['Identity.Users.View'],
    description: '已授予权限',
    type: [String],
  })
  permissions: string[];
}
