import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { CommercialModuleRegistry } from '@pugying/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let registry: CommercialModuleRegistry;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, Reflector, CommercialModuleRegistry],
    }).compile();

    appController = app.get<AppController>(AppController);
    registry = app.get<CommercialModuleRegistry>(CommercialModuleRegistry);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('version', () => {
    it('returns unified product version', () => {
      const info = appController.getProductVersion();
      expect(info.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(info.minAgentVersion).toBe(info.version);
    });
  });

  describe('commercial-modules', () => {
    it('returns an empty list when no module registered', () => {
      expect(appController.listCommercialModules()).toEqual([]);
    });

    it('returns registered commercial modules', () => {
      registry.register({ name: 'account-pro', version: '1.0.0' });

      expect(appController.listCommercialModules()).toEqual([{ name: 'account-pro', version: '1.0.0' }]);
    });
  });
});
