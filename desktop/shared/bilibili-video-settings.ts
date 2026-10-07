/** 数字标识来自当前账号的官方投稿配置。 */
export interface BilibiliVideoSettings {
  partitionId: number;
  copyright: 1 | 2;
  source?: string;
  creationStatementId?: number;
}

export interface BilibiliVideoOptions {
  partitions: { id: number; name: string; group: string }[];
  declarations: { id: number; content: string }[];
}

export function parseBilibiliVideoOptions(
  value: unknown,
): BilibiliVideoOptions | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const data = value as Record<string, any>;
  if (data.isLogin !== true || !Array.isArray(data.typelist)) {
    return null;
  }
  const partitions = data.typelist.flatMap((group: any) => {
    if (typeof group?.name !== "string" || !Array.isArray(group.children)) {
      return [];
    }
    return group.children
      .filter(
        (item: any) =>
          Number.isSafeInteger(item?.id) &&
          item.id > 0 &&
          typeof item.name === "string",
      )
      .map((item: any) => ({
        id: item.id as number,
        name: item.name as string,
        group: group.name as string,
      }));
  });
  const declarations = Array.isArray(data.neutral_mark?.mark_list)
    ? data.neutral_mark.mark_list
        .filter(
          (item: any) =>
            Number.isSafeInteger(item?.id) &&
            item.id > 0 &&
            typeof item.content === "string",
        )
        .map((item: any) => ({
          id: item.id as number,
          content: item.content as string,
        }))
    : [];
  return { partitions, declarations };
}
