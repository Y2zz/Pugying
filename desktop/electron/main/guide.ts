import type { GuideBubbleStep, GuideSlide } from '@shared/ipc';

export function firstRunSlides(platformName: string): GuideSlide[] {
  return [
    {
      id: 'welcome',
      title: `绑定${platformName}账号`,
      body: `在「${platformName}」页面登录要绑定的账号，登录成功后会自动完成授权。`,
    },
  ];
}

export function authBubbleSteps(platformName: string): GuideBubbleStep[] {
  return [
    {
      id: 'login-page',
      title: `登录${platformName}账号`,
      body: '登录成功后会自动完成授权。\n若未自动完成，可点击右上角「完成授权」。',
      anchor: 'content',
    },
  ];
}
