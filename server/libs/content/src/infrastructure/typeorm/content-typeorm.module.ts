import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONTENT_REPOSITORY } from '@pugying/content/domain/repositories/content.repository';
import { CONTENT_TARGET_REPOSITORY } from '@pugying/content/domain/repositories/content-target.repository';
import { MEDIA_ASSET_REPOSITORY } from '@pugying/content/domain/repositories/media-asset.repository';
import { ContentEntitySchema } from './content.entity-schema';
import { ContentTargetEntitySchema } from './content-target.entity-schema';
import { MediaAssetEntitySchema } from './media-asset.entity-schema';
import { TypeOrmContentRepository } from './content.repository';
import { TypeOrmContentTargetRepository } from './content-target.repository';
import { TypeOrmMediaAssetRepository } from './media-asset.repository';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContentEntitySchema,
      ContentTargetEntitySchema,
      MediaAssetEntitySchema,
    ]),
  ],
  providers: [
    TypeOrmContentRepository,
    TypeOrmContentTargetRepository,
    TypeOrmMediaAssetRepository,
    {
      provide: CONTENT_REPOSITORY,
      useExisting: TypeOrmContentRepository,
    },
    {
      provide: CONTENT_TARGET_REPOSITORY,
      useExisting: TypeOrmContentTargetRepository,
    },
    {
      provide: MEDIA_ASSET_REPOSITORY,
      useExisting: TypeOrmMediaAssetRepository,
    },
  ],
  exports: [
    CONTENT_REPOSITORY,
    CONTENT_TARGET_REPOSITORY,
    MEDIA_ASSET_REPOSITORY,
    TypeOrmModule,
  ],
})
export class ContentTypeOrmModule {}
