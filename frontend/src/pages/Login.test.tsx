import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Login from '@/pages/Login';

function renderLogin(): string {
  return renderToString(
    <MemoryRouter initialEntries={['/login']}>
      <Login />
    </MemoryRouter>
  );
}

describe('Login (SSR)', () => {
  it('renders the login card with heading and hint', () => {
    const html = renderLogin();

    expect(html).toContain('登录 Pugying');
    expect(html).toContain('可测选团队');
  });

  it('renders email and password fields with the demo defaults', () => {
    const html = renderLogin();

    expect(html).toContain('邮箱');
    expect(html).toContain('密码');
    expect(html).toContain('id="email"');
    expect(html).toContain('id="password"');
    expect(html).toContain('admin@pugying.local');
  });

  it('renders the submit button in its idle state', () => {
    const html = renderLogin();

    expect(html).toContain('type="submit"');
    expect(html).not.toContain('登录中');
  });
});
