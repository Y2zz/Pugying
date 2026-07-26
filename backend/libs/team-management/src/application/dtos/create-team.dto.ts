import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ example: '示例团队', description: '团队名称' })
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @ApiProperty({ example: 'example-team', description: '团队标识（唯一）' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
