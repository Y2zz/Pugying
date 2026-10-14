import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRegistry } from '@pugying/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let registry: ModuleRegistry;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, Reflector, ModuleRegistry],
    }).compile();

    appController = app.get<AppController>(AppController);
    registry = app.get<ModuleRegistry>(ModuleRegistry);
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

  describe('modules', () => {
    it('returns an empty list when no module registered', () => {
      expect(appController.listModules()).toEqual([]);
    });

    it('returns registered modules', () => {
      registry.register({ name: 'content', version: '1.0.0' });

      expect(appController.listModules()).toEqual([
        { name: 'content', version: '1.0.0' },
      ]);
    });
  });
});
