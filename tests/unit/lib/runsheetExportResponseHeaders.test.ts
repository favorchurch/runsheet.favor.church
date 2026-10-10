import { describe, expect, it } from '@jest/globals';
import { buildContentDisposition, buildExportFilename, EXPORT_CACHE_CONTROL } from '@/lib/runsheetExport';

describe('runsheetExport response headers', () => {
  it('uses a private no-store cache policy', () => {
    expect(EXPORT_CACHE_CONTROL).toBe('private, no-store');
  });

  it.each([
    ['MNL Crowne // October 11, 2026 // 10AM', 'mnl-crowne-2026-10-11.pdf'],
    ['Sunday Service // 2026-03-07 // 9AM', 'sunday-service-2026-03-07.pdf'],
    ['Café Ñandú // Nov 5, 2027', 'cafe-nandu-2027-11-05.pdf'],
    ['Easter Special', 'easter-special.pdf'],
  ])('builds filename for %s', (name, expected) => {
    expect(buildExportFilename(name, 7)).toBe(expected);
  });

  it('falls back to the channel id when the title has no ascii characters', () => {
    expect(buildExportFilename('안녕 // Nov 5, 2027', 7)).toBe('runsheet-7-2027-11-05.pdf');
    expect(buildExportFilename('', 7)).toBe('runsheet-7.pdf');
  });

  it('builds an RFC 5987 Content-Disposition', () => {
    expect(buildContentDisposition('mnl-crowne-2026-10-11.pdf')).toBe(
      `attachment; filename="mnl-crowne-2026-10-11.pdf"; filename*=UTF-8''mnl-crowne-2026-10-11.pdf`,
    );
  });

  it('percent-encodes reserved characters in filename*', () => {
    expect(buildContentDisposition("a'b(c)d*e f.pdf")).toBe(
      `attachment; filename="a'b(c)d*e f.pdf"; filename*=UTF-8''a%27b%28c%29d%2Ae%20f.pdf`,
    );
  });
});
