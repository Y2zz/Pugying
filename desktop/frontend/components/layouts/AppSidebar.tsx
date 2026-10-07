import { LayoutGrid, Link2, ListOrdered, SquareTerminal } from "lucide-react";
import { useDistributionState } from "@/components/publishing/DistributionProvider";

import { AppBrand } from "@/components/layouts/AppBrand";
import { NavMain } from "@/components/layouts/NavMain";
import { NavPreferences } from "@/components/layouts/NavPreferences";
import { NavPublish } from "@/components/layouts/NavPublish";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import type { ComponentProps } from "react";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: SquareTerminal,
      end: true,
    },
    {
      title: "作品管理",
      url: "/contents",
      icon: LayoutGrid,
    },
    {
      title: "媒体账号",
      url: "/platform-accounts",
      icon: Link2,
    },
  ],
};

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const state = useDistributionState();
  const counts = state.activePage.counts;
  const queueEntry = {
    title: "分发队列",
    url: "/distribution",
    icon: ListOrdered,
    badge: counts.active + counts.waiting,
    tooltip: state.error
      ? "分发队列，状态更新失败"
      : !state.hasRead
        ? "分发队列，正在读取状态"
        : `分发队列，正在发布 ${counts.active} 项，等待 ${counts.waiting} 项，需要处理 ${counts.attention} 项`,
  };
  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <AppBrand />
      </SidebarHeader>

      <SidebarContent>
        <NavPublish />
        <NavMain
          items={[
            ...data.navMain.slice(0, 2),
            queueEntry,
            ...data.navMain.slice(2),
          ]}
        />
      </SidebarContent>

      <NavPreferences />
    </Sidebar>
  );
}
