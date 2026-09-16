import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONTENT_REPOSITORY } from '@pugying/content/domain/repositories/content.repository';
import { CONTENT_TARGET_REPOSITORY } from '@pugying/content/domain/repositories/content-target.repository';
import { ContentEntitySchema } from './content.entity-schema';
import { ContentTargetEntitySchema } from './content-target.entity-schema';
import { TypeOrmContentRepository } from './content.repository';
import { TypeOrmContentTargetRepository } from './content-target.repository';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ContentEntitySchema, ContentTargetEntitySchema]),
  ],
  providers: [
    TypeOrmContentRepository,
    TypeOrmContentTargetRepository,
    {
      provide: CONTENT_REPOSITORY,
      useExisting: TypeOrmContentRepository,
    },
    {
      provide: CONTENT_TARGET_REPOSITORY,
      useExisting: TypeOrmContentTargetRepository,
    },
  ],
  exports: [CONTENT_REPOSITORY, CONTENT_TARGET_REPOSITORY, TypeOrmModule],
})
export class ContentTypeOrmModule {}
