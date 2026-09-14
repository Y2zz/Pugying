import { PageHeader } from '@/components/layouts/PageHeader';

export function Dashboard() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="概览" description="在此查看本机内容发布工作区。" />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: '内容草稿', value: '—', desc: '在内容页查看和编辑' },
          { title: '已绑定账号', value: '—', desc: '在媒体账号页管理' },
          { title: '本机媒体库', value: '—', desc: '集中存放视频与图片' },
          { title: '发布记录', value: '—', desc: '在内容详情中查看状态' },
        ].map((stat) => (
          <div key={stat.title} className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
            <div className="text-base font-medium text-muted-foreground">{stat.title}</div>
            <div className="mt-2 font-heading text-2xl font-semibold tracking-tight">{stat.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{stat.desc}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="font-medium">最近活动</h2>
        <div className="mt-4 flex flex-col gap-3 text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-primary" />
            在「媒体账号」中绑定要发布的平台账号
          </div>
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-muted-foreground" />
            在「内容」中创建图文或短视频草稿
          </div>
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-secondary-foreground/40" />
            在「媒体库」中上传可复用的视频和封面
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
