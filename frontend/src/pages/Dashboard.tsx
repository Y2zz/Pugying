import { PageHeader } from '@/components/layouts/PageHeader';

export function Dashboard() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="欢迎回来，这里是你项目的概览。" />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: '总项目数', value: '12', desc: '较上月 +2' },
          { title: '进行中', value: '5', desc: '3 个即将截止' },
          { title: '已完成', value: '24', desc: '本月 +6' },
          { title: '团队成员', value: '8', desc: '在线 3 人' },
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
            项目「Pugying」已创建 — 2 分钟前
          </div>
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-muted-foreground" />
            用户「admin」登录系统 — 10 分钟前
          </div>
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-secondary-foreground/40" />
            任务「初始化前端布局」标记为进行中 — 1 小时前
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
