import { AsyncLocalStorage } from 'async_hooks';
import { Injectable } from '@nestjs/common';

export interface TenantContext {
  id: string | null;
  name?: string;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

@Injectable()
export class CurrentTenant {
  run<T>(context: TenantContext, fn: () => T): T {
    return tenantStorage.run(context, fn);
  }

  get id(): string | null {
    return tenantStorage.getStore()?.id ?? null;
  }

  get name(): string | undefined {
    return tenantStorage.getStore()?.name;
  }

  get isAvailable(): boolean {
    return this.id !== null;
  }

  getStore(): TenantContext | undefined {
    return tenantStorage.getStore();
  }
}
