import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PUGYING_MODULE_METADATA,
  type PugyingModuleMetadata,
} from '@pugying/core/module/pugying-module.metadata';

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

  constructor(private readonly reflector: Reflector) {}

  register(info: CommercialModuleInfo): void {
    this.modules.set(info.name, info);
  }

  /**
   * Reads `@PugyingModule` metadata from a module class and registers it.
   */
  registerFromModule(moduleClass: object): void {
    const metadata = this.reflector.get<PugyingModuleMetadata | undefined>(
      PUGYING_MODULE_METADATA,
      moduleClass as NewableFunction,
    );
    if (!metadata?.name) {
      return;
    }
    this.register({
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
    });
  }

  getAll(): CommercialModuleInfo[] {
    return Array.from(this.modules.values());
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }
}
