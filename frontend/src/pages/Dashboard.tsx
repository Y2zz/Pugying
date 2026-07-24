export function Dashboard() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">欢迎回来，这里是你项目的概览。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: '总项目数', value: '12', desc: '较上月 +2' },
          { title: '进行中', value: '5', desc: '3 个即将截止' },
          { title: '已完成', value: '24', desc: '本月 +6' },
          { title: '团队成员', value: '8', desc: '在线 3 人' },
        ].map((stat) => (
          <div
            key={stat.title}
            className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
          >
            <div className="text-sm font-medium text-muted-foreground">{stat.title}</div>
            <div className="mt-2 text-3xl font-bold">{stat.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stat.desc}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="font-semibold">最近活动</h2>
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-emerald-500" />
            项目「Pugying」已创建 — 2 分钟前
          </div>
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-blue-500" />
            用户「admin」登录系统 — 10 分钟前
          </div>
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-amber-500" />
            任务「初始化前端布局」标记为进行中 — 1 小时前
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
