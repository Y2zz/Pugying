import { ApiProperty } from '@nestjs/swagger';
import { SoftDeleteAuditedEntity } from '@pugying/core';

/**
 * User–Role assignment (role already carries teamId).
 */
export class UserRole extends SoftDeleteAuditedEntity {
  @ApiProperty({ description: '用户 UUID' })
  userId: string;

  @ApiProperty({ description: '角色 UUID' })
  roleId: string;
}
