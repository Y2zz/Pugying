import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CurrentTenant } from '@pugying/core';
import { TenantManagementService } from '@pugying/tenant-management';
import type { IUserRepository } from '@pugying/identity/domain/repositories/user.repository';
import { USER_REPOSITORY } from '@pugying/identity/domain/repositories/user.repository';
import { User } from '@pugying/identity/domain/entities/user.entity';
import { CreateUserDto, LoginDto, UpdateUserDto } from '@pugying/identity/application/dtos';

export interface LoginResult {
  accessToken: string;
  user: Omit<User, 'passwordHash'>;
}

@Injectable()
export class IdentityService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly tenantService: TenantManagementService,
    private readonly jwtService: JwtService,
    private readonly currentTenant: CurrentTenant,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    await this.tenantService.findOne(dto.tenantId);

    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(`Email ${dto.email} already exists`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      email: dto.email,
      username: dto.username,
      tenantId: dto.tenantId,
      passwordHash,
      permissions: dto.permissions ?? [],
      active: true,
    });
    return this.userRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    if (this.currentTenant.isAvailable) {
      return this.userRepository.findByTenantId(this.currentTenant.id!);
    }
    return this.userRepository.findAll();
  }

  async findByTenant(tenantId: string): Promise<User[]> {
    return this.userRepository.findByTenantId(tenantId);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, dto);
    return this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const permissions = this.normalizePermissions(user.permissions);
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      username: user.username,
      tenantId: user.tenantId,
      permissions,
    });

    const { passwordHash: _, ...safeUser } = user;
    return {
      accessToken,
      user: { ...safeUser, permissions },
    };
  }

  toPublicUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _, ...safeUser } = user;
    return {
      ...safeUser,
      permissions: this.normalizePermissions(user.permissions),
    };
  }

  normalizePermissions(permissions: string[] | string | null | undefined): string[] {
    if (!permissions) {
      return [];
    }
    if (Array.isArray(permissions)) {
      return permissions;
    }
    if (typeof permissions === 'string') {
      try {
        const parsed = JSON.parse(permissions) as unknown;
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
