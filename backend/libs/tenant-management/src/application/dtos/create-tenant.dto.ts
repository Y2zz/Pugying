import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: '示例公司', description: '租户名称' })
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @ApiProperty({ example: 'example-corp', description: '租户标识（唯一）' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
