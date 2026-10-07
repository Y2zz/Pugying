import { useEffect, useState } from "react";
import type {
  BilibiliVideoOptions,
  BilibiliVideoSettings,
} from "@shared/bilibili-video-settings";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ArticleRadioField } from "../publish-article/account-forms/ArticleRadioField";

export function BilibiliVideoFields({
  accountId,
  value,
  onChange,
  disabled,
}: {
  accountId: string;
  value?: BilibiliVideoSettings;
  onChange: (value: BilibiliVideoSettings) => void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<BilibiliVideoOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setOptions(null);
    const read = getPugyingDesktopBridge()?.getBilibiliVideoOptions;
    void (read ? read(accountId) : Promise.resolve(null))
      .catch(() => null)
      .then((result) => {
        if (active) {
          setOptions(result);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [accountId, attempt]);
  const patch = (partial: Partial<BilibiliVideoSettings>) =>
    onChange({ partitionId: 0, copyright: 1, ...value, ...partial });
  const partitions =
    options?.partitions.map((item) => ({
      value: String(item.id),
      label: `${item.group} / ${item.name}`,
    })) ?? [];
  const declarations = [
    { value: "none", label: "不添加" },
    ...(options?.declarations.map((item) => ({
      value: String(item.id),
      label: item.content,
    })) ?? []),
  ];
  return (
    <>
      {loading ? (
        <p className="text-sm text-muted-foreground">正在读取投稿选项…</p>
      ) : !options ? (
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">暂时无法读取投稿选项</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setAttempt(attempt + 1)}
          >
            重试
          </Button>
        </div>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`video-partition-${accountId}`}>分区</FieldLabel>
        <Select
          items={partitions}
          value={value?.partitionId ? String(value.partitionId) : null}
          disabled={disabled || loading || !partitions.length}
          onValueChange={(id) => {
            if (id) {
              patch({ partitionId: Number(id) });
            }
          }}
        >
          <SelectTrigger id={`video-partition-${accountId}`} className="w-full">
            <SelectValue placeholder="请选择分区" />
          </SelectTrigger>
          <SelectContent>
            {partitions.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <ArticleRadioField
        id={`video-copyright-${accountId}`}
        label="版权"
        value={String(value?.copyright ?? 1)}
        disabled={disabled}
        options={[
          { value: "1", label: "自制" },
          { value: "2", label: "转载" },
        ]}
        onChange={(copyright) =>
          patch({ copyright: copyright === "2" ? 2 : 1 })
        }
      />
      {value?.copyright === 2 ? (
        <Field>
          <FieldLabel htmlFor={`video-source-${accountId}`}>
            转载来源
          </FieldLabel>
          <Input
            id={`video-source-${accountId}`}
            value={value.source ?? ""}
            maxLength={1000}
            disabled={disabled}
            onChange={(event) => patch({ source: event.target.value })}
            placeholder="填写原视频来源"
          />
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`video-declaration-${accountId}`}>
          创作声明
        </FieldLabel>
        <Select
          items={declarations}
          value={
            value?.creationStatementId
              ? String(value.creationStatementId)
              : "none"
          }
          disabled={disabled || loading || !options}
          onValueChange={(id) => {
            if (id) {
              patch({
                creationStatementId: id === "none" ? undefined : Number(id),
              });
            }
          }}
        >
          <SelectTrigger
            id={`video-declaration-${accountId}`}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {declarations.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}
