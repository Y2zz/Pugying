import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';

type NavMainItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  /** 为 true 时仅精确匹配 pathname（如 Dashboard） */
  end?: boolean;
  items?: {
    title: string;
    url: string;
    end?: boolean;
  }[];
};

/** 菜单项与当前路由是否匹配；默认前缀匹配以覆盖嵌套页 */
function isRouteActive(pathname: string, url: string, end?: boolean): boolean {
  if (end) {
    return pathname === url;
  }
  return pathname === url || pathname.startsWith(`${url}/`);
}

export function NavMain({ items }: { items: NavMainItem[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>导航</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <NavMainItem key={item.title} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavMainItem({ item }: { item: NavMainItem }) {
  const location = useLocation();
  const hasSubItems = Boolean(item.items && item.items.length > 0);
  const childActive =
    item.items?.some((sub) => isRouteActive(location.pathname, sub.url, sub.end)) ?? false;
  const selfActive = isRouteActive(location.pathname, item.url, item.end);
  const active = hasSubItems ? childActive : selfActive;
  // 子路由激活时自动展开；手动折叠后仍可再点开
  const [open, setOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) {
      setOpen(true);
    }
  }, [childActive]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.title}
        isActive={active}
        render={hasSubItems ? undefined : <NavLink to={item.url} end={item.end} />}
        onClick={
          hasSubItems
            ? () => {
                setOpen((v) => !v);
              }
            : undefined
        }
      >
        <item.icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
      {hasSubItems ? (
        <>
          <SidebarMenuAction
            onClick={() => {
              setOpen((v) => !v);
            }}
            className={cn('transition-transform duration-200', open && 'rotate-90')}
          >
            <ChevronRight />
            <span className="sr-only">Toggle</span>
          </SidebarMenuAction>
          {open ? (
            <SidebarMenuSub>
              {item.items!.map((subItem) => {
                const subActive = isRouteActive(location.pathname, subItem.url, subItem.end);
                return (
                  <SidebarMenuSubItem key={subItem.title}>
                    <SidebarMenuSubButton
                      isActive={subActive}
                      render={<NavLink to={subItem.url} end={subItem.end} />}
                    >
                      <span>{subItem.title}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          ) : null}
        </>
      ) : null}
    </SidebarMenuItem>
  );
}
