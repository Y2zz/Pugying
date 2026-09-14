/**
 * Entity identity contract (ABP-style IEntity).
 * Primary key is always UUID — sequential integer IDs are forbidden.
 */
export interface IEntity {
  id: string;
}
