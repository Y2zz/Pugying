/**
 * 平台资源引用：选择器保存平台标识；话题允许 id 为 "0" 表示未绑定文本话题。
 */
export interface PlatformResourceRef {
  id: string;
  name: string;
}

const NAME_MAX = 80;

export function normalizePlatformResourceRef(
  value: unknown,
): PlatformResourceRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name =
    typeof record.name === 'string' ? record.name.trim().replace(/^#+/, '') : '';
  if (!name || name.length > NAME_MAX || /\s|#/.test(name)) {
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
