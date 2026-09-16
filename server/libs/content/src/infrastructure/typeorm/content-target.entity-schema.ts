import { EntitySchema } from 'typeorm';
import { ContentTarget } from '@pugying/content/domain/entities/content-target.entity';

export const ContentTargetEntitySchema = new EntitySchema<ContentTarget>({
  name: 'ContentTarget',
  tableName: 'content_target',
  target: ContentTarget,
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    contentId: {
      type: 'uuid',
    },
    platformAccountId: {
      type: 'uuid',
    },
    platform: {
      type: String,
    },
    overrides: {
      type: 'simple-json',
      default: '{}',
    },
    coverMime: {
      type: String,
      nullable: true,
    },
    coverData: {
      type: 'blob',
      nullable: true,
      select: false,
    },
    coverLandscapeMime: {
      type: String,
      nullable: true,
    },
    coverLandscapeData: {
      type: 'blob',
      nullable: true,
      select: false,
    },
    publishStatus: {
      type: String,
      default: 'idle',
    },
    platformPostId: {
      type: String,
      nullable: true,
    },
    platformUrl: {
      type: String,
      nullable: true,
    },
    errorCode: {
      type: String,
      nullable: true,
    },
    errorMessage: {
      type: 'text',
      nullable: true,
    },
    startedAt: {
      type: Date,
      nullable: true,
    },
    finishedAt: {
      type: Date,
      nullable: true,
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
  indices: [
    {
      name: 'IDX_content_target_content',
      columns: ['contentId'],
    },
    {
      name: 'IDX_content_target_account',
      columns: ['platformAccountId'],
    },
    {
      name: 'IDX_content_target_publish_status',
      columns: ['publishStatus'],
    },
  ],
  uniques: [
    {
      name: 'UQ_content_target_content_account',
      columns: ['contentId', 'platformAccountId'],
    },
  ],
});
