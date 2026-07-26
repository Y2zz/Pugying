import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class InviteUserDto {
  @ApiProperty({ example: 'user@example.com', description: '已存在用户的邮箱' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '目标团队 UUID' })
  @IsUUID()
  teamId: string;

  @ApiProperty({
    required: false,
    example: ['Identity.Users.View'],
    description: '直挂权限',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraPermissions?: string[];
}
