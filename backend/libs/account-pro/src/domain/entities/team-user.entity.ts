import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SoftDeleteAuditedEntity, type IMultiTeam } from '@pugying/core';

/**
 * Shared-account membership: one global user may join many teams.
 */
export class TeamUser extends SoftDeleteAuditedEntity implements IMultiTeam {
  @ApiProperty({ description: '用户 UUID' })
  userId: string;

  @ApiProperty({ description: '团队 UUID' })
  teamId: string;

  @ApiProperty({
    example: ['Identity.Users.View'],
    description: '用户在该团队的直挂权限（与角色权限并集）',
    type: [String],
  })
  extraPermissions: string[];

  @ApiPropertyOptional({ description: '离开团队时间；null 表示仍为成员' })
  leftAt?: Date | null;
}
