import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({ example: 'editor', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: ['Identity.Users.View'],
    required: false,
    description: '权限列表',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
