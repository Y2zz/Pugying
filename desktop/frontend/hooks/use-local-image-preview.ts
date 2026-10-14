import { useEffect, useState } from "react";
import { getPugyingDesktopBridge } from "@/lib/agent-client";

/** 本机图片经 preload 读取；预览不依赖 renderer 加载 file://。 */
export function useLocalImagePreview(path: string | null) {
  const [preview, setPreview] = useState<{
    path: string | null;
    source?: string | null;
  }>({ path: null, source: null });

  useEffect(() => {
    let active = true;
    setPreview({ path });
    const load = async () => {
      let source: string | null = null;
      try {
        if (path) {
          source =
            (await getPugyingDesktopBridge()?.readLocalImageDataUrl?.(path)) ??
            null;
        }
      } catch {
        // 文件被移动、删除或无法读取时，由调用方显示提示。
      }
      if (active) {
        setPreview({ path, source });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [path]);

  return path ? (preview.path === path ? preview.source : undefined) : null;
}
