import { Reflector } from '@nestjs/core';
import { PugyingModule } from '@pugying/core/module/pugying-module.decorator';
import { ModuleRegistry } from './module.registry';

@PugyingModule({
  name: 'platform-account',
  version: '1.2.3',
  description: 'Platform account binding',
})
class DecoratedModule {}

class PlainModule {}

describe('ModuleRegistry', () => {
  let registry: ModuleRegistry;

  beforeEach(() => {
    registry = new ModuleRegistry(new Reflector());
  });

  it('starts empty', () => {
    expect(registry.getAll()).toEqual([]);
    expect(registry.has('platform-account')).toBe(false);
  });

  it('registers module info directly', () => {
    registry.register({ name: 'content', version: '0.1.0' });

    expect(registry.has('content')).toBe(true);
    expect(registry.getAll()).toEqual([{ name: 'content', version: '0.1.0' }]);
  });

  it('overwrites a module registered under the same name', () => {
    registry.register({ name: 'platform-account', version: '1.0.0' });
    registry.register({ name: 'platform-account', version: '2.0.0' });

    expect(registry.getAll()).toEqual([
      { name: 'platform-account', version: '2.0.0' },
    ]);
  });

  it('registers from @PugyingModule metadata', () => {
    registry.registerFromModule(DecoratedModule);

    expect(registry.has('platform-account')).toBe(true);
    expect(registry.getAll()).toEqual([
      {
        name: 'platform-account',
        version: '1.2.3',
        description: 'Platform account binding',
      },
    ]);
  });

  it('ignores modules without @PugyingModule metadata', () => {
    registry.registerFromModule(PlainModule);

    expect(registry.getAll()).toEqual([]);
  });
});
