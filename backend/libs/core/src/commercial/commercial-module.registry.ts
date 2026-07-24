import { Injectable } from '@nestjs/common';

export interface CommercialModuleInfo {
  name: string;
  version?: string;
  description?: string;
}

/**
 * Hook for commercial packages to self-register at runtime.
 * Open-source modules never depend on this for core behavior.
 */
@Injectable()
export class CommercialModuleRegistry {
  private readonly modules = new Map<string, CommercialModuleInfo>();

  register(info: CommercialModuleInfo): void {
    this.modules.set(info.name, info);
  }

  getAll(): CommercialModuleInfo[] {
    return Array.from(this.modules.values());
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }
}

/**
 * Marker token commercial packages can implement via onModuleInit.
 */
export const COMMERCIAL_MODULE_MARKER = 'PUGYING_COMMERCIAL_MODULE_MARKER';
