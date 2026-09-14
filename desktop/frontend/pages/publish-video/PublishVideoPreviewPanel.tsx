import type { RefObject } from 'react';
import type { MediaDuplicateHit } from '@/lib/api';
import type { VideoUploadMetrics } from './helpers';
import { VideoInitialUploadSelector } from './VideoInitialUploadSelector';
import { VideoPhoneColumn } from './VideoPhoneColumn';

/**
 * 发布页右栏：
 * - 首次进入（select）：全宽上传选择器
 * - 进入表单后：9:16 单柱 {@link VideoPhoneColumn}
 */
export function PublishVideoPreviewPanel({
  videoSectionRef,
  videoInputRef,
  showPhoneColumn,
  hasVideo,
  videoFileName,
  videoFileSize,
  videoPreviewUrl,
  duplicateHit,
  dragOver,
  disabled,
  uploading,
  uploadMetrics,
  onPickClick,
  onFileChange,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onCancelUpload,
  onDuplicateCancel,
  onDuplicateForceUpload,
  onDuplicateReuse,
}: {
  videoSectionRef: RefObject<HTMLDivElement | null>;
  videoInputRef: RefObject<HTMLInputElement | null>;
  /** 已选文件或处于编辑/发布流程时为 true，切换为 9:16 单柱 */
  showPhoneColumn: boolean;
  hasVideo: boolean;
  videoFileName: string;
  videoFileSize: number | null;
  videoPreviewUrl: string | null;
  duplicateHit: MediaDuplicateHit | null;
  dragOver: boolean;
  disabled: boolean;
  uploading: boolean;
  uploadMetrics: VideoUploadMetrics | null;
  onPickClick: () => void;
  onFileChange: (file: File | null) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onCancelUpload: () => void;
  onDuplicateCancel: () => void;
  onDuplicateForceUpload: () => void;
  onDuplicateReuse: () => void;
}) {
  return (
    <div ref={videoSectionRef} className={showPhoneColumn ? undefined : 'w-full'}>
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,.mp4"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          onFileChange(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      {showPhoneColumn ? (
        <VideoPhoneColumn
          hasVideo={hasVideo}
          videoFileName={videoFileName}
          videoFileSize={videoFileSize}
          videoPreviewUrl={videoPreviewUrl}
          duplicateHit={duplicateHit}
          disabled={disabled}
          uploading={uploading}
          uploadMetrics={uploadMetrics}
          onPickClick={onPickClick}
          onCancelUpload={onCancelUpload}
          onDuplicateCancel={onDuplicateCancel}
          onDuplicateForceUpload={onDuplicateForceUpload}
          onDuplicateReuse={onDuplicateReuse}
        />
      ) : (
        <VideoInitialUploadSelector
          dragOver={dragOver}
          disabled={disabled}
          onPickClick={onPickClick}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        />
      )}
    </div>
  );
}
