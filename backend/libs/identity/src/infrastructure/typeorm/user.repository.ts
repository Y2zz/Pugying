import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { User } from '@pugying/identity/domain/entities/user.entity';
import type { IUserRepository } from '@pugying/identity/domain/repositories/user.repository';
import { TypeOrmTransactionContext } from '@pugying/typeorm';
import { DataSource, In, Repository } from 'typeorm';

@Injectable()
export class TypeOrmUserRepository implements IUserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private get repo(): Repository<User> {
    return TypeOrmTransactionContext.getManager(this.dataSource).getRepository(
      User,
    );
  }

  create(data: Partial<User>): User {
    return this.repo.create(data);
  }

  async findAll(): Promise<User[]> {
    return this.repo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.repo.find({
      where: { id: In(ids) },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({
      where: { email },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({
      where: { username },
    });
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  async save(user: User): Promise<User> {
    return this.repo.save(user);
  }

  async remove(user: User): Promise<void> {
    await this.repo.softRemove(user);
  }
}
