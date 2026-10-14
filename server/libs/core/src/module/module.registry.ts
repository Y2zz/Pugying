import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PUGYING_MODULE_METADATA,
  type PugyingModuleMetadata,
} from '@pugying/core/module/pugying-module.metadata';

export interface ModuleInfo {
  name: string;
  version?: string;
  description?: string;
}

/** 运行时模块注册表：供可选扩展模块自注册，核心业务不依赖此表。 */
@Injectable()
export class ModuleRegistry {
  private readonly modules = new Map<string, ModuleInfo>();

  constructor(private readonly reflector: Reflector) {}

  register(info: ModuleInfo): void {
    this.modules.set(info.name, info);
  }

  /** 读取 `@PugyingModule` 元数据并注册。 */
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

  getAll(): ModuleInfo[] {
    return Array.from(this.modules.values());
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }
}
