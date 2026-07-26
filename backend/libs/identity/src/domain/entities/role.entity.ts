import { ApiProperty } from '@nestjs/swagger';
import { SoftDeleteAuditedEntity, type IMultiTeam } from '@pugying/core';

/**
 * Team-scoped role with granted permission names.
 */
export class Role extends SoftDeleteAuditedEntity implements IMultiTeam {
  @ApiProperty({ example: 'admin', description: '角色名（团队内唯一）' })
  name: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: '所属团队 UUID',
  })
  teamId: string;

  @ApiProperty({
    example: ['Identity.Users.View'],
    description: '角色权限',
    type: [String],
  })
  permissions: string[];
}
