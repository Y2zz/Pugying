import { ApiProperty } from '@nestjs/swagger';
import { AuditedEntity, type IMultiTeam } from '@pugying/core';
import type { ContentTargetOverrides } from '@pugying/content/domain/content-types';

/** 内容的分发目标：一个平台账号 + 针对该账号的差异字段 */
export class ContentTarget extends AuditedEntity implements IMultiTeam {
  @ApiProperty({ description: '所属团队 UUID' })
  teamId: string;

  @ApiProperty({ description: '内容 UUID' })
  contentId: string;

  @ApiProperty({ description: '平台账号 UUID' })
  platformAccountId: string;

  @ApiProperty({ description: '平台标识（冗余自平台账号，便于查询）' })
  platform: string;

  @ApiProperty({ description: '差异字段；未设置的字段使用内容通用设置' })
  overrides: ContentTargetOverrides;
}
