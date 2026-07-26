import { renderToString } from 'react-dom/server';
import { installWindowStub } from '../../test/helpers/chrome-shell-stub';
import { StepBubble } from './StepBubble';

describe('StepBubble (SSR smoke)', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    if (restore) {
      restore();
      restore = null;
    }
  });

  it('renders nothing until a bubbles guide payload arrives', () => {
    const stub = installWindowStub();
    restore = stub.restore;
    expect(renderToString(<StepBubble />)).toBe('');
  });

  it('does not call any bridge method during render', () => {
    const stub = installWindowStub();
    restore = stub.restore;
    renderToString(<StepBubble />);
    expect(stub.calls).toEqual([]);
  });
});
