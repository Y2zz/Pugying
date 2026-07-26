import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LeaveTeamDto {
  @ApiProperty({ description: '要离开的团队 UUID' })
  @IsUUID()
  teamId: string;
}
