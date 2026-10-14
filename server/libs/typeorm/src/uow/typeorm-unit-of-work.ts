import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { IUnitOfWork } from '@pugying/core';
import { DataSource } from 'typeorm';
import { TypeOrmTransactionContext } from '@pugying/typeorm/uow/typeorm-transaction-context';

@Injectable()
export class TypeOrmUnitOfWork implements IUnitOfWork {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  complete<T>(work: () => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      return TypeOrmTransactionContext.run(manager, () => work());
    });
  }
}
