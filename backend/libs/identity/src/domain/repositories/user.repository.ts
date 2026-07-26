import { User } from '@pugying/identity/domain/entities/user.entity';

export interface IUserRepository {
  create(data: Partial<User>): User;
  findAll(): Promise<User[]>;
  findByIds(ids: string[]): Promise<User[]>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  count(): Promise<number>;
  save(user: User): Promise<User>;
  remove(user: User): Promise<void>;
}

export const USER_REPOSITORY = 'IUserRepository';
