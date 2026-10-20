import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { GET } from './route';

jest.mock('@/auth0-hooks/server/getRockSession', () => ({
  getRockSession: jest.fn(),
}));

jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockGet: jest.fn(),
}));

const mockGetRockSession = jest.mocked(getRockSession);
const mockRockGet = jest.mocked(rockGet);

const viewer = {
  rolesMap: { viewer: ['7001'] },
  access: { runsheetCampuses: ['MNL'] },
} as any;

describe('song route access and id handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRockSession.mockResolvedValue(viewer);
    mockRockGet.mockResolvedValue([]);
  });

  it('rejects a non-positive or non-integer id before touching Rock', async () => {
    const response = await GET(new Request('https://runsheet.test/api/song?id=0'));

    expect(response.status).toBe(400);
    expect(mockRockGet).not.toHaveBeenCalled();
  });

  it('uses a constrained ContentChannelItems query for a valid id', async () => {
    const response = await GET(new Request('https://runsheet.test/api/song?id=42'));

    expect(response.status).toBe(404);
    expect(mockRockGet).toHaveBeenCalledWith('/ContentChannelItems', {
      $filter: 'ContentChannelId eq 18 and Id eq 42',
      $top: 1,
    });
  });

  it('denies authenticated users without runsheet access', async () => {
    mockGetRockSession.mockResolvedValue({ rolesMap: {}, access: { runsheetCampuses: [] } } as any);

    const response = await GET(new Request('https://runsheet.test/api/song?id=42'));

    expect(response.status).toBe(403);
    expect(mockRockGet).not.toHaveBeenCalled();
  });
});

const unsafeSongLinks = [
  'javascript:alert%281%29',
  'JaVaScRiPt:alert%281%29',
  'java\tscript:alert%281%29',
  'data:text/html,<svg onload=alert&#40;1&#41;>',
  'vbscript:msgbox%281%29',
  'file:///etc/passwd',
  'ftp://files.example.test/chart.pdf',
  '//files.example.test/chart.pdf',
  '/local/chart.pdf',
  'javascript&#58;alert%281%29',
  'https://files.example.test" onmouseover="alert&#40;1&#41;',
];

const safeSongLinks = [
  ['https://files.example.test/chart.pdf', 'https://files.example.test/chart.pdf'],
  ['http://files.example.test/chart.pdf', 'http://files.example.test/chart.pdf'],
  ['HTTPS://FILES.EXAMPLE.TEST/chart.pdf', 'https://files.example.test/chart.pdf'],
  ['https://files.example.test/chart.pdf?key=C&part=lead', 'https://files.example.test/chart.pdf?key=C&amp;part=lead'],
  ['https://files.example.test/a" onmouseover="alert.pdf', 'https://files.example.test/a%22%20onmouseover=%22alert.pdf'],
];

describe.each(['Sheet Music', 'Verse'])('song HTML output in %s', (section) => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRockSession.mockResolvedValue(viewer);
  });

  async function renderLink(url: string, label = 'Chord chart') {
    mockRockGet.mockResolvedValue([{
      Id: 42,
      Title: 'Synthetic song',
      Content: `## ${section}\n[${label}](${url})`,
    }]);
    const response = await GET(new Request('https://runsheet.test/api/song?id=42'));
    expect(response.status).toBe(200);
    return response.text();
  }

  it.each(unsafeSongLinks)('renders an unsafe URL as plain text: %s', async (url) => {
    const html = await renderLink(url);

    // The fixed Rock link is the only anchor; a blocked chart keeps its label.
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain('Chord chart');
  });

  it.each(safeSongLinks)('encodes an allowed URL: %s', async (url, encodedHref) => {
    const html = await renderLink(url);

    expect(html).toContain(`href="${encodedHref}" target="_blank" rel="noopener noreferrer"`);
    expect(html.match(/<a\b/g)).toHaveLength(2);
    expect(html).not.toContain('" onmouseover="');
  });

  it('encodes link labels instead of rendering stored markup', async () => {
    const html = await renderLink('https://files.example.test/chart.pdf', '<img src=x onerror=alert&#40;1&#41;>');

    expect(html).toContain('&lt;img src=x onerror=alert&amp;#40;1&amp;#41;&gt;');
    expect(html).not.toContain('<img');
  });
});

describe('song HTML fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRockSession.mockResolvedValue(viewer);
  });

  it('encodes metadata, section titles and lyrics', async () => {
    mockRockGet.mockResolvedValue([{
      Id: 42,
      Title: '<img src=x onerror=alert(1)>Safe & title',
      Content: '**Artist:** <svg onload=alert(1)>\n**Key:** C & D\n---\n## <img src=x>\nLyrics <script>alert(1)</script> & more',
    }]);
    const response = await GET(new Request('https://runsheet.test/api/song?id=42'));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Safe &amp; title');
    expect(html).toContain('&lt;svg onload=alert(1)&gt;');
    expect(html).toContain('C &amp; D');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('Lyrics &lt;script&gt;alert(1)&lt;/script&gt; &amp; more');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<script>alert');
  });

  it('encodes the upstream item id in the fixed Rock link', async () => {
    mockRockGet.mockResolvedValue([{
      Id: '42" onmouseover="alert(1)',
      Title: 'Synthetic song',
      Content: 'Lyrics',
    }]);
    const response = await GET(new Request('https://runsheet.test/api/song?id=42'));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('href="https://rock.favor.church/ContentChannelItem/42%22%20onmouseover%3D%22alert(1)"');
    expect(html).not.toContain('" onmouseover="');
  });
});
