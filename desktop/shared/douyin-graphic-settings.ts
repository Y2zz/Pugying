/** 抖音图文自主声明，与创作者后台的六种单选项对应。 */
export const DOUYIN_AUTHOR_DECLARATIONS = [
  { value: 'none', label: '无需添加自主声明' },
  { value: 'ai_generated', label: '内容由AI生成' },
  { value: 'personal_opinion', label: '内容为个人观点或见解' },
  { value: 'reposted', label: '内容为转载信息' },
  { value: 'marketing', label: '内容含营销推广信息' },
  { value: 'fictional', label: '虚构演绎，仅供娱乐' },
] as const;

export type DouyinAuthorDeclaration = (typeof DOUYIN_AUTHOR_DECLARATIONS)[number]['value'];

export function isDouyinAuthorDeclaration(value: unknown): value is DouyinAuthorDeclaration {
  return DOUYIN_AUTHOR_DECLARATIONS.some((option) => option.value === value);
}

/** 图文话题写入作品描述，保留正文顺序并避免重复追加已有话题。 */
export function composeDouyinGraphicDescription(body: string, tags: string[]): string {
  const text = body.trim();
  const existing = new Set(text.match(/#[^\s#]+/g) ?? []);
  const additions = [...new Set(tags.map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean))]
    .map((tag) => `#${tag}`)
    .filter((tag) => !existing.has(tag));
  return [text, additions.join(' ')].filter(Boolean).join('\n');
}
