/**
 * Windows 顶栏产品菜单：嵌在 DesktopTitleBar 内（自定义铬，非原生 Menu）。
 * 外观沿用 shadcn Menubar 默认样式，仅加 no-drag；「查看」仅开发态展示。
 */
import {
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { getPugyingDesktopBridge } from '@/lib/agent-client';

function runDesktopAction(
  invoke: (bridge: NonNullable<ReturnType<typeof getPugyingDesktopBridge>>) =>
    | Promise<unknown>
    | undefined,
): void {
  const bridge = getPugyingDesktopBridge();
  if (!bridge) {
    return;
  }
  void invoke(bridge);
}

export function DesktopAppMenubar() {
  const showViewMenu = import.meta.env.DEV;

  return (
    <Menubar
      data-slot="desktop-app-menubar"
      className="desktop-titlebar-no-drag shrink-0 border-0 bg-transparent shadow-none"
    >
      <MenubarMenu>
        <MenubarTrigger>文件</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarItem
              onClick={() => {
                runDesktopAction((b) => b.showAppWindow?.());
              }}
            >
              显示主窗口
            </MenubarItem>
            <MenubarItem
              onClick={() => {
                runDesktopAction((b) => b.quitApp?.());
              }}
            >
              退出蒲公英
            </MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>

      {showViewMenu ? (
        <MenubarMenu>
          <MenubarTrigger>查看</MenubarTrigger>
          <MenubarContent>
            <MenubarGroup>
              <MenubarItem
                onClick={() => {
                  runDesktopAction((b) => b.toggleDevTools?.());
                }}
              >
                开发者工具
              </MenubarItem>
            </MenubarGroup>
          </MenubarContent>
        </MenubarMenu>
      ) : null}

      <MenubarMenu>
        <MenubarTrigger>帮助</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarItem
              onClick={() => {
                runDesktopAction((b) => b.showAbout?.());
              }}
            >
              关于蒲公英
            </MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
