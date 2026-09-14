import type { DataSource, EntityManager } from 'typeorm';
import { TypeOrmTransactionContext } from './typeorm-transaction-context';
import { TypeOrmUnitOfWork } from './typeorm-unit-of-work';

describe('TypeOrmUnitOfWork', () => {
  let defaultManager: EntityManager;
  let transactionalManager: EntityManager;
  let dataSource: DataSource;
  let unitOfWork: TypeOrmUnitOfWork;

  beforeEach(() => {
    defaultManager = { label: 'default' } as unknown as EntityManager;
    transactionalManager = { label: 'transactional' } as unknown as EntityManager;
    dataSource = {
      manager: defaultManager,
      transaction: jest.fn(async (runInTransaction: (manager: EntityManager) => Promise<unknown>) => runInTransaction(transactionalManager)),
    } as unknown as DataSource;
    unitOfWork = new TypeOrmUnitOfWork(dataSource);
  });

  it('runs the work inside a transaction and returns its result', async () => {
    const result = await unitOfWork.complete(async () => 'done');

    expect(result).toBe('done');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('exposes the transactional manager through the transaction context', async () => {
    let managerDuringWork: EntityManager | undefined;

    await unitOfWork.complete(async () => {
      managerDuringWork = TypeOrmTransactionContext.getManager(dataSource);
    });

    expect(managerDuringWork).toBe(transactionalManager);
  });

  it('falls back to the default manager outside of a transaction', () => {
    expect(TypeOrmTransactionContext.getManager(dataSource)).toBe(defaultManager);
  });

  it('restores the default manager after the transaction completes', async () => {
    await unitOfWork.complete(async () => 'noop');

    expect(TypeOrmTransactionContext.getManager(dataSource)).toBe(defaultManager);
  });

  it('propagates errors thrown by the work callback', async () => {
    await expect(
      unitOfWork.complete(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('propagates transaction failures (rollback path)', async () => {
    (dataSource.transaction as jest.Mock).mockRejectedValue(new Error('rollback'));

    await expect(unitOfWork.complete(async () => 'never')).rejects.toThrow('rollback');
  });

  describe('TypeOrmTransactionContext', () => {
    it('scopes the manager to the callback and supports nesting', () => {
      const outer = { label: 'outer' } as unknown as EntityManager;
      const inner = { label: 'inner' } as unknown as EntityManager;

      TypeOrmTransactionContext.run(outer, () => {
        expect(TypeOrmTransactionContext.getManager(dataSource)).toBe(outer);
        TypeOrmTransactionContext.run(inner, () => {
          expect(TypeOrmTransactionContext.getManager(dataSource)).toBe(inner);
        });
        expect(TypeOrmTransactionContext.getManager(dataSource)).toBe(outer);
      });

      expect(TypeOrmTransactionContext.getManager(dataSource)).toBe(defaultManager);
    });
  });
});
