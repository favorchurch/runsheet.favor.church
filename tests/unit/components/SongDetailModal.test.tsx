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

  it('renders modal with search input and details when opened', async () => {
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
    expect(screen.getByPlaceholderText('Search Rock songs...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Goodness of God')).toBeInTheDocument();
      expect(screen.getByText('🎤 Bethel Music')).toBeInTheDocument();
      expect(screen.getByText('Chord Chart (PDF)')).toBeInTheDocument();
    });
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

  it('supports readOnly mode', () => {
    render(
      <SongDetailModal
        isOpen={true}
        initialValue="Goodness of God (Eb)"
        initialSongItemId={101}
        readOnly={true}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText('Song Details')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply to Runsheet' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
