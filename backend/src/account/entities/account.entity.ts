import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Tenant } from '@pugying/tenant-management/entities/tenant.entity';

@Entity()
export class Account {
  @ApiProperty({ example: 1, description: '账户 ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'user@example.com', description: '邮箱地址' })
  @Column({ unique: true })
  email: string;

  @ApiProperty({ example: '张三', description: '用户名' })
  @Column()
  username: string;

  @Column()
  passwordHash: string;

  @ApiProperty({ example: true, description: '是否启用' })
  @Column({ default: true })
  active: boolean;

  @ApiProperty({ example: 1, description: '所属租户 ID' })
  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  @UpdateDateColumn()
  updatedAt: Date;
}
