import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com', description: '邮箱地址' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '张三', description: '用户名' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'P@ssw0rd', description: '密码' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: '所属租户 UUID',
  })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ example: ['Identity.Users.View'], required: false, description: '权限列表' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
