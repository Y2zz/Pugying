/**
 * 平台资源引用：选择器保存平台标识；话题允许 id 为 "0" 表示未绑定文本话题。
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

export function normalizePlatformResourceRef(
  value: unknown,
  options?: NormalizePlatformResourceOptions,
): PlatformResourceRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name =
    typeof record.name === 'string' ? record.name.trim().replace(/^#+/, '') : '';
  if (!name || name.length > NAME_MAX || /#/.test(name)) {
    return null;
  }
  if (!options?.allowSpaces && /\s/.test(name)) {
    return null;
  }
  const rawId = record.id;
  const id =
    typeof rawId === 'string'
      ? rawId.trim()
      : typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId >= 0
        ? String(rawId)
        : '';
  if (!id || !/^\d+$/.test(id)) {
    return null;
  }
  return { id, name };
}

/** 合集/文集等已绑定资源：名称可含空格，且 id 不能为 0。 */
export function normalizeBoundPlatformResourceRef(
  value: unknown,
): PlatformResourceRef | null {
  const ref = normalizePlatformResourceRef(value, { allowSpaces: true });
  if (!ref || ref.id === '0') {
    return null;
  }
  return ref;
}

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
    if (ref.id !== '0') {
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
