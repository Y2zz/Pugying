import type { ArticleOverrideDraft, CoverPair, CoverSlot } from "./helpers";

export interface ArticleRecoveryData {
  title: string;
  body: string;
  selected: Record<string, boolean>;
  drafts: Record<string, ArticleOverrideDraft>;
  covers: CoverPair;
  legacyMediaPaths: string[];
  createdContentId: string | null;
}

export interface ArticleRecoveryRecord {
  version: 1;
  updatedAt: number;
  baseUpdatedAt: string;
  data: ArticleRecoveryData;
}

/** 账号选择和发布设置不算文章内容；保留文字、图片及已设置的封面。 */
export function hasArticleRecoveryContent(data: ArticleRecoveryData): boolean {
  const document = new DOMParser().parseFromString(data.body, "text/html");
  const text = document.body.textContent
    ?.replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim();
  const hasCover = (slot: CoverSlot) =>
    Boolean(slot.saved || (slot.blob && slot.blob.size > 0));
  return Boolean(
    data.title.trim() ||
    text ||
    document.querySelector("img[src]") ||
    data.legacyMediaPaths.some((path) => path.trim()) ||
    Object.values(data.covers).some(hasCover) ||
    Object.values(data.drafts).some(
      (draft) =>
        draft.title.trim() ||
        draft.articleSettings?.summary?.trim() ||
        Object.values(draft.covers).some(hasCover) ||
        draft.extraCovers?.some(hasCover),
    ),
  );
}

/** 比较实际编辑数据，忽略临时预览地址、对象重建以及编辑器的空段落。 */
export function equalArticleRecoveryData(
  left: ArticleRecoveryData,
  right: ArticleRecoveryData,
): boolean {
  const normalize = (data: ArticleRecoveryData) => {
    const document = new DOMParser().parseFromString(data.body, "text/html");
    const text = document.body.textContent
      ?.replace(/[\u200b-\u200d\ufeff]/g, "")
      .trim();
    const empty = !text && !document.querySelector("img,hr,video,audio,iframe");
    return { ...packArticleRecovery(data), body: empty ? "" : data.body };
  };
  const equal = (a: unknown, b: unknown): boolean => {
    if (a === b) {
      return true;
    }
    if (!a || !b || typeof a !== "object" || typeof b !== "object") {
      return false;
    }
    // 不同 Blob 即使大小相同也可能包含不同的封面。
    if (
      Object.prototype.toString.call(a) === "[object Blob]" ||
      Object.prototype.toString.call(b) === "[object Blob]"
    ) {
      return false;
    }
    if (Array.isArray(a) !== Array.isArray(b)) {
      return false;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return (
        a.length === b.length &&
        a.every((value, index) => equal(value, b[index]))
      );
    }
    const first = a as Record<string, unknown>;
    const second = b as Record<string, unknown>;
    const keys = Object.keys(first).filter((key) => first[key] !== undefined);
    return (
      keys.length ===
        Object.keys(second).filter((key) => second[key] !== undefined).length &&
      keys.every((key) => equal(first[key], second[key]))
    );
  };
  return left === right || equal(normalize(left), normalize(right));
}

// 串行操作，确保离开页面时的最后一次写入不会在清理后重新创建恢复副本。
let operations = Promise.resolve<unknown>(undefined);
function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const operation = operations
    .catch(() => undefined)
    .then(
      () =>
        new Promise<T>((resolve, reject) => {
          const request = indexedDB.open("pugying-article-recovery", 1);
          request.onupgradeneeded = () =>
            request.result.createObjectStore("drafts");
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("恢复存储暂不可用"));
          request.onsuccess = () => {
            const db = request.result;
            try {
              const tx = db.transaction("drafts", mode);
              const result = action(tx.objectStore("drafts"));
              tx.oncomplete = () => {
                db.close();
                resolve(result.result);
              };
              tx.onabort = tx.onerror = () => {
                db.close();
                reject(tx.error);
              };
            } catch (error) {
              db.close();
              reject(error);
            }
          };
        }),
    );
  operations = operation;
  return operation;
}

export function readArticleRecovery(
  key: string,
): Promise<ArticleRecoveryRecord | undefined> {
  return transaction("readonly", (store) => store.get(key));
}

export function writeArticleRecovery(
  key: string,
  record: ArticleRecoveryRecord,
): Promise<IDBValidKey> {
  return transaction("readwrite", (store) => store.put(record, key));
}

export function removeArticleRecovery(key: string): Promise<undefined> {
  return transaction("readwrite", (store) => store.delete(key));
}

/** 临时预览地址不能跨启动保存；裁剪结果 Blob 由 IndexedDB 原样保存。 */
export function packArticleRecovery(
  data: ArticleRecoveryData,
): ArticleRecoveryData {
  const slot = (cover: CoverSlot): CoverSlot => ({
    ...cover,
    previewUrl: "",
    sourceUrl: "",
  });
  const pair = (covers: CoverPair): CoverPair => ({
    portrait: slot(covers.portrait),
    landscape: slot(covers.landscape),
  });
  return {
    ...data,
    covers: pair(data.covers),
    drafts: Object.fromEntries(
      Object.entries(data.drafts).map(([id, draft]) => [
        id,
        {
          ...draft,
          covers: pair(draft.covers),
          extraCovers: draft.extraCovers?.map(slot),
        },
      ]),
    ),
  };
}

export function restoreArticleRecovery(
  data: ArticleRecoveryData,
  base: ArticleRecoveryData,
  trackUrl: (url: string) => string,
): ArticleRecoveryData {
  const slot = (cover: CoverSlot, fallback?: CoverSlot): CoverSlot => {
    if (cover.blob) {
      const previewUrl = trackUrl(URL.createObjectURL(cover.blob));
      return { ...cover, previewUrl, sourceUrl: previewUrl };
    }
    return cover.saved && fallback
      ? fallback
      : { ...cover, previewUrl: "", sourceUrl: "" };
  };
  return {
    ...data,
    covers: {
      portrait: slot(data.covers.portrait, base.covers.portrait),
      landscape: slot(data.covers.landscape, base.covers.landscape),
    },
    drafts: Object.fromEntries(
      Object.entries(data.drafts).map(([id, draft]) => [
        id,
        {
          ...draft,
          covers: {
            portrait: slot(draft.covers.portrait),
            landscape: slot(draft.covers.landscape),
          },
          extraCovers: draft.extraCovers?.map((cover) => slot(cover)),
        },
      ]),
    ),
  };
}
