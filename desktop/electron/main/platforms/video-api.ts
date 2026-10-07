import type { ArticleApiSession } from './article-api';

export interface UploadedVideo {
  vid: string;
  duration: number;
  width: number;
  height: number;
  coverUri: string;
  /** 小红书投稿使用上传文件标识及原始媒体轨道信息。 */
  fileId?: string;
  originalMetadata?: {
    video: Record<string, unknown>;
    audio: Record<string, unknown> | null;
  };
}

export interface VideoApiSession extends ArticleApiSession {
  uploadVideo(path: string): Promise<UploadedVideo>;
}
