import { parseRockSongContent } from './songParser';

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
