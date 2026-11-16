/**
 * Generates a clean slug from text, supporting both ASCII and unicode characters (e.g. Chinese).
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u4e00-\u9fa5-]/g, '') // Keep alphanumeric, Chinese chars, whitespace, and hyphens
    .replace(/[\s_]+/g, '-')              // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, '');             // Trim leading and trailing hyphens
}
