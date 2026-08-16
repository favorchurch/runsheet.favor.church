export function cleanSongTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/<[^>]*>/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
}
