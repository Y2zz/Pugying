import { EntitySchema } from 'typeorm';
import { Content } from '@pugying/content/domain/entities/content.entity';

export const ContentEntitySchema = new EntitySchema<Content>({
  name: 'Content',
  tableName: 'content',
  target: Content,
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    },
    type: {
      type: String,
    },
    title: {
      type: String,
    },
    body: {
      type: 'text',
      nullable: true,
    },
    coverUrl: {
      type: String,
      nullable: true,
    },
    coverLandscapeUrl: {
      type: String,
      nullable: true,
    },
    mediaUrls: {
      type: 'simple-json',
      default: '[]',
    },
    status: {
      type: String,
      default: 'draft',
    },
    publishedAt: {
      type: Date,
      nullable: true,
    },
    tags: {
      type: 'simple-json',
      default: '[]',
    },
    location: {
      type: String,
      nullable: true,
    },
    visibility: {
      type: String,
      default: 'public',
    },
    scheduledAt: {
      type: Date,
      nullable: true,
    },
    allowDownload: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      createDate: true,
    },
    updatedAt: {
      type: Date,
      updateDate: true,
    },
    deletedAt: {
      type: Date,
      deleteDate: true,
      nullable: true,
    },
  },
  indices: [
    {
      name: 'IDX_content_type',
      columns: ['type'],
    },
    {
      name: 'IDX_content_status',
      columns: ['status'],
    },
  ],
});
