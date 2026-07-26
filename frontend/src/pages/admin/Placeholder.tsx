export default function AdminPlaceholder({ title }: { title: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">页面占位，后续接入 CRUD。</p>
    </div>
  );
}
