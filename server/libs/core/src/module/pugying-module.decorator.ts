import { SetMetadata } from '@nestjs/common';
import {
  PUGYING_MODULE_METADATA,
  type PugyingModuleMetadata,
} from '@pugying/core/module/pugying-module.metadata';

/**
 * Marks a Nest module with Pugying metadata (name / version / description).
 */
export function PugyingModule(metadata: PugyingModuleMetadata): ClassDecorator {
  return SetMetadata(PUGYING_MODULE_METADATA, metadata);
}
