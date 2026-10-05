import { useId } from 'react';
import type { Editor } from '@tiptap/react';
import { Ellipsis, Minus, Strikethrough } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Toggle } from '@/components/ui/toggle';

export function ArticleFormatPopover({
  editor,
  disabled,
  state,
}: {
  editor: Editor | null;
  disabled?: boolean;
  state: {
    strike: boolean;
    alignment: string;
    color: string;
    backgroundColor: string;
  };
}) {
  const style = (key: string, value: string) => {
    editor
      ?.chain()
      .focus()
      .setMark('articleTextStyle', { [key]: value || null })
      .run();
  };
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="更多格式"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
          />
        }
      >
        <Ellipsis />
      </PopoverTrigger>
      <PopoverContent
        className="article-editor-tools w-72"
        finalFocus={() => editor?.view.dom}
      >
        <PopoverTitle>更多格式</PopoverTitle>
        <FieldGroup className="gap-3">
          <div className="flex items-center gap-2">
            <Toggle
              size="sm"
              aria-label="删除线"
              pressed={state.strike}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onPressedChange={() =>
                editor?.chain().focus().toggleStrike().run()
              }
            >
              <Strikethrough />
            </Toggle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor?.chain().focus().setHorizontalRule().run()}
            >
              <Minus data-icon="inline-start" />
              分割线
            </Button>
          </div>
          <FormatSelect
            label="对齐"
            value={state.alignment}
            disabled={disabled}
            options={[
              ['left', '左对齐'],
              ['center', '居中'],
              ['right', '右对齐'],
            ]}
            onChange={(value) =>
              editor
                ?.chain()
                .focus()
                .updateAttributes('paragraph', { textAlign: value })
                .updateAttributes('heading', { textAlign: value })
                .run()
            }
          />
          <FormatSelect
            label="文字颜色"
            value={state.color}
            disabled={disabled}
            options={[
              ['', '默认'],
              ['#b91c1c', '红色'],
              ['#1d4ed8', '蓝色'],
              ['#15803d', '绿色'],
            ]}
            onChange={(value) => style('color', value)}
          />
          <FormatSelect
            label="背景色"
            value={state.backgroundColor}
            disabled={disabled}
            options={[
              ['', '无'],
              ['#fef08a', '黄色'],
              ['#bfdbfe', '蓝色'],
            ]}
            onChange={(value) => style('backgroundColor', value)}
          />
        </FieldGroup>
        <p className="text-xs text-muted-foreground">
          部分平台会简化扩展样式，可在预览中查看。
        </p>
      </PopoverContent>
    </Popover>
  );
}

function FormatSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id} className="font-normal">
        {label}
      </FieldLabel>
      <NativeSelect
        id={id}
        size="sm"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([key, text]) => (
          <NativeSelectOption key={key} value={key}>
            {text}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
