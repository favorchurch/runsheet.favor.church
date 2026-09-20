import { parseRockSongContent, extractYouTubeVideoId, extractYouTubeUrl } from './songParser';

describe('parseRockSongContent', () => {
  it('parses structured metadata and sections correctly', () => {
    const mockContent = `**Key:** Eb
**Artist:** Bethel Music & Brandon Lake
**BPM:** 72
**Time Signature:** 4/4
**CCLI:** 7137792
**Themes:** Praise, Gratitude, Worship
---
## Verse 1
I love You, Lord
For Your mercy never fails me

## Chorus
All my life You have been faithful
All my life You have been so, so good

## Sheet Music
[Chord Chart (PDF)](https://rock.favor.church/GetFile.ashx?guid=123)
[Lead Sheet](https://rock.favor.church/GetFile.ashx?guid=456)
`;

    const result = parseRockSongContent({
      Id: 101,
      Title: 'Goodness of God (Bethel Music)',
      Content: mockContent,
    });

    expect(result.id).toBe(101);
    expect(result.cleanTitle).toBe('Goodness of God');
    expect(result.artist).toBe('Bethel Music & Brandon Lake');
    expect(result.key).toBe('Eb');
    expect(result.bpm).toBe('72');
    expect(result.timeSignature).toBe('4/4');
    expect(result.ccli).toBe('7137792');
    expect(result.themes).toBe('Praise, Gratitude, Worship');
    expect(result.rockUrl).toBe('https://rock.favor.church/ContentChannelItem/101');
    expect(result.sheetMusicLinks).toHaveLength(2);
    expect(result.sheetMusicLinks[0]).toEqual({
      label: 'Chord Chart (PDF)',
      url: 'https://rock.favor.church/GetFile.ashx?guid=123',
    });
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe('Verse 1');
    expect(result.sections[1].title).toBe('Chorus');
    expect(result.sections[1].isChorus).toBe(true);
  });

  it('detects and parses YouTube video URLs in sections', () => {
    const mockContent = `## Verse 1
Here is my song

## YouTube
https://www.youtube.com/watch?v=Ij-OyBWfwpQ&list=RDIj-OyBWfwpQ&start_radio=1
`;

    const result = parseRockSongContent({
      Id: 303,
      Title: 'Testify',
      Content: mockContent,
    });

    expect(result.sections).toHaveLength(2);
    expect(result.sections[1].title).toBe('YouTube');
    expect(result.sections[1].youtubeVideoId).toBe('Ij-OyBWfwpQ');
    expect(result.sections[1].youtubeUrl).toContain('youtube.com/watch?v=Ij-OyBWfwpQ');
    expect(result.youtubeVideoId).toBe('Ij-OyBWfwpQ');
  });

  it('detects and parses YouTube video URLs in top-level metadata', () => {
    const mockContent = `**YouTube:** https://youtu.be/shortsVid123
---
## Verse 1
Here is my song
`;

    const result = parseRockSongContent({
      Id: 404,
      Title: 'Short Song',
      Content: mockContent,
    });

    expect(result.youtubeVideoId).toBe('shortsVid123');
    expect(result.youtubeUrl).toBe('https://youtu.be/shortsVid123');
  });

  it('handles empty or missing content gracefully', () => {
    const result = parseRockSongContent({
      Id: 202,
      Title: 'Simple Song',
      Content: null,
    });

    expect(result.id).toBe(202);
    expect(result.cleanTitle).toBe('Simple Song');
    expect(result.artist).toBeUndefined();
    expect(result.sheetMusicLinks).toEqual([]);
    expect(result.sections).toEqual([]);
  });
});

describe('extractYouTubeVideoId and extractYouTubeUrl', () => {
  it('extracts video ID from standard and non-standard youtube URLs', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=Ij-OyBWfwpQ')).toBe('Ij-OyBWfwpQ');
    expect(extractYouTubeVideoId('https://youtu.be/Ij-OyBWfwpQ')).toBe('Ij-OyBWfwpQ');
    expect(extractYouTubeVideoId('https://youtu.be/Ij-OyBWfwpQ?t=30')).toBe('Ij-OyBWfwpQ');
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/Ij-OyBWfwpQ')).toBe('Ij-OyBWfwpQ');
    expect(extractYouTubeVideoId('https://music.youtube.com/watch?v=Ij-OyBWfwpQ&list=123')).toBe('Ij-OyBWfwpQ');
    expect(extractYouTubeVideoId('https://www.youtube.com/shorts/Ij-OyBWfwpQ')).toBe('Ij-OyBWfwpQ');
    expect(extractYouTubeVideoId('https://www.youtube.com/live/Ij-OyBWfwpQ')).toBe('Ij-OyBWfwpQ');
  });

  it('extracts full YouTube URL from text and markdown links', () => {
    expect(extractYouTubeUrl('Check this out: https://www.youtube.com/watch?v=Ij-OyBWfwpQ&start_radio=1')).toContain(
      'youtube.com/watch?v=Ij-OyBWfwpQ'
    );
    expect(extractYouTubeUrl('[Video Link](https://www.youtube.com/watch?v=Ij-OyBWfwpQ)')).toBe(
      'https://www.youtube.com/watch?v=Ij-OyBWfwpQ'
    );
  });

  it('returns null for non-youtube URLs', () => {
    expect(extractYouTubeVideoId('https://google.com')).toBeNull();
    expect(extractYouTubeVideoId('')).toBeNull();
    expect(extractYouTubeUrl('https://google.com')).toBeNull();
  });

  it('fails open on unparseable YouTube URLs without crashing', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/user/channelname')).toBeNull();
    expect(extractYouTubeUrl('https://www.youtube.com/user/channelname')).toBe('https://www.youtube.com/user/channelname');
  });
});
