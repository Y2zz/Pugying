import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@pugying.local', description: '邮箱' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin123!', description: '密码' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
