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

  it('returns 401 without touching Rock when there is no session', async () => {
    mockGetRockSession.mockRejectedValue(new Error('FORBIDDEN'));

    const response = await GET(new Request('https://runsheet.test/api/song?id=42'));

    expect(response.status).toBe(401);
    expect(mockRockGet).not.toHaveBeenCalled();
  });

  it('keeps 500 when session resolution fails for a reason other than a missing session', async () => {
    mockGetRockSession.mockRejectedValue(new Error('Rock unavailable'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(new Request('https://runsheet.test/api/song?id=42'));

    expect(response.status).toBe(500);
    expect(mockRockGet).not.toHaveBeenCalled();
    spy.mockRestore();
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

  it('sanitizes hrefs in normal sections and sheet music sections, disallowing javascript/data and unescaped quotes', async () => {
    mockRockGet.mockResolvedValue([
      {
        Id: 42,
        Title: 'Test Song',
        Content: [
          '**Artist:** Test Artist',
          '---',
          '## Verse 1',
          'Normal link: [safe](https://example.com/safe)',
          'Relative link: [sheet](/chords/song.pdf)',
          'Bad js: [x](javascript:alert(1))',
          'Bad js mixed: [x](JaVaScRiPt:alert(1))',
          'Bad data: [x](data:text/html,<script>alert(1)</script>)',
          'Bad quote: [x](https://a" onmouseover="alert(1))',
          '',
          '## Sheet Music',
          '[safe sheet](https://example.com/music.pdf)',
          '[sheet relative](/music/relative.pdf)',
          '[bad sheet js](javascript:alert(1))',
          '[bad sheet js mixed](JaVaScRiPt:alert(1))',
          '[bad sheet data](data:text/html,<script>alert(1)</script>)',
          '[bad sheet quote](https://a" onmouseover="alert(1))',
        ].join('\n'),
      },
    ]);

    const response = await GET(new Request('https://runsheet.test/api/song?id=42'));
    expect(response.status).toBe(200);
    const html = await response.text();

    // Verify safe links render as anchors
    expect(html).toContain('href="https://example.com/safe"');
    expect(html).toContain('href="/chords/song.pdf"');
    expect(html).toContain('href="https://example.com/music.pdf"');
    expect(html).toContain('href="/music/relative.pdf"');

    // Verify malicious/unsafe links do not render as href
    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('href="JaVaScRiPt');
    expect(html).not.toContain('href="data:');
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).not.toContain('JaVaScRiPt:alert(1)');
    expect(html).not.toContain('data:text/html');

    // Verify attribute injection is blocked and properly escaped
    expect(html).not.toContain('onmouseover=');
    expect(html).not.toContain('" onmouseover=');

    // Plain text labels still render
    expect(html).toContain('safe');
    expect(html).toContain('sheet');
    expect(html).toContain('bad sheet js');
  });

  it('escapes literal HTML tags such as <a> and <img> in normal sections without executing them', async () => {
    mockRockGet.mockResolvedValue([
      {
        Id: 43,
        Title: 'HTML Injection Test Song',
        Content: [
          '**Artist:** Safe Artist',
          '---',
          '## Verse 1',
          'Literal anchor: <a href="javascript:alert(1)">x</a>',
          'Literal event: <a onmouseover="alert(1)">x</a>',
          'Literal img: <img src=x onerror=alert(1)>',
          'Mixed markdown and html: [link](https://example.com/ok) with <script>alert(2)</script>',
        ].join('\n'),
      },
    ]);

    const response = await GET(new Request('https://runsheet.test/api/song?id=43'));
    expect(response.status).toBe(200);
    const html = await response.text();

    // Verify literal raw HTML tags were escaped
    expect(html).toContain('&lt;a href=&quot;javascript:alert(1)&quot;&gt;x&lt;/a&gt;');
    expect(html).toContain('&lt;a onmouseover=&quot;alert(1)&quot;&gt;x&lt;/a&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');

    // Verify no unescaped dangerous tags or attributes were rendered
    expect(html).not.toMatch(/<a\s+href="javascript:/);
    expect(html).not.toMatch(/<a\s+onmouseover=/);
    expect(html).not.toMatch(/<img\s+src=/);
    expect(html).not.toMatch(/<script>/);

    // Verify the valid markdown link is still rendered as an anchor
    expect(html).toContain('<a href="https://example.com/ok"');
  });
});
