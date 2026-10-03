/** Turns a product name into a URL-friendly slug, e.g. "Desk Lamp (Black)" -> "desk-lamp-black". */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 140)
    .replace(/^-+|-+$/g, '');
  return slug || 'product';
}
