import { Reflector } from '@nestjs/core';
import { PugyingModule } from '@pugying/core/module/pugying-module.decorator';
import { CommercialModuleRegistry } from './commercial-module.registry';

@PugyingModule({
  name: 'account-pro',
  version: '1.2.3',
  description: 'Shared accounts',
})
class DecoratedModule {}

class PlainModule {}

describe('CommercialModuleRegistry', () => {
  let registry: CommercialModuleRegistry;

  beforeEach(() => {
    registry = new CommercialModuleRegistry(new Reflector());
  });

  it('starts empty', () => {
    expect(registry.getAll()).toEqual([]);
    expect(registry.has('account-pro')).toBe(false);
  });

  it('registers module info directly', () => {
    registry.register({ name: 'platform-account', version: '0.1.0' });

    expect(registry.has('platform-account')).toBe(true);
    expect(registry.getAll()).toEqual([{ name: 'platform-account', version: '0.1.0' }]);
  });

  it('overwrites a module registered under the same name', () => {
    registry.register({ name: 'account-pro', version: '1.0.0' });
    registry.register({ name: 'account-pro', version: '2.0.0' });

    expect(registry.getAll()).toEqual([{ name: 'account-pro', version: '2.0.0' }]);
  });

  it('registers from @PugyingModule metadata', () => {
    registry.registerFromModule(DecoratedModule);

    expect(registry.has('account-pro')).toBe(true);
    expect(registry.getAll()).toEqual([
      {
        name: 'account-pro',
        version: '1.2.3',
        description: 'Shared accounts',
      },
    ]);
  });

  it('ignores modules without @PugyingModule metadata', () => {
    registry.registerFromModule(PlainModule);

    expect(registry.getAll()).toEqual([]);
  });
});
