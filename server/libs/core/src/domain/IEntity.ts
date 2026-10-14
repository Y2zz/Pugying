/**
 * 实体标识约定。主键始终为 UUID，禁止自增整型 ID。
 */
export interface IEntity {
  id: string;
}
