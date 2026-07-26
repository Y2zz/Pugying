import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';
import {
  fetchMyTeams,
  isLoginRequiresTeamSelection,
  login,
  selectTeam,
  setSession,
  setStoredTeam,
  type TeamOption,
} from '@/lib/api';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [email, setEmail] = useState('admin@pugying.local');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
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
      setError(err instanceof Error ? err.message : '登录失败');
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
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo className="size-10" />
          <h1 className="text-xl font-semibold">登录 Pugying</h1>
          <p className="text-sm text-muted-foreground">
            admin@pugying.local / Admin123!（加入 default + demo，可测选团队）
          </p>
        </div>

        {teams && loginTicket ? (
          <div className="space-y-3">
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
                <span className="ml-auto text-xs text-muted-foreground">
                  {team.name}
                </span>
              </Button>
            ))}
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
                required
              />
            </div>

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '登录中…' : '登录'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
