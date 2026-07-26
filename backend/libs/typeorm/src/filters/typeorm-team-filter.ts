import { Injectable } from '@nestjs/common';
import { CurrentTeam } from '@pugying/core';
import type { FindManyOptions, FindOneOptions, FindOptionsWhere, ObjectLiteral } from 'typeorm';

/**
 * Applies current-team scope to TypeORM find options when the entity has teamId.
 */
@Injectable()
export class TypeOrmTeamFilter {
  constructor(private readonly currentTeam: CurrentTeam) {}

  applyMany<Entity extends ObjectLiteral>(
    options: FindManyOptions<Entity> = {},
  ): FindManyOptions<Entity> {
    return this.apply(options);
  }

  applyOne<Entity extends ObjectLiteral>(
    options: FindOneOptions<Entity> = {},
  ): FindOneOptions<Entity> {
    return this.apply(options);
  }

  private apply<Entity extends ObjectLiteral>(
    options: FindManyOptions<Entity> | FindOneOptions<Entity>,
  ): FindManyOptions<Entity> | FindOneOptions<Entity> {
    if (!this.currentTeam.isAvailable) {
      return options;
    }

    const teamWhere = {
      teamId: this.currentTeam.id!,
    } as unknown as FindOptionsWhere<Entity>;

    const existing = options.where;
    if (!existing) {
      return { ...options, where: teamWhere };
    }

    if (Array.isArray(existing)) {
      return {
        ...options,
        where: existing.map((item) => ({ ...item, ...teamWhere })),
      };
    }

    return {
      ...options,
      where: { ...existing, ...teamWhere },
    };
  }
}
