import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createContent, fetchContent, updateContent, type ContentStatus } from '@/lib/api';

export default function PublishArticle() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [imageUrls, setImageUrls] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editId) {
      return;
    }
    let cancelled = false;
    void fetchContent(editId)
      .then((item) => {
        if (cancelled) {
          return;
        }
        setTitle(item.title);
        setBody(item.body ?? '');
        setCoverUrl(item.coverUrl ?? '');
        setImageUrls(item.mediaUrls.join('\n'));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载内容失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);

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
      coverUrl: coverUrl.trim(),
      mediaUrls: imageUrls
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      status,
    };
    try {
      if (editId) {
        await updateContent(editId, payload);
      } else {
        await createContent({ type: 'article', ...payload });
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
          <CardDescription>填写标题与正文，可附上封面与图片素材链接；保存后可在「内容管理」中查看</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            {error ? <FieldError>{error}</FieldError> : null}
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
              <FieldLabel htmlFor="article-cover">封面图 URL（可选）</FieldLabel>
              <Input
                id="article-cover"
                placeholder="https://…"
                disabled={loading}
                value={coverUrl}
                onChange={(e) => {
                  setCoverUrl(e.target.value);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="article-images">图片链接（可选，每行一个）</FieldLabel>
              <Textarea
                id="article-images"
                placeholder={'https://…\nhttps://…'}
                className="min-h-20"
                disabled={loading}
                value={imageUrls}
                onChange={(e) => {
                  setImageUrls(e.target.value);
                }}
              />
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
