import { ApiProperty } from '@nestjs/swagger';

export class CreateAccountDto {
  @ApiProperty({ example: 'user@example.com', description: '邮箱地址' })
  email: string;

  @ApiProperty({ example: '张三', description: '用户名' })
  username: string;

  @ApiProperty({ example: 'P@ssw0rd', description: '密码' })
  password: string;

  @ApiProperty({ example: 1, description: '所属租户 ID' })
  tenantId: number;
}
