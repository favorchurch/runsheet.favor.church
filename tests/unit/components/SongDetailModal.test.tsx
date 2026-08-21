/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SongDetailModal } from '@/components/runsheet/SongDetailModal';
import { rockSearchSongs } from '@/server-actions/rockSearchSongs';
import { rockGetSongDetails } from '@/server-actions/rockGetSongDetails';

jest.mock('@/server-actions/rockSearchSongs', () => ({
  rockSearchSongs: jest.fn(),
}));

jest.mock('@/server-actions/rockGetSongDetails', () => ({
  rockGetSongDetails: jest.fn(),
}));

const mockRockSearchSongs = jest.mocked(rockSearchSongs);
const mockRockGetSongDetails = jest.mocked(rockGetSongDetails);

describe('SongDetailModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRockSearchSongs.mockResolvedValue({
      success: true,
      songs: [
        { id: 101, rawTitle: 'Goodness of God', cleanTitle: 'Goodness of God' },
        { id: 102, rawTitle: 'Way Maker', cleanTitle: 'Way Maker' },
      ],
    });
    mockRockGetSongDetails.mockResolvedValue({
      success: true,
      song: {
        id: 101,
        title: 'Goodness of God',
        cleanTitle: 'Goodness of God',
        artist: 'Bethel Music',
        key: 'Eb',
        bpm: '72',
        timeSignature: '4/4',
        ccli: '7137792',
        themes: 'Praise',
        rockUrl: 'https://rock.favor.church/ContentChannelItem/101',
        sheetMusicLinks: [{ label: 'Chord Chart (PDF)', url: 'https://rock.favor.church/chart.pdf' }],
        sections: [{ title: 'Verse 1', content: 'I love you Lord', isChorus: false }],
      },
    });
  });

  it('renders modal with search hidden by default when opening an existing song, and toggles on click', async () => {
    render(
      <SongDetailModal
        isOpen={true}
        initialValue="Goodness of God (Eb)"
        initialSongItemId={101}
        onSelectSong={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText('Select Song & Key')).toBeInTheDocument();
    // Search is initially hidden when existing song is provided
    expect(screen.queryByPlaceholderText('Search Rock songs...')).not.toBeInTheDocument();
    expect(screen.getByText('See Songs')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Goodness of God')).toBeInTheDocument();
      expect(screen.getByText('🎤 Bethel Music')).toBeInTheDocument();
      expect(screen.getByText('Verse 1')).toBeInTheDocument();
      expect(screen.getByText(/I love you Lord/i)).toBeInTheDocument();
    });

    // Switch to Resources & Charts tab
    fireEvent.click(screen.getByRole('button', { name: /Resources & Charts/i }));
    expect(screen.getByText('Chord Chart (PDF)')).toBeInTheDocument();

    // Click "See Songs" to reveal search sidebar
    fireEvent.click(screen.getByText('See Songs'));
    expect(screen.getByPlaceholderText('Search Rock songs...')).toBeInTheDocument();
    expect(screen.getByText('Hide Song List')).toBeInTheDocument();
  });

  it('opens search sidebar by default when no song is selected', async () => {
    render(
      <SongDetailModal
        isOpen={true}
        initialValue=""
        onSelectSong={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByPlaceholderText('Search Rock songs...')).toBeInTheDocument();
  });

  it('calls onSelectSong with chosen song and key on confirm', async () => {
    const handleSelectSong = jest.fn();
    const handleClose = jest.fn();

    render(
      <SongDetailModal
        isOpen={true}
        initialValue=""
        onSelectSong={handleSelectSong}
        onClose={handleClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Goodness of God')).toBeInTheDocument();
    });

    // Pick song
    fireEvent.click(screen.getByText('Goodness of God'));

    // Pick key 'G'
    fireEvent.click(screen.getByRole('button', { name: 'G' }));

    // Apply
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Runsheet' }));

    expect(handleSelectSong).toHaveBeenCalledWith('Goodness of God (G)', 101);
    expect(handleClose).toHaveBeenCalled();
  });

  it('renders embedded YouTube player and copyable URL in Resources & Charts tab', async () => {
    // Mock navigator.clipboard
    const mockWriteText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });

    mockRockGetSongDetails.mockResolvedValueOnce({
      success: true,
      song: {
        id: 303,
        title: 'Testify',
        cleanTitle: 'Testify',
        artist: 'Favor Live',
        rockUrl: 'https://rock.favor.church/ContentChannelItem/303',
        sheetMusicLinks: [],
        sections: [
          {
            title: 'YouTube',
            content: 'https://www.youtube.com/watch?v=Ij-OyBWfwpQ',
            youtubeVideoId: 'Ij-OyBWfwpQ',
            youtubeUrl: 'https://www.youtube.com/watch?v=Ij-OyBWfwpQ',
          },
        ],
        youtubeVideoId: 'Ij-OyBWfwpQ',
        youtubeUrl: 'https://www.youtube.com/watch?v=Ij-OyBWfwpQ',
      },
    });

    render(
      <SongDetailModal
        isOpen={true}
        initialValue="Testify"
        initialSongItemId={303}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Testify')).toBeInTheDocument();
    });

    // Switch to Resources & Charts tab
    fireEvent.click(screen.getByRole('button', { name: /Resources & Charts/i }));

    expect(screen.getByTitle('Testify')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/Ij-OyBWfwpQ'
    );
    expect(screen.getByText('Watch on YouTube')).toBeInTheDocument();
    expect(screen.getByText('https://www.youtube.com/watch?v=Ij-OyBWfwpQ')).toBeInTheDocument();

    // Test Copy URL button
    const copyBtn = screen.getByRole('button', { name: /Copy URL/i });
    fireEvent.click(copyBtn);
    expect(mockWriteText).toHaveBeenCalledWith('https://www.youtube.com/watch?v=Ij-OyBWfwpQ');
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('fails open cleanly in Resources & Charts tab when video ID is not parseable', async () => {
    mockRockGetSongDetails.mockResolvedValueOnce({
      success: true,
      song: {
        id: 304,
        title: 'Custom Link Song',
        cleanTitle: 'Custom Link Song',
        rockUrl: 'https://rock.favor.church/ContentChannelItem/304',
        sheetMusicLinks: [],
        sections: [],
        youtubeUrl: 'https://youtube.com/channel/custom',
      },
    });

    render(
      <SongDetailModal
        isOpen={true}
        initialValue="Custom Link Song"
        initialSongItemId={304}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Custom Link Song')).toBeInTheDocument();
    });

    // Switch to Resources & Charts tab
    fireEvent.click(screen.getByRole('button', { name: /Resources & Charts/i }));

    expect(screen.getByText('https://youtube.com/channel/custom')).toBeInTheDocument();
    expect(screen.getByText('Watch on YouTube')).toBeInTheDocument();
    expect(
      screen.getByText(/Direct video playback unavailable for this URL/i)
    ).toBeInTheDocument();
  });
});
