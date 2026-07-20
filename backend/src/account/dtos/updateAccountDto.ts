import { ApiProperty } from '@nestjs/swagger';

export class UpdateAccountDto {
  @ApiProperty({ example: '张三', required: false, description: '用户名' })
  username?: string;

  @ApiProperty({ example: true, required: false, description: '是否启用' })
  active?: boolean;
}
