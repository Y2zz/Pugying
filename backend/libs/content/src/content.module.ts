import {
  Logger,
  Module,
  OnModuleInit,
  type DynamicModule,
  type Type,
} from '@nestjs/common';
import { PermissionRegistry } from '@pugying/core';
import { ContentPublishService } from '@pugying/content/application/services/content-publish.service';
import { ContentService } from '@pugying/content/application/services/content.service';
import { MediaService } from '@pugying/content/application/services/media.service';
import { ContentController } from '@pugying/content/http/controllers/content.controller';
import { MediaController } from '@pugying/content/http/controllers/media.controller';
import { contentPermissionList } from '@pugying/content/content.permissions';
import {
  MEDIA_STORAGE,
  type IMediaStorage,
} from '@pugying/content/domain/repositories/media-storage';
import { LocalMediaStorage } from '@pugying/content/infrastructure/local/local-media-storage';

export type ContentModuleOptions = {
  /**
   * 覆盖默认本机盘存储。商业宿主传入对象存储等实现类。
   * @see docs/media-storage.md
   */
  mediaStorage?: Type<IMediaStorage>;
};

const contentControllers = [ContentController, MediaController];
const contentServices = [ContentService, ContentPublishService, MediaService];

function mediaStorageProviders(options: ContentModuleOptions = {}) {
  if (options.mediaStorage) {
    return [{ provide: MEDIA_STORAGE, useClass: options.mediaStorage }];
  }
  return [
    LocalMediaStorage,
    { provide: MEDIA_STORAGE, useExisting: LocalMediaStorage },
  ];
}

@Module({
  controllers: contentControllers,
  providers: [...mediaStorageProviders(), ...contentServices],
  exports: [...contentServices, MEDIA_STORAGE],
})
export class ContentModule implements OnModuleInit {
  private readonly logger = new Logger(ContentModule.name);

  constructor(
    private readonly permissionRegistry: PermissionRegistry,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * 商业装配示例：`ContentModule.register({ mediaStorage: S3MediaStorage })`
   * 开源宿主继续 `imports: [ContentModule]` 即可。
   */
  static register(options: ContentModuleOptions = {}): DynamicModule {
    return {
      module: ContentModule,
      controllers: contentControllers,
      providers: [...mediaStorageProviders(options), ...contentServices],
      exports: [...contentServices, MEDIA_STORAGE],
    };
  }

  onModuleInit(): void {
    this.permissionRegistry.register(...contentPermissionList);
    void this.mediaService.scrubStaleUploads().then((removed) => {
      if (removed > 0) {
        this.logger.log(`已清理 ${removed} 个过期未完成上传会话`);
      }
    });
  }
}
