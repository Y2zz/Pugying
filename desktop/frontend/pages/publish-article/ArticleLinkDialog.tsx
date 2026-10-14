import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { normalizeArticleLink } from './article-editor-paste';

export function ArticleLinkDialog({
  href,
  returnFocus,
  onClose,
  onConfirm,
  onRemove,
}: {
  href: string;
  returnFocus: HTMLElement;
  onClose: () => void;
  onConfirm: (href: string) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState(href);
  const [error, setError] = useState('');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent finalFocus={() => returnFocus} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{href ? '编辑链接' : '插入链接'}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = normalizeArticleLink(value);
            if (!normalized) {
              setError('请输入有效的网页链接');
              return;
            }
            onConfirm(normalized);
          }}
        >
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={id} className="font-normal">
              链接地址
            </FieldLabel>
            <Input
              id={id}
              value={value}
              placeholder="https://"
              autoComplete="off"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                setValue(event.target.value);
                setError('');
              }}
            />
            {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
          </Field>
          <DialogFooter>
            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                onClick={onRemove}
              >
                移除链接
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">确定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
