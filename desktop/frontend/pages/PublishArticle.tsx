import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createContent,
  fetchContent,
  getLocalFilePath,
  updateContent,
  uploadContentCover,
  type ContentStatus,
} from '@/lib/api';
import {
  LOCAL_PATH_MISSING_IMAGE,
  checkLocalPathsReadable,
} from '@/pages/publish-video/helpers';

export default function PublishArticle() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaPaths, setMediaPaths] = useState<string[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [hasCover, setHasCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));
  const [contentStatus, setContentStatus] = useState<ContentStatus | null>(null);
  const [error, setError] = useState('');
  const [pathWarning, setPathWarning] = useState('');

  useEffect(() => {
    if (!editId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const item = await fetchContent(editId);
        if (cancelled) {
          return;
        }
        setTitle(item.title);
        setBody(item.body ?? '');
        const paths = item.mediaPaths ?? [];
        setMediaPaths(paths);
        setHasCover(item.hasCover);
        setContentStatus(item.status);
        if (paths.length > 0) {
          const readable = await checkLocalPathsReadable(paths);
          if (cancelled) {
            return;
          }
          setPathWarning(readable ? '' : LOCAL_PATH_MISSING_IMAGE);
        } else {
          setPathWarning('');
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载内容失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const onPickImages = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }
    const next: string[] = [];
    for (const file of Array.from(files)) {
      const path = getLocalFilePath(file);
      if (!path) {
        setError(
          '无法获取本机图片路径。请确认在桌面应用内选择本地图片文件。',
        );
        return;
      }
      next.push(path);
    }
    setError('');
    setMediaPaths((prev) => {
      const merged = [...prev, ...next];
      void checkLocalPathsReadable(merged).then((readable) => {
        setPathWarning(readable ? '' : LOCAL_PATH_MISSING_IMAGE);
      });
      return merged;
    });
  };

  const onPickCover = (file: File | null) => {
    if (!file) {
      return;
    }
    setCoverFile(file);
    setError('');
  };

  const submit = async (status: ContentStatus) => {
    if (!title.trim()) {
      setError('请填写标题');
      return;
    }
    setBusy(true);
    setError('');
    const payload = {
      title: title.trim(),
      body: body.trim(),
      mediaPaths,
      // 已发布作品保存时不得退回草稿
      ...(status === 'draft' && contentStatus === 'published' ? {} : { status }),
    };
    try {
      let contentId = editId;
      if (contentId) {
        await updateContent(contentId, payload);
      } else {
        const created = await createContent({ type: 'article', ...payload });
        contentId = created.id;
      }
      if (coverFile && contentId) {
        await uploadContentCover(contentId, 'portrait', coverFile, coverFile.name || 'cover.jpg');
        setCoverFile(null);
        setHasCover(true);
      }
      void navigate('/contents');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText />
            {editId ? '编辑图文' : '发布图文'}
          </CardTitle>
          <CardDescription>
            填写标题与正文，可附上本机图片路径与封面；发布依赖本机文件，请勿移动或删除已选文件
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            {error ? <FieldError>{error}</FieldError> : null}
            {pathWarning ? <FieldError>{pathWarning}</FieldError> : null}
            <Field>
              <FieldLabel htmlFor="article-title">标题</FieldLabel>
              <Input
                id="article-title"
                placeholder="请输入标题"
                maxLength={200}
                disabled={loading}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="article-body">正文</FieldLabel>
              <Textarea
                id="article-body"
                placeholder="请输入正文内容"
                className="min-h-40"
                disabled={loading}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                }}
              />
            </Field>
            <Field>
              <FieldLabel>封面图（可选）</FieldLabel>
              <FieldDescription>
                {coverFile
                  ? `已选择：${coverFile.name}`
                  : hasCover
                    ? '已有封面；重新选择将在保存时覆盖'
                    : '保存内容后再上传封面'}
              </FieldDescription>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={loading || busy}
                onChange={(e) => {
                  onPickCover(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={loading || busy}
                onClick={() => {
                  coverInputRef.current?.click();
                }}
              >
                选择封面
              </Button>
            </Field>
            <Field>
              <FieldLabel>图片素材（可选，本机路径）</FieldLabel>
              <FieldDescription>
                {mediaPaths.length > 0
                  ? `已选 ${mediaPaths.length} 个文件`
                  : '通过对话框选择本机图片'}
              </FieldDescription>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={loading || busy}
                onChange={(e) => {
                  onPickImages(e.target.files);
                  e.target.value = '';
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || busy}
                  onClick={() => {
                    imageInputRef.current?.click();
                  }}
                >
                  添加图片
                </Button>
                {mediaPaths.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={loading || busy}
                    onClick={() => {
                      setMediaPaths([]);
                      setPathWarning('');
                    }}
                  >
                    清空
                  </Button>
                ) : null}
              </div>
              {mediaPaths.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {mediaPaths.map((path) => (
                    <li key={path} className="truncate" title={path}>
                      {path}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => {
              void submit('draft');
            }}
          >
            <Save data-icon="inline-start" />
            存草稿
          </Button>
          <Button
            disabled={busy || loading}
            onClick={() => {
              void submit('published');
            }}
          >
            <Send data-icon="inline-start" />
            发布
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
