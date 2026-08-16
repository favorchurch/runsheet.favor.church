import { generateSiblingKey } from '@/lib/runsheetSiblingKey';

describe('generateSiblingKey', () => {
  it('returns a UUID-shaped string', () => {
    const key = generateSiblingKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('returns a different value on each call', () => {
    const a = generateSiblingKey();
    const b = generateSiblingKey();
    expect(a).not.toBe(b);
  });
});
