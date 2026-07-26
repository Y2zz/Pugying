import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SwitchTeamDto {
  @ApiProperty({ description: '目标团队 UUID' })
  @IsUUID()
  teamId: string;
}
