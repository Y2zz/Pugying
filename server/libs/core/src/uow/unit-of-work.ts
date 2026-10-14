/**
 * Unit of Work：将多步写入包在同一事务中。
 */
export interface IUnitOfWork {
  complete<T>(work: () => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = 'IUnitOfWork';
