import { ApiProperty } from '@nestjs/swagger';
import { IEntity } from '@pugying/core/domain/IEntity';

/**
 * 仅含 UUID 主键的实体基类。
 * 持久化映射在 @pugying/core 之外（例如 @pugying/typeorm）。
 */
export abstract class Entity implements IEntity {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: '实体 UUID',
  })
  id: string;
}
