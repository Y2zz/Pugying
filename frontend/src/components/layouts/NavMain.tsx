import { useState } from 'react';
import { NavLink } from 'react-router-dom';
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
  isActive?: boolean;
  items?: {
    title: string;
    url: string;
  }[];
};

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
  const [open, setOpen] = useState(item.isActive ?? false);
  const hasSubItems = item.items && item.items.length > 0;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.title}
        render={hasSubItems ? undefined : <NavLink to={item.url} />}
        onClick={hasSubItems ? () => setOpen((v) => !v) : undefined}
      >
        <item.icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
      {hasSubItems && (
        <>
          <SidebarMenuAction
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'transition-transform duration-200',
              open && 'rotate-90',
            )}
          >
            <ChevronRight />
            <span className="sr-only">Toggle</span>
          </SidebarMenuAction>
          {open && (
            <SidebarMenuSub>
              {item.items!.map((subItem) => (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton render={<NavLink to={subItem.url} />}>
                    <span>{subItem.title}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          )}
        </>
      )}
    </SidebarMenuItem>
  );
}
