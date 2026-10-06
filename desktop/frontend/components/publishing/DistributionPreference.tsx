import { useEffect, useState } from "react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import {
  DEFAULT_DISTRIBUTION_CONCURRENCY,
  isDistributionConcurrency,
} from "@shared/distribution";

export function DistributionPreference() {
  const [value, setValue] = useState(String(DEFAULT_DISTRIBUTION_CONCURRENCY));
  const [savedValue, setSavedValue] = useState(
    DEFAULT_DISTRIBUTION_CONCURRENCY,
  );
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    const bridge = getPugyingDesktopBridge();
    if (!bridge?.getDistributionConcurrency) {
      setError("应用未就绪，请重启后再试");
      return;
    }
    void bridge
      .getDistributionConcurrency()
      .then((next) => {
        if (!disposed) {
          setValue(String(next));
          setSavedValue(next);
          setReady(true);
        }
      })
      .catch(() => {
        if (!disposed) {
          setError("无法读取分发设置，请重试");
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  const save = async () => {
    const next = Number(value);
    if (!isDistributionConcurrency(next)) {
      setError("请输入大于零的整数");
      return;
    }
    if (next === savedValue || saving) {
      return;
    }
    const bridge = getPugyingDesktopBridge();
    if (!bridge?.setDistributionConcurrency) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await bridge.setDistributionConcurrency(next);
      setSavedValue(saved);
      setValue(String(saved));
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Field
      orientation="horizontal"
      data-invalid={Boolean(error)}
      data-disabled={!ready || saving}
      className="justify-between gap-4 !items-center"
    >
      <FieldContent className="min-w-0 flex-1">
        <FieldLabel htmlFor="pref-distribution-concurrency">
          同时分发数量
        </FieldLabel>
        <FieldDescription>
          默认 3 个，超出的任务排队等待；同一账号按顺序分发。
        </FieldDescription>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </FieldContent>
      <Input
        id="pref-distribution-concurrency"
        className="w-24 shrink-0"
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        disabled={!ready || saving}
        aria-invalid={Boolean(error)}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError("");
        }}
        onBlur={() => {
          void save();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}
