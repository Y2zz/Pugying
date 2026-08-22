import type { ImgHTMLAttributes } from 'react';
import type { PlatformId } from '@/lib/api';
import { cn } from '@/lib/utils';
import bilibiliLogo from '@/assets/platforms/bilibili.svg';
import channelsLogo from '@/assets/platforms/channels.svg';
import douyinLogo from '@/assets/platforms/douyin.svg';
import toutiaoLogo from '@/assets/platforms/toutiao.svg';
import xiaohongshuLogo from '@/assets/platforms/xiaohongshu.svg';

/**
 * 媒体平台 Logo：使用各平台公开品牌字形（SVG），统一为方块图标便于列表/选择器展示。
 * 来源：Simple Icons（抖音音符/B 站/小红书，CC0）、Remix Icon 视频号（Apache-2.0）、
 * IconPark/theSVG 今日头条字形。
 */
const PLATFORM_LOGOS: Record<PlatformId, string> = {
  douyin: douyinLogo,
  toutiao: toutiaoLogo,
  channels: channelsLogo,
  bilibili: bilibiliLogo,
  xiaohongshu: xiaohongshuLogo,
};

const PLATFORM_LABELS: Record<PlatformId, string> = {
  douyin: '抖音',
  toutiao: '今日头条',
  channels: '视频号',
  bilibili: '哔哩哔哩',
  xiaohongshu: '小红书',
};

type PlatformIconProps = ImgHTMLAttributes<HTMLImageElement> & {
  platform: PlatformId;
};

export function PlatformIcon({ platform, className, alt, ...props }: PlatformIconProps) {
  return (
    <img
      src={PLATFORM_LOGOS[platform]}
      alt={alt ?? PLATFORM_LABELS[platform]}
      className={cn('size-8 shrink-0 overflow-hidden rounded-[22%] object-contain', className)}
      draggable={false}
      {...props}
    />
  );
}
