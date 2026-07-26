/**
 * Unit of Work — wraps a multi-step write in one transaction (ABP-style IUnitOfWork).
 */
export interface IUnitOfWork {
  complete<T>(work: () => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = 'IUnitOfWork';
