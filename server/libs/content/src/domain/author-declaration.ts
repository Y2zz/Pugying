export const AUTHOR_DECLARATIONS = ['none', 'ai_generated', 'personal_opinion', 'reposted', 'marketing', 'fictional'] as const;

export type AuthorDeclaration = (typeof AUTHOR_DECLARATIONS)[number];

export function isAuthorDeclaration(value: unknown): value is AuthorDeclaration {
  return AUTHOR_DECLARATIONS.some((item) => item === value);
}
