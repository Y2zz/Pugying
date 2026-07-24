import { EntitySchema } from 'typeorm';
import { Tenant } from '@pugying/tenant-management/domain/entities/tenant.entity';

export const TenantEntitySchema = new EntitySchema<Tenant>({
  name: 'Tenant',
  tableName: 'tenant',
  target: Tenant,
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    displayName: {
      type: String,
    },
    name: {
      type: String,
      unique: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      createDate: true,
    },
    updatedAt: {
      type: Date,
      updateDate: true,
    },
  },
});
