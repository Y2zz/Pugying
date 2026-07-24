import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ example: '张三', required: false, description: '用户名' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ example: true, required: false, description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ example: ['Identity.Users.View'], required: false, description: '权限列表' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
