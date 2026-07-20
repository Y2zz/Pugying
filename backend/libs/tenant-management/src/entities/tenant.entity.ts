import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class Tenant {
  @ApiProperty({ example: 1, description: '租户 ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: '示例公司', description: '租户名称' })
  @Column()
  displayName: string;

  @ApiProperty({ example: 'example-corp', description: '租户标识（唯一）' })
  @Column({ unique: true })
  name: string;

  @ApiProperty({ example: true, description: '是否启用' })
  @Column({ default: true })
  active: boolean;

  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  @UpdateDateColumn()
  updatedAt: Date;
}
