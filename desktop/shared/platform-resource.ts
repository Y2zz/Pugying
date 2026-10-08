/**
 * 平台资源引用：选择器必须保存平台标识，不能只用名称冒充已绑定。
 * 话题等允许「新建文本」时 id 可为 "0"（对齐官方文本话题结构）。
 */
export interface PlatformResourceRef {
  id: string;
  name: string;
}

const NAME_MAX = 80;

export type NormalizePlatformResourceOptions = {
  /** 合集/文集名称可含空格；话题名默认不允许 */
  allowSpaces?: boolean;
};

/** 规范化单条资源；id/name 非法时返回 null。 */
export function normalizePlatformResourceRef(
  value: unknown,
  options?: NormalizePlatformResourceOptions,
): PlatformResourceRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name =
    typeof record.name === "string"
      ? record.name.trim().replace(/^#+/, "")
      : "";
  if (!name || name.length > NAME_MAX || /#/.test(name)) {
    return null;
  }
  if (!options?.allowSpaces && /\s/.test(name)) {
    return null;
  }
  const rawId = record.id;
  const id =
    typeof rawId === "string"
      ? rawId.trim()
      : typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId >= 0
        ? String(rawId)
        : "";
  if (!id || !/^\d+$/.test(id)) {
    return null;
  }
  return { id, name };
}

/**
 * 合集/文集等已绑定资源：名称可含空格，且 id 不能为 0。
 */
export function normalizeBoundPlatformResourceRef(
  value: unknown,
): PlatformResourceRef | null {
  const ref = normalizePlatformResourceRef(value, { allowSpaces: true });
  if (!ref || ref.id === "0") {
    return null;
  }
  return ref;
}

/** 去重（同 id 优先保留先出现的；id 为 0 时按名称去重）。 */
export function normalizePlatformResourceRefs(
  values: unknown,
  maxCount = 20,
  options?: NormalizePlatformResourceOptions,
): PlatformResourceRef[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: PlatformResourceRef[] = [];
  for (const item of values) {
    const ref = normalizePlatformResourceRef(item, options);
    if (!ref) {
      continue;
    }
    const nameKey = ref.name.toLowerCase();
    if (ref.id !== "0") {
      if (seenIds.has(ref.id) || seenNames.has(nameKey)) {
        continue;
      }
      seenIds.add(ref.id);
    } else if (seenNames.has(nameKey)) {
      continue;
    }
    seenNames.add(nameKey);
    result.push(ref);
    if (result.length >= maxCount) {
      break;
    }
  }
  return result;
}

export function topicNames(refs: PlatformResourceRef[]): string[] {
  return refs.map((ref) => ref.name);
}

/** 旧草稿仅有名称时转为未绑定引用（id=0），发布时再搜索补齐。 */
export function topicRefsFromNames(names: string[]): PlatformResourceRef[] {
  return normalizePlatformResourceRefs(
    names.map((name) => ({ id: "0", name })),
  );
}

/** 解析抖音 challengesug 回执为话题资源列表。 */
export function parseDouyinTopicSuggestions(
  response: unknown,
): PlatformResourceRef[] {
  if (!response || typeof response !== "object") {
    return [];
  }
  const list = (response as { sug_list?: unknown }).sug_list;
  if (!Array.isArray(list)) {
    return [];
  }
  return normalizePlatformResourceRefs(
    list.map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = item as Record<string, unknown>;
      const name =
        typeof row.cha_name === "string"
          ? row.cha_name
          : typeof row.challenge_name === "string"
            ? row.challenge_name
            : "";
      const cid = row.cid ?? row.challenge_id ?? row.id;
      return { id: cid, name };
    }),
  );
}

/** 解析抖音创作者合集列表回执。 */
export function parseDouyinCollectionList(
  response: unknown,
): PlatformResourceRef[] {
  if (!response || typeof response !== "object") {
    return [];
  }
  const list = (response as { mix_list?: unknown }).mix_list;
  if (!Array.isArray(list)) {
    return [];
  }
  return normalizePlatformResourceRefs(
    list.map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = item as Record<string, unknown>;
      return { id: row.mix_id ?? row.id, name: row.mix_name ?? row.name };
    }),
    50,
    { allowSpaces: true },
  ).filter((ref) => ref.id !== "0");
}

/** 解析 B 站 UP 主文集列表回执。 */
export function parseBilibiliAnthologyList(
  response: unknown,
): PlatformResourceRef[] {
  if (!response || typeof response !== "object") {
    return [];
  }
  const data = (response as { data?: unknown }).data;
  const root =
    data && typeof data === "object"
      ? (data as { lists?: unknown })
      : (response as { lists?: unknown });
  const list = root.lists;
  if (!Array.isArray(list)) {
    return [];
  }
  return normalizePlatformResourceRefs(
    list.map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = item as Record<string, unknown>;
      return { id: row.id, name: row.name };
    }),
    50,
    { allowSpaces: true },
  ).filter((ref) => ref.id !== "0");
}

/** 按关键词过滤账号资源列表（空关键词返回全部）。 */
export function filterPlatformResources(
  items: PlatformResourceRef[],
  keyword: string,
): PlatformResourceRef[] {
  const query = keyword.trim().replace(/^#+/, "").toLowerCase();
  if (!query) {
    return items;
  }
  return items.filter((item) => item.name.toLowerCase().includes(query));
}
