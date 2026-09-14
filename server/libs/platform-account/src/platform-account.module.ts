import { Module } from '@nestjs/common';
import { PlatformAccountService } from '@pugying/platform-account/application/services/platform-account.service';
import { PlatformAccountController } from '@pugying/platform-account/http/controllers/platform-account.controller';

@Module({
  controllers: [PlatformAccountController],
  providers: [PlatformAccountService],
  exports: [PlatformAccountService],
})
export class PlatformAccountModule {}
