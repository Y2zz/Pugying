/**
 * Soft-delete marker. Persistence maps `deletedAt` as a delete-date column.
 */
export interface ISoftDelete {
  deletedAt?: Date | null;
}
