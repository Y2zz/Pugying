import { ApiProperty } from '@nestjs/swagger';

/**
 * Entity identity contract (ABP-style IEntity).
 * Primary key is always UUID — sequential integer IDs are forbidden.
 */
export interface IEntity {
  id: string;
}

/**
 * Base entity with UUID primary key only (ABP-style Entity).
 * Persistence mapping lives outside @pugying/core (e.g. @pugying/typeorm).
 */
export abstract class Entity implements IEntity {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: '实体 UUID',
  })
  id: string;
}
