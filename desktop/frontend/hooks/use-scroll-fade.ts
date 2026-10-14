import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 滚动区底部渐隐：内容可滚动且未到底时 visible 为 true。
 * active 为 false（如浮层关闭）时不监听。
 */
export function useScrollFade(active: boolean) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const nodeRef = useRef<HTMLElement | null>(null);
  const ref = useCallback((element: HTMLElement | null) => {
    nodeRef.current = element;
    setNode(element);
  }, []);
  const update = useCallback(() => {
    const element = nodeRef.current;
    if (!element) {
      setVisible(false);
      return;
    }
    const remaining =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    setVisible(remaining > 1);
  }, []);
  useEffect(() => {
    if (!active || !node) {
      return;
    }
    update();
    // 搜索过滤会改变内容高度，内容和容器尺寸变化时都重新判断
    const observer = new ResizeObserver(update);
    observer.observe(node);
    for (const child of Array.from(node.children)) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  }, [active, node, update]);
  return { ref, update, visible };
}
