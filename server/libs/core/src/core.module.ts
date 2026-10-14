import { Global, Module } from '@nestjs/common';
import { ModuleRegistry } from '@pugying/core/module/module.registry';

@Global()
@Module({
  providers: [ModuleRegistry],
  exports: [ModuleRegistry],
})
export class CoreModule {}
