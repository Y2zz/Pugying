import { Module } from '@nestjs/common';
import { ContentPublishService } from '@pugying/content/application/services/content-publish.service';
import { ContentService } from '@pugying/content/application/services/content.service';
import { ContentController } from '@pugying/content/http/controllers/content.controller';

@Module({
  controllers: [ContentController],
  providers: [ContentService, ContentPublishService],
  exports: [ContentService, ContentPublishService],
})
export class ContentModule {}
