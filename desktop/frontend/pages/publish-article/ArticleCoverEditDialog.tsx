import { useRef, useState } from 'react';
import type { EditCoverSavedResult } from '@/components/EditCoverDialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import type { CoverKind } from '@/lib/api';
import { MAX_COVER_UPLOAD_BYTES } from '../publish-video/helpers';
import { ArticleImageCropDialog } from './ArticleImageCropDialog';
import { COVER_ASPECT_RATIO } from './helpers';

/** 封面沿用正文图片的裁剪方式，按当前封面槽锁定比例。 */
export function ArticleCoverEditDialog({
  aspect,
  initialSourceUrl,
  onClose,
  onSaved,
}: {
  aspect: CoverKind;
  initialSourceUrl: string | null;
  onClose: () => void;
  onSaved: (result: EditCoverSavedResult) => void;
}) {
  const [source, setSource] = useState(initialSourceUrl || '');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <ArticleImageCropDialog
      key={source}
      source={source}
      title={aspect === 'portrait' ? '编辑竖版封面（3:4）' : '编辑横版封面（4:3）'}
      fixedRatio={COVER_ASPECT_RATIO[aspect]}
      onClose={onClose}
      imageAction={(saving) => (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            aria-label="选择封面图片"
            className="hidden"
            disabled={saving || loading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) {
                return;
              }
              if (!file.type.startsWith('image/')) {
                toast.add({ type: 'error', title: '请选择图片文件' });
                return;
              }
              if (file.size > MAX_COVER_UPLOAD_BYTES) {
                toast.add({
                  type: 'error',
                  title: `请选择不超过 ${Math.round(MAX_COVER_UPLOAD_BYTES / (1024 * 1024))}MB 的图片`,
                });
                return;
              }
              setLoading(true);
              try {
                const data = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => reject(new Error('Image read failed'));
                  reader.readAsDataURL(file);
                });
                setSource(data);
              } catch {
                toast.add({ type: 'error', title: '图片无法读取，请重新选择' });
              } finally {
                setLoading(false);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={saving || loading}
            onClick={() => inputRef.current?.click()}
          >
            {loading ? '读取中…' : source ? '更换图片' : '选择图片'}
          </Button>
        </>
      )}
      onSave={async (canvas) => {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (result) {
                resolve(result);
              } else {
                reject(new Error('Image export failed'));
              }
            },
            'image/jpeg',
            0.92,
          );
        });
        if (blob.size > MAX_COVER_UPLOAD_BYTES) {
          toast.add({ type: 'error', title: '封面太大，请缩小裁剪范围' });
          return;
        }
        onSaved({
          sourceUrl: source,
          croppedFile: new File([blob], `cover-${aspect}.jpg`, {
            type: 'image/jpeg',
          }),
          sourceFrameTime: null,
        });
        onClose();
      }}
    />
  );
}
