import type { ComponentType, SVGProps } from 'react';
import type { PlatformId } from '@/lib/api';
import { cn } from '@/lib/utils';

type PlatformIconProps = SVGProps<SVGSVGElement> & {
  platform: PlatformId;
};

function DouyinIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className} {...props}>
      <rect width="24" height="24" rx="6" fill="#121212" />
      <path
        d="M14.2 6.2c.5 1.5 1.6 2.6 3.1 3v2.1c-1.2-.1-2.3-.5-3.1-1.2v5.1c0 2.6-2.1 4.6-4.7 4.6S4.8 17.8 4.8 15.2 6.9 10.6 9.5 10.6c.3 0 .6 0 .9.1v2.2c-.3-.1-.6-.2-.9-.2-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5V6.2h2.2Z"
        fill="#25F4EE"
      />
      <path
        d="M15 5.4c.5 1.5 1.6 2.6 3.1 3v2.1c-1.2-.1-2.3-.5-3.1-1.2v5.1c0 2.6-2.1 4.6-4.7 4.6S5.6 17 5.6 14.4 7.7 9.8 10.3 9.8c.3 0 .6 0 .9.1v2.2c-.3-.1-.6-.2-.9-.2-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5V5.4H15Z"
        fill="#FE2C55"
      />
      <path
        d="M14.6 5.8c.5 1.5 1.6 2.6 3.1 3v2.1c-1.2-.1-2.3-.5-3.1-1.2v5.1c0 2.6-2.1 4.6-4.7 4.6S5.2 17.4 5.2 14.8 7.3 10.2 9.9 10.2c.3 0 .6 0 .9.1v2.2c-.3-.1-.6-.2-.9-.2-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5V5.8h2.2Z"
        fill="white"
      />
    </svg>
  );
}

function ToutiaoIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className} {...props}>
      <rect width="24" height="24" rx="6" fill="#F04142" />
      <path
        d="M7 7.2h10v2.1H13.6v7.5h-2.4V9.3H7V7.2Zm1.4 10.6 1.7-1.5c.5.6 1.2 1 2.1 1 .9 0 1.4-.4 1.4-1.1 0-.7-.4-1-1.5-1.4l-1-.3c-1.7-.5-2.6-1.4-2.6-3 0-1.8 1.4-3.1 3.6-3.1 1.4 0 2.5.5 3.3 1.3l-1.6 1.5c-.5-.5-1.1-.8-1.8-.8-.8 0-1.3.4-1.3 1 0 .6.4.9 1.5 1.2l1 .3c1.9.6 2.7 1.5 2.7 3.1 0 2-1.5 3.3-3.8 3.3-1.6 0-2.9-.6-3.7-1.6Z"
        fill="white"
      />
    </svg>
  );
}

function ChannelsIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className} {...props}>
      <rect width="24" height="24" rx="6" fill="#FA9D3B" />
      <path
        d="M8.2 7.4c0-.8.9-1.3 1.6-.9l7.1 4.1c.7.4.7 1.4 0 1.8l-7.1 4.1c-.7.4-1.6-.1-1.6-.9V7.4Z"
        fill="white"
      />
    </svg>
  );
}

function BilibiliIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className} {...props}>
      <rect width="24" height="24" rx="6" fill="#FB7299" />
      <path
        d="M8.2 5.6 6.7 7.1l1.4 1.4h8l1.4-1.4-1.5-1.5-1.6 1.5H9.8L8.2 5.6ZM6.4 9.2h11.2c.7 0 1.2.5 1.2 1.2v6.8c0 .7-.5 1.2-1.2 1.2H6.4c-.7 0-1.2-.5-1.2-1.2v-6.8c0-.7.5-1.2 1.2-1.2Zm2.4 2.4c-.7 0-1.2.5-1.2 1.2s.5 1.2 1.2 1.2 1.2-.5 1.2-1.2-.5-1.2-1.2-1.2Zm6.4 0c-.7 0-1.2.5-1.2 1.2s.5 1.2 1.2 1.2 1.2-.5 1.2-1.2-.5-1.2-1.2-1.2Z"
        fill="white"
      />
    </svg>
  );
}

function XiaohongshuIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className} {...props}>
      <rect width="24" height="24" rx="6" fill="#FF2442" />
      <path
        d="M7.2 6.4h9.6c.7 0 1.2.5 1.2 1.2v8.8c0 .7-.5 1.2-1.2 1.2H7.2c-.7 0-1.2-.5-1.2-1.2V7.6c0-.7.5-1.2 1.2-1.2Zm1.6 2.4v1.6h6.4V8.8H8.8Zm0 3.2v1.6h4.8v-1.6H8.8Zm0 3.2v1.6h6.4v-1.6H8.8Z"
        fill="white"
      />
    </svg>
  );
}

const PLATFORM_ICONS: Record<PlatformId, ComponentType<SVGProps<SVGSVGElement>>> = {
  douyin: DouyinIcon,
  toutiao: ToutiaoIcon,
  channels: ChannelsIcon,
  bilibili: BilibiliIcon,
  xiaohongshu: XiaohongshuIcon,
};

export function PlatformIcon({ platform, className, ...props }: PlatformIconProps) {
  const Icon = PLATFORM_ICONS[platform];
  return <Icon className={cn('size-8 shrink-0', className)} {...props} />;
}
