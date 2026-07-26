export const PUGYING_MODULE_METADATA = 'pugying:module';

export interface PugyingModuleMetadata {
  name: string;
  version?: string;
  description?: string;
  dependencies?: string[];
}
