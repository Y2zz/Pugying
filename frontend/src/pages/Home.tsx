import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// 基础联系表单
function BasicContactForm() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      newErrors.name = '请输入姓名';
    }
    if (!form.email.trim()) {
      newErrors.email = '请输入邮箱';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = '邮箱格式不正确';
    }
    if (!form.message.trim()) {
      newErrors.message = '请输入留言内容';
    }
    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = validate();
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      setSubmitted(true);
    }
  };

  const handleReset = () => {
    setForm({ name: '', email: '', message: '' });
    setErrors({});
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>基础联系表单</CardTitle>
          <CardDescription>表单提交成功！</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="font-medium">姓名：</span>
              {form.name}
            </p>
            <p>
              <span className="font-medium">邮箱：</span>
              {form.email}
            </p>
            <p>
              <span className="font-medium">留言：</span>
              {form.message}
            </p>
          </div>
          <Button className="mt-4" variant="outline" onClick={handleReset}>
            重新填写
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>基础联系表单</CardTitle>
        <CardDescription>包含 Input、Textarea 及手动验证逻辑</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="name">姓名</FieldLabel>
              <Input
                id="name"
                placeholder="请输入您的姓名"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                aria-invalid={!!errors.name}
              />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="email">邮箱</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="example@domain.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                aria-invalid={!!errors.email}
              />
              {errors.email ? <FieldError>{errors.email}</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="message">留言</FieldLabel>
              <Textarea
                id="message"
                placeholder="请输入您的留言内容..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                aria-invalid={!!errors.message}
              />
              {errors.message ? <FieldError>{errors.message}</FieldError> : null}
            </Field>

            <div className="flex gap-2">
              <Button type="submit">提交</Button>
              <Button type="button" variant="outline" onClick={handleReset}>
                重置
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// 内容发布表单（含 Select、Checkbox、Switch）
function ContentPublishForm() {
  const [form, setForm] = useState({
    title: '',
    platform: '',
    category: '',
    content: '',
    enableComments: true,
    isPublic: false,
    scheduledPublish: false,
  });
  const [submitted, setSubmitted] = useState(false);

  const platforms = [
    { value: 'douyin', label: '抖音' },
    { value: 'toutiao', label: '今日头条' },
    { value: 'wechat', label: '视频号' },
    { value: 'bilibili', label: '哔哩哔哩' },
    { value: 'xiaohongshu', label: '小红书' },
  ];

  const categories = [
    { value: 'article', label: '图文' },
    { value: 'video', label: '短视频' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    const selectedPlatform = platforms.find((p) => p.value === form.platform);
    const selectedCategory = categories.find((c) => c.value === form.category);
    return (
      <Card>
        <CardHeader>
          <CardTitle>内容发布表单</CardTitle>
          <CardDescription>提交结果预览</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="font-medium">标题：</span>
              {form.title}
            </p>
            <p>
              <span className="font-medium">平台：</span>
              {selectedPlatform?.label ?? '未选择'}
            </p>
            <p>
              <span className="font-medium">类型：</span>
              {selectedCategory?.label ?? '未选择'}
            </p>
            <p>
              <span className="font-medium">允许评论：</span>
              {form.enableComments ? '是' : '否'}
            </p>
            <p>
              <span className="font-medium">公开可见：</span>
              {form.isPublic ? '是' : '否'}
            </p>
            <p>
              <span className="font-medium">定时发布：</span>
              {form.scheduledPublish ? '是' : '否'}
            </p>
          </div>
          <Button className="mt-4" variant="outline" onClick={() => setSubmitted(false)}>
            返回编辑
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>内容发布表单</CardTitle>
        <CardDescription>综合演示 Select、Checkbox、Switch 组件用法</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="title">内容标题</FieldLabel>
              <Input id="title" placeholder="请输入内容标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>发布平台</FieldLabel>
                <Select value={form.platform} onValueChange={(val) => setForm({ ...form, platform: val ?? '' })} items={platforms}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择平台" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {platforms.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel>内容类型</FieldLabel>
                <Select value={form.category} onValueChange={(val) => setForm({ ...form, category: val ?? '' })} items={categories}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categories.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="content">正文内容</FieldLabel>
              <Textarea
                id="content"
                placeholder="请输入发布内容..."
                rows={4}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </Field>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <FieldLabel htmlFor="comments">允许评论</FieldLabel>
                  <p className="text-xs text-muted-foreground">开启后用户可在内容下方留言</p>
                </div>
                <Switch id="comments" checked={form.enableComments} onCheckedChange={(v) => setForm({ ...form, enableComments: v })} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <FieldLabel htmlFor="public">公开可见</FieldLabel>
                  <p className="text-xs text-muted-foreground">关闭后仅团队成员可查看</p>
                </div>
                <Switch id="public" checked={form.isPublic} onCheckedChange={(v) => setForm({ ...form, isPublic: v })} />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="scheduled" checked={form.scheduledPublish} onCheckedChange={(v) => setForm({ ...form, scheduledPublish: !!v })} />
                <FieldLabel htmlFor="scheduled">定时发布</FieldLabel>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit">发布内容</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setForm({
                    title: '',
                    platform: '',
                    category: '',
                    content: '',
                    enableComments: true,
                    isPublic: false,
                    scheduledPublish: false,
                  })
                }
              >
                重置
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// 登录表单（演示 disabled 状态与 loading）
function LoginForm() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const isValid = form.username.trim() !== '' && form.password.trim() !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      return;
    }
    setLoading(true);
    setResult(null);
    setTimeout(() => {
      setLoading(false);
      setResult(`登录成功！欢迎 ${form.username}`);
    }, 1500);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>登录表单</CardTitle>
        <CardDescription>演示 disabled 状态与异步提交反馈</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="username">用户名</FieldLabel>
              <Input
                className="focus-visible:ring-0"
                id="username"
                placeholder="请输入用户名"
                value={form.username}
                disabled={loading}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="password">密码</FieldLabel>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                value={form.password}
                disabled={loading}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>

            {result ? <p className="text-sm text-muted-foreground">{result}</p> : null}

            <Button type="submit" disabled={!isValid || loading} className="w-full">
              {loading ? '登录中...' : '登录'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// 输入类型展示
function InputTypesDemo() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>输入类型展示</CardTitle>
        <CardDescription>各种 HTML input type 的样式表现</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="text">text</FieldLabel>
            <Input id="text" type="text" placeholder="普通文本" />
          </Field>
          <Field>
            <FieldLabel htmlFor="email-type">email</FieldLabel>
            <Input id="email-type" type="email" placeholder="user@example.com" />
          </Field>
          <Field>
            <FieldLabel htmlFor="password-type">password</FieldLabel>
            <Input id="password-type" type="password" placeholder="密码" />
          </Field>
          <Field>
            <FieldLabel htmlFor="number">number</FieldLabel>
            <Input id="number" type="number" placeholder="数字" />
          </Field>
          <Field>
            <FieldLabel htmlFor="tel">tel</FieldLabel>
            <Input id="tel" type="tel" placeholder="电话号码" />
          </Field>
          <Field>
            <FieldLabel htmlFor="url">url</FieldLabel>
            <Input id="url" type="url" placeholder="https://example.com" />
          </Field>
          <Field>
            <FieldLabel htmlFor="date">date</FieldLabel>
            <Input id="date" type="date" />
          </Field>
          <Field>
            <FieldLabel htmlFor="search">search</FieldLabel>
            <Input id="search" type="search" placeholder="搜索..." />
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <FieldLabel htmlFor="disabled-input">disabled 状态</FieldLabel>
          <Input id="disabled-input" type="text" value="不可编辑的内容" disabled />
        </div>
      </CardContent>
    </Card>
  );
}

export function Home() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">表单演示</h1>
        <p className="text-sm text-muted-foreground">基于 shadcn/ui（Base UI）组件的表单示例集合</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BasicContactForm />
        <ContentPublishForm />
        <LoginForm />
        <InputTypesDemo />
      </div>
    </div>
  );
}

export default Home;
