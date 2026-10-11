/**
 * 网络代理偏好：开关 / 地址 / 端口均为草稿，唯有「应用」写盘。
 * 启用须测通当前 endpoint；关闭点应用即直连；改地址/端口清除测通标记。
 */
import { useEffect, useState } from "react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { toast } from "@/components/AppToaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import {
  DEFAULT_PROXY_SETTINGS,
  isProxyPort,
  type ProxySettings,
} from "@shared/proxy-settings";

function portToInput(port: number | null): string {
  return port === null ? "" : String(port);
}

function endpointKey(host: string, port: string): string {
  return `${host.trim()}|${port.trim()}`;
}

export function ProxyPreference() {
  const [enabled, setEnabled] = useState(DEFAULT_PROXY_SETTINGS.enabled);
  const [host, setHost] = useState(DEFAULT_PROXY_SETTINGS.host);
  const [port, setPort] = useState(portToInput(DEFAULT_PROXY_SETTINGS.port));
  const [saved, setSaved] = useState<ProxySettings>(DEFAULT_PROXY_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  /** 测试通过时对应的 host|port；改地址后失效 */
  const [verifiedKey, setVerifiedKey] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const bridge = getPugyingDesktopBridge();
    if (!bridge?.getProxySettings) {
      setError("应用未就绪，请重启后再试");
      return;
    }
    void bridge
      .getProxySettings()
      .then((next) => {
        if (!disposed) {
          setEnabled(next.enabled);
          setHost(next.host);
          setPort(portToInput(next.port));
          setSaved(next);
          setReady(true);
        }
      })
      .catch(() => {
        if (!disposed) {
          setError("无法读取代理设置，请重试");
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  const parsePortField = (): number | null | "invalid" => {
    const trimmedPort = port.trim();
    if (!trimmedPort) {
      return null;
    }
    const n = Number(trimmedPort);
    return isProxyPort(n) ? n : "invalid";
  };

  const buildDraft = (): ProxySettings | { error: string } => {
    const portValue = parsePortField();
    if (portValue === "invalid") {
      return { error: "请输入 1–65535 之间的端口" };
    }
    return {
      enabled,
      host: host.trim(),
      port: portValue,
    };
  };

  const dirty =
    ready &&
    (enabled !== saved.enabled ||
      host.trim() !== saved.host ||
      port.trim() !== portToInput(saved.port));

  const currentKey = endpointKey(host, port);
  const verified = verifiedKey === currentKey;
  // 有草稿改动才可应用；启用额外要求当前 endpoint 已测通
  const canApply = dirty && (!enabled || verified);

  const busy = !ready || saving || testing;
  const canTest = ready && !busy && Boolean(host.trim()) && Boolean(port.trim());

  const markEndpointDirty = () => {
    setVerifiedKey(null);
    setError("");
  };

  const runTest = async () => {
    const draft = buildDraft();
    if ("error" in draft) {
      setError(draft.error);
      return;
    }
    if (!draft.host) {
      setError("请输入服务器地址");
      return;
    }
    if (draft.port === null) {
      setError("请输入端口");
      return;
    }
    const bridge = getPugyingDesktopBridge();
    if (!bridge?.testProxySettings) {
      setError("应用未就绪，请重启后再试");
      return;
    }
    setTesting(true);
    setError("");
    try {
      const result = await bridge.testProxySettings({
        host: draft.host,
        port: draft.port,
      });
      if (result.ok) {
        setVerifiedKey(endpointKey(draft.host, String(draft.port)));
        // 测通后自动打开启用开关（仍为草稿，须点「应用」才生效）
        setEnabled(true);
        toast.add({ type: "success", title: result.message });
      } else {
        setVerifiedKey(null);
        setError(result.message);
      }
    } catch {
      setVerifiedKey(null);
      setError("测试失败，请重试");
    } finally {
      setTesting(false);
    }
  };

  const apply = async () => {
    const nextDraft = buildDraft();
    if ("error" in nextDraft) {
      setError(nextDraft.error);
      return;
    }
    if (nextDraft.enabled) {
      if (!nextDraft.host) {
        setError("请输入服务器地址");
        return;
      }
      if (nextDraft.port === null) {
        setError("请输入端口");
        return;
      }
      if (!verified) {
        setError("请先测试");
        return;
      }
    }
    if (
      nextDraft.enabled === saved.enabled &&
      nextDraft.host === saved.host &&
      nextDraft.port === saved.port
    ) {
      return;
    }
    const bridge = getPugyingDesktopBridge();
    if (!bridge?.setProxySettings) {
      setError("应用未就绪，请重启后再试");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const next = await bridge.setProxySettings(nextDraft);
      setSaved(next);
      setEnabled(next.enabled);
      setHost(next.host);
      setPort(portToInput(next.port));
      if (!next.enabled) {
        setVerifiedKey(null);
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "保存失败，请重试";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FieldGroup className="gap-4">
      <Field
        orientation="horizontal"
        data-invalid={Boolean(error)}
        data-disabled={busy || undefined}
        className="justify-between gap-4 !items-center"
      >
        <FieldContent className="min-w-0 flex-1">
          <FieldLabel htmlFor="pref-proxy-enabled">启用代理</FieldLabel>
          <FieldDescription>
            测通后再启用并应用；关闭后点应用即直连。
          </FieldDescription>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </FieldContent>
        <Switch
          id="pref-proxy-enabled"
          checked={enabled}
          disabled={busy}
          onCheckedChange={(checked) => {
            setEnabled(checked);
            setError("");
          }}
          aria-invalid={Boolean(error)}
        />
      </Field>

      <Field
        orientation="horizontal"
        data-disabled={busy || undefined}
        className="justify-between gap-4 !items-center"
      >
        <FieldContent className="min-w-0 flex-1">
          <FieldLabel htmlFor="pref-proxy-host">服务器地址</FieldLabel>
        </FieldContent>
        <Input
          id="pref-proxy-host"
          className="w-48 shrink-0"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          value={host}
          onChange={(event) => {
            setHost(event.target.value);
            markEndpointDirty();
          }}
        />
      </Field>

      <Field
        orientation="horizontal"
        data-disabled={busy || undefined}
        className="justify-between gap-4 !items-center"
      >
        <FieldContent className="min-w-0 flex-1">
          <FieldLabel htmlFor="pref-proxy-port">端口</FieldLabel>
          <FieldDescription>1–65535。</FieldDescription>
        </FieldContent>
        <Input
          id="pref-proxy-port"
          className="w-24 shrink-0"
          type="number"
          min={1}
          max={65535}
          step={1}
          inputMode="numeric"
          disabled={busy}
          value={port}
          onChange={(event) => {
            setPort(event.target.value);
            markEndpointDirty();
          }}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!canTest}
          onClick={() => {
            void runTest();
          }}
        >
          {testing ? "测试中…" : "测试"}
        </Button>
        <Button
          type="button"
          disabled={!canApply || busy}
          onClick={() => {
            void apply();
          }}
        >
          应用
        </Button>
      </div>
    </FieldGroup>
  );
}
