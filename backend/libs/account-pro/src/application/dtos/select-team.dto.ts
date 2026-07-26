import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class SelectTeamDto {
  @ApiProperty({ description: '登录第二步临时票据' })
  @IsString()
  @MinLength(10)
  loginTicket: string;

  @ApiProperty({ description: '目标团队 UUID' })
  @IsUUID()
  teamId: string;
}
