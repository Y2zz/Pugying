import type { ReactNode } from 'react';
import { Grid2x2, LayoutGrid, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTheme } from '@/components/ThemeProvider';
import { useUiDensity } from '@/hooks/use-ui-density';
import type { UiDensity } from '@/lib/ui-density';

type ThemeChoice = 'light' | 'dark' | 'system';

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string; icon: LucideIcon }> = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '自动', icon: Monitor },
];

/** 主题选项文案：作为 Select items.label / Item 子节点，触发器靠 items 自动带出图标 */
function ThemeOptionLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="size-5 shrink-0" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

const THEME_SELECT_ITEMS = THEME_OPTIONS.map((opt) => ({
  value: opt.value,
  label: <ThemeOptionLabel icon={opt.icon} label={opt.label} />,
}));

const DENSITY_OPTIONS: Array<{ value: UiDensity; label: string; icon: typeof LayoutGrid }> = [
  { value: 'comfortable', label: '舒适', icon: LayoutGrid },
  { value: 'compact', label: '紧凑', icon: Grid2x2 },
];

/** 设置行：左文案、右控件。 */
function PreferenceRow({
  labelId,
  label,
  description,
  control,
}: {
  labelId: string;
  label: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <Field orientation="horizontal" className="justify-between gap-4 !items-center">
      <FieldContent className="min-w-0 flex-1">
        <FieldLabel id={labelId}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <div className="shrink-0 self-center">{control}</div>
    </Field>
  );
}

/**
 * 用户偏好：本机持久化（主题 / 列表密度），不走服务端。
 * 字号跟随 shadcn vega 默认刻度，不提供单独偏好项。
 */
export default function Preferences() {
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = useUiDensity();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader title="偏好设置" description="保存在本机，切换后立即生效。" />

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">外观</h2>
        <Card>
          <CardContent className="gap-4">
            <FieldGroup className="gap-4">
              <PreferenceRow
                labelId="pref-theme-label"
                label="主题"
                description="浅色、深色，或自动跟随系统。"
                control={
                  <Select
                    value={theme}
                    onValueChange={(value) => {
                      if (value === 'light' || value === 'dark' || value === 'system') {
                        setTheme(value);
                      }
                    }}
                    items={THEME_SELECT_ITEMS}
                  >
                    <SelectTrigger aria-labelledby="pref-theme-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectGroup>
                        {THEME_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <ThemeOptionLabel icon={opt.icon} label={opt.label} />
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                }
              />
            </FieldGroup>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">列表</h2>
        <Card>
          <CardContent className="gap-4">
            <FieldGroup className="gap-4">
              <PreferenceRow
                labelId="pref-density-label"
                label="密度"
                description="影响作品管理等卡片列表的列宽与间距。"
                control={
                  <ToggleGroup
                    aria-labelledby="pref-density-label"
                    variant="outline"
                    spacing={0}
                    value={[density]}
                    onValueChange={(values) => {
                      const next = values[0];
                      if (next === 'comfortable' || next === 'compact') {
                        setDensity(next);
                      }
                    }}
                  >
                    {DENSITY_OPTIONS.map((opt) => (
                      <ToggleGroupItem key={opt.value} value={opt.value} aria-label={opt.label}>
                        <opt.icon data-icon="inline-start" />
                        {opt.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                }
              />
            </FieldGroup>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
