import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopAppMenubar } from '@/components/layouts/DesktopAppMenubar';

const bridge = vi.hoisted(() => ({
  showAppWindow: vi.fn(async () => undefined),
  quitApp: vi.fn(async () => undefined),
  showAbout: vi.fn(async () => undefined),
  toggleDevTools: vi.fn(async () => true),
}));

vi.mock('@/lib/agent-client', () => ({
  getPugyingDesktopBridge: () => bridge,
}));

describe('DesktopAppMenubar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders product menus', () => {
    const html = renderToString(<DesktopAppMenubar />);
    expect(html).toContain('data-slot="desktop-app-menubar"');
    expect(html).toContain('文件');
    expect(html).toContain('帮助');
  });

  it('shows the View menu in development', () => {
    expect(import.meta.env.DEV).toBe(true);
    const html = renderToString(<DesktopAppMenubar />);
    expect(html).toContain('查看');
  });
});
