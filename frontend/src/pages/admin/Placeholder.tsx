import { PageHeader } from '@/components/layouts/PageHeader';

export default function AdminPlaceholder({ title }: { title: string }) {
  return <PageHeader title={title} description="页面占位，后续接入 CRUD。" />;
}
