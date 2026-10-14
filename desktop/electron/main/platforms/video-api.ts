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

/** 分片上传进度（供分发队列展示百分比与速度） */
export interface VideoUploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
}

export interface VideoUploadOptions {
  onProgress?: (progress: VideoUploadProgress) => void;
}

export interface VideoApiSession extends ArticleApiSession {
  uploadVideo(
    path: string,
    options?: VideoUploadOptions,
  ): Promise<UploadedVideo>;
}
