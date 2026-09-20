import type { GuideBubbleStep, GuideSlide } from '@shared/ipc';

export function firstRunSlides(platformName: string): GuideSlide[] {
  return [
    {
      id: 'welcome',
      title: '平台授权窗口',
      body: `接下来会打开「${platformName}」登录页。登录信息仅用于蒲公英绑定账号。`,
    },
    {
      id: 'login',
      title: '完成登录',
      body: '使用要绑定的账号登录即可，扫码或密码均可。',
    },
    {
      id: 'finish',
      title: '完成授权',
      body: '登录成功后会自动完成；若一直未完成，再点右上角「完成授权」。',
    },
  ];
}

export function authBubbleSteps(platformName: string): GuideBubbleStep[] {
  return [
    {
      id: 'login-page',
      title: '登录账号',
      body: `在下方「${platformName}」页面完成登录。`,
      anchor: 'content',
    },
    {
      id: 'complete',
      title: '确认授权',
      body: '登录后会自动完成；也可点右上角「完成授权」。',
      anchor: 'complete',
    },
  ];
}
