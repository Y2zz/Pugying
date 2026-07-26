import { AsyncLocalStorage } from 'async_hooks';
import { Injectable } from '@nestjs/common';

export interface TeamContext {
  id: string | null;
  name?: string;
}

const teamStorage = new AsyncLocalStorage<TeamContext>();

@Injectable()
export class CurrentTeam {
  run<T>(context: TeamContext, fn: () => T): T {
    return teamStorage.run(context, fn);
  }

  get id(): string | null {
    return teamStorage.getStore()?.id ?? null;
  }

  get name(): string | undefined {
    return teamStorage.getStore()?.name;
  }

  get isAvailable(): boolean {
    return this.id !== null;
  }

  getStore(): TeamContext | undefined {
    return teamStorage.getStore();
  }
}
