import { Global, Module } from '@nestjs/common';
import { CommercialModuleRegistry } from '@pugying/core/commercial/commercial-module.registry';

@Global()
@Module({
  providers: [CommercialModuleRegistry],
  exports: [CommercialModuleRegistry],
})
export class CoreModule {}
