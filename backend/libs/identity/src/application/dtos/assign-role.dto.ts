import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ description: '角色 UUID' })
  @IsUUID()
  roleId: string;
}
