/**
 * 平台资源引用：选择器必须保存平台标识，不能只用名称冒充已绑定。
 * 话题等允许「新建文本」时 id 可为 "0"（对齐官方文本话题结构）。
 */
export interface PlatformResourceRef {
  id: string;
  name: string;
}

const NAME_MAX = 80;

/** 规范化单条资源；id/name 非法时返回 null。 */
export function normalizePlatformResourceRef(
  value: unknown,
): PlatformResourceRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name =
    typeof record.name === "string"
      ? record.name.trim().replace(/^#+/, "")
      : "";
  if (!name || name.length > NAME_MAX || /\s|#/.test(name)) {
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

/** 去重（同 id 优先保留先出现的；id 为 0 时按名称去重）。 */
export function normalizePlatformResourceRefs(
  values: unknown,
  maxCount = 20,
): PlatformResourceRef[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: PlatformResourceRef[] = [];
  for (const item of values) {
    const ref = normalizePlatformResourceRef(item);
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
