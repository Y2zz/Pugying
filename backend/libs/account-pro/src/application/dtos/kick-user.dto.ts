import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class KickUserDto {
  @ApiProperty({ description: '要移出的用户 UUID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: '目标团队 UUID' })
  @IsUUID()
  teamId: string;
}
