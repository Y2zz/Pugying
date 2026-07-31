import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Logo } from '@/components/Logo';
import { register } from '@/lib/api';

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    setLoading(true);
    try {
      await register({
        email: email.trim(),
        username: username.trim(),
        password,
      });
      void navigate('/login', {
        replace: true,
        state: {
          registered: true,
          email: email.trim(),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo className="size-10" />
          <h1 className="text-xl font-semibold">注册 Pugying</h1>
          <p className="text-sm text-muted-foreground">注册后需管理员邀请加入团队，才能登录使用</p>
        </div>

        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <FieldGroup className="gap-4">
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="register-email">邮箱</FieldLabel>
              <Input
                id="register-email"
                type="email"
                autoComplete="email"
                value={email}
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                required
              />
            </Field>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="register-username">用户名</FieldLabel>
              <Input
                id="register-username"
                type="text"
                autoComplete="username"
                value={username}
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                  setUsername(e.target.value);
                }}
                required
              />
            </Field>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="register-password">密码</FieldLabel>
              <Input
                id="register-password"
                type="password"
                autoComplete="new-password"
                value={password}
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
                required
                minLength={6}
              />
            </Field>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="register-confirm-password">确认密码</FieldLabel>
              <Input
                id="register-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                }}
                required
                minLength={6}
              />
            </Field>

            {error ? <FieldError>{error}</FieldError> : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Spinner data-icon="inline-start" /> : null}
              {loading ? '注册中…' : '注册'}
            </Button>
          </FieldGroup>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          已有账号？{' '}
          <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
