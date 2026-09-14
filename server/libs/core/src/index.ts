export { CoreModule } from './core.module';

export { Entity } from './domain/entity.base';
export type { IEntity } from './domain/IEntity';
export {
  AuditedEntity,
  SoftDeleteAuditedEntity,
} from './domain/audited.entity';
export type { ISoftDelete } from './domain/ISoftDelete';

export { UNIT_OF_WORK, type IUnitOfWork } from './uow/unit-of-work';

export { CommercialModuleRegistry } from './commercial/commercial-module.registry';
export type { CommercialModuleInfo } from './commercial/commercial-module.registry';

export { PUGYING_MODULE_METADATA } from './module/pugying-module.metadata';
export type { PugyingModuleMetadata } from './module/pugying-module.metadata';
export { PugyingModule } from './module/pugying-module.decorator';
