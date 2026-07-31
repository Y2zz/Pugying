import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({ example: 'user@example.com', description: '邮箱地址' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'zhangsan', description: '用户名' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username: string;

  @ApiProperty({ example: 'P@ssw0rd', description: '密码（至少 6 位）' })
  @IsString()
  @MinLength(6)
  password: string;
}
