import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Logo } from '@/components/Logo';
import { fetchMyTeams, isLoginRequiresTeamSelection, login, selectTeam, setSession, setStoredTeam, type TeamOption } from '@/lib/api';

type LoginLocationState = {
  from?: string;
  registered?: boolean;
  email?: string;
} | null;

function friendlyLoginError(message: string): string {
  if (/any team/i.test(message)) {
    return '账号尚未加入任何团队，请联系管理员邀请后再登录';
  }
  return message;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LoginLocationState;
  const from = state?.from ?? '/dashboard';

  const [email, setEmail] = useState(state?.email ?? 'admin@pugying.local');
  const [password, setPassword] = useState(state?.registered ? '' : 'Admin123!');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    state?.registered ? '注册成功。请等待管理员邀请加入团队后再登录。' : '',
  );
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<TeamOption[] | null>(null);
  const [loginTicket, setLoginTicket] = useState<string | null>(null);

  const resolveTeamAfterLogin = async (teamId: string | null) => {
    if (!teamId) {
      return;
    }
    try {
      const list = await fetchMyTeams();
      const match = list.find((item) => item.id === teamId);
      if (match) {
        setStoredTeam(match);
      }
    } catch {
      // Header will retry via useTeam
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (isLoginRequiresTeamSelection(result)) {
        setLoginTicket(result.loginTicket);
        setTeams(result.teams);
        return;
      }
      setSession(result.accessToken, result.user);
      await resolveTeamAfterLogin(result.user.teamId);
      void navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyLoginError(err instanceof Error ? err.message : '登录失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTeam = async (team: TeamOption) => {
    if (!loginTicket) {
      return;
    }
    setError('');
    setLoading(true);
    try {
      await selectTeam(loginTicket, team);
      void navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '选择团队失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo className="size-10" />
          <h1 className="text-xl font-semibold">登录 Pugying</h1>
          <p className="text-sm text-muted-foreground">admin@pugying.local / Admin123!（加入 default + demo，可测选团队）</p>
        </div>

        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        {teams && loginTicket ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">请选择要进入的团队</p>
            {teams.map((team) => (
              <Button
                key={team.id}
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={loading}
                onClick={() => {
                  void handleSelectTeam(team);
                }}
              >
                {team.displayName}
                <span className="ml-auto text-xs text-muted-foreground">{team.name}</span>
              </Button>
            ))}
            {error ? <FieldError>{error}</FieldError> : null}
          </div>
        ) : (
          <>
            <form
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
            >
              <FieldGroup className="gap-4">
                <Field data-invalid={error ? true : undefined}>
                  <FieldLabel htmlFor="email">邮箱</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    aria-invalid={error ? true : undefined}
                    onChange={(e) => {
                      setEmail(e.target.value);
                    }}
                    required
                  />
                </Field>
                <Field data-invalid={error ? true : undefined}>
                  <FieldLabel htmlFor="password">密码</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    aria-invalid={error ? true : undefined}
                    onChange={(e) => {
                      setPassword(e.target.value);
                    }}
                    required
                  />
                </Field>

                {error ? <FieldError>{error}</FieldError> : null}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Spinner data-icon="inline-start" /> : null}
                  {loading ? '登录中…' : '登录'}
                </Button>
              </FieldGroup>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              还没有账号？{' '}
              <Link to="/register" className="text-foreground underline-offset-4 hover:underline">
                自行注册
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
