import { useCallback, useEffect, useState } from 'react';
import type { ToutiaoRewardPrivilege } from '@shared/toutiao-article-privileges';
import { getPugyingDesktopBridge } from '@/lib/agent-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';

export function ToutiaoRewardField({
  accountId,
  checked,
  disabled,
  onChange,
}: {
  accountId: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [snapshot, setSnapshot] = useState<{
    accountId: string;
    privilege: ToutiaoRewardPrivilege | null;
  } | null>(null);
  const privilege = snapshot?.accountId === accountId ? snapshot.privilege : null;
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);
  useEffect(() => {
    let active = true;
    let pending = false;
    const fetchPrivilege = async () => {
      if (pending) {
        return;
      }
      pending = true;
      setLoading(true);
      let result: ToutiaoRewardPrivilege | null = null;
      try {
        result = (await getPugyingDesktopBridge()?.getToutiaoRewardPrivilege?.(accountId)) ?? null;
      } catch {
        // 不用固定次数代替平台失败结果。
      }
      if (active) {
        setSnapshot({ accountId, privilege: result });
        setLoading(false);
      }
      pending = false;
    };
    setSnapshot(null);
    void fetchPrivilege();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchPrivilege();
      }
    }, 60000);
    const onFocus = () => {
      void fetchPrivilege();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [accountId, refreshVersion]);

  useEffect(() => {
    if (privilege && !privilege.available && checked) {
      onChange(false);
    }
  }, [privilege, checked, onChange]);

  const unavailable = disabled || loading || !privilege || !privilege.available;
  const id = `article-${accountId}-allowReward`;
  return (
    <FieldGroup className="gap-3">
      <Field orientation="horizontal" data-disabled={unavailable || undefined}>
        <Checkbox
          id={id}
          checked={privilege?.available === false ? false : checked}
          disabled={unavailable}
          onCheckedChange={onChange}
        />
        <FieldLabel htmlFor={id} className="font-normal">{privilege?.label ?? '允许赞赏'}</FieldLabel>
      </Field>
      {!privilege ? (
        <FieldDescription>
          {loading ? '正在读取赞赏次数' : '赞赏次数暂未获取'}
          {!loading ? (
            <Button type="button" variant="link" size="xs" disabled={disabled} onClick={refresh}>
              刷新
            </Button>
          ) : null}
        </FieldDescription>
      ) : null}
    </FieldGroup>
  );
}
