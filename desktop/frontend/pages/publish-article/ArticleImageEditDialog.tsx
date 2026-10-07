import { toast } from '@/lib/app-toast';
import { getPugyingDesktopBridge } from '@/lib/agent-client';
import { ArticleImageCropDialog } from './ArticleImageCropDialog';

/** 确定后替换正文图片，原文件保留。 */
export function ArticleImageEditDialog({
  source,
  localPath,
  onClose,
  onSaved,
  returnFocus,
  allowZoom,
  title,
}: {
  source: string;
  localPath: string;
  onClose: () => void;
  onSaved: (path: string, preview: string) => void;
  returnFocus?: HTMLElement;
  allowZoom?: boolean;
  title?: string;
}) {
  return (
    <ArticleImageCropDialog
      source={source}
      onClose={onClose}
      returnFocus={returnFocus}
      allowZoom={allowZoom}
      title={title}
      onSave={async (canvas) => {
        const bridge = getPugyingDesktopBridge();
        if (!bridge?.saveArticleImage) {
          toast.add({ type: 'error', title: '请从桌面应用打开后再试' });
          return;
        }
        const data = canvas.toDataURL('image/png');
        const path = await bridge.saveArticleImage(data, localPath);
        if (path) {
          onSaved(path, data);
        } else {
          toast.add({ type: 'error', title: '图片保存失败，请重试' });
        }
      }}
    />
  );
}
