import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb.tsx';

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  contents: '内容管理',
  'media-library': '媒体库',
  'platform-accounts': '媒体账号',
  publish: '发布',
  article: '图文',
  video: '视频',
  admin: '管理',
};

export function BreadcrumbNav() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const items: { label: string; href: string }[] = [];

  let accumulated = '';
  for (const seg of segments) {
    accumulated += `/${seg}`;
    items.push({ label: SEGMENT_LABELS[seg] ?? seg, href: accumulated });
  }

  const last = items.pop()!;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to="/" />}>首页</BreadcrumbLink>
        </BreadcrumbItem>
        {items.map((item) => (
          <Fragment key={item.href}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to={item.href} />}>{item.label}</BreadcrumbLink>
            </BreadcrumbItem>
          </Fragment>
        ))}
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{last.label}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
