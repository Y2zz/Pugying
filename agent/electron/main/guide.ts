import type { GuideBubbleStep, GuideSlide } from '@shared/ipc';

export function firstRunSlides(platformName: string): GuideSlide[] {
  return [
    {
      id: 'welcome',
      title: '平台授权窗口',
      body: `接下来会在本窗口打开「${platformName}」登录页。授权信息只交给蒲公英服务端，Agent 本机不保存 Cookie。`,
    },
    {
      id: 'login',
      title: '在页面中登录',
      body: '请使用要绑定的账号完成登录。可用上方后退/刷新按钮，必要时在「更多」中清除缓存后重试。',
    },
    {
      id: 'finish',
      title: '完成授权',
      body: '登录成功后系统会自动检测；若未自动结束，请点击右上角「完成授权」。',
    },
  ];
}

export function authBubbleSteps(platformName: string): GuideBubbleStep[] {
  return [
    {
      id: 'login-page',
      title: '登录媒体账号',
      body: `关闭本提示后，在下方「${platformName}」页面完成登录。`,
      anchor: 'content',
    },
    {
      id: 'complete',
      title: '确认授权',
      body: '登录成功后将自动完成；也可随时点击右上角「完成授权」。',
      anchor: 'complete',
    },
  ];
}
