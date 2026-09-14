import { AsyncLocalStorage } from 'async_hooks';
import type { DataSource, EntityManager } from 'typeorm';

/**
 * Holds the transactional EntityManager for the current async context.
 */
const storage = new AsyncLocalStorage<EntityManager>();

export class TypeOrmTransactionContext {
  static run<T>(manager: EntityManager, fn: () => T): T {
    return storage.run(manager, fn);
  }

  static getManager(dataSource: DataSource): EntityManager {
    return storage.getStore() ?? dataSource.manager;
  }
}
