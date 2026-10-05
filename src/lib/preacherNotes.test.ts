import { describe, expect, it } from '@jest/globals';
import {
  buildPreacherNotesFolder,
  isPdf,
  isValidNotePath,
  parsePreacherNotes,
  serializePreacherNotes,
  PREACHER_NOTES_MAX_BYTES,
} from './preacherNotes';

describe('parsePreacherNotes and serializePreacherNotes', () => {
  it('returns empty array for absent, empty, or malformed input', () => {
    expect(parsePreacherNotes(null)).toEqual([]);
    expect(parsePreacherNotes(undefined)).toEqual([]);
    expect(parsePreacherNotes('')).toEqual([]);
    expect(parsePreacherNotes('   ')).toEqual([]);
    expect(parsePreacherNotes('{ "not": "an array" }')).toEqual([]);
    expect(parsePreacherNotes('invalid json text')).toEqual([]);
    expect(parsePreacherNotes(123)).toEqual([]);
  });

  it('drops items failing shape validation', () => {
    const raw = [
      null,
      123,
      'hello',
      {},
      { name: 'only name' },
      { path: 'only path' },
      { name: '', path: 'PreacherNotes/MNL/1/a/file.pdf' },
      { name: 'valid', path: '' },
      {
        name: 'Valid Note',
        path: 'PreacherNotes/MNL/10/deadbeef/note.pdf',
        size: 1024,
        uploadedAt: '2026-10-06T00:00:00Z',
      },
    ];

    expect(parsePreacherNotes(JSON.stringify(raw))).toEqual([
      {
        name: 'Valid Note',
        path: 'PreacherNotes/MNL/10/deadbeef/note.pdf',
        size: 1024,
        uploadedAt: '2026-10-06T00:00:00Z',
      },
    ]);
  });

  it('serializes and roundtrips valid notes', () => {
    const notes = [
      {
        name: 'Sermon 1.pdf',
        path: 'PreacherNotes/MNL/42/1234abcd/sermon1.pdf',
        size: 50000,
        uploadedAt: '2026-10-06T01:00:00.000Z',
      },
    ];

    const json = serializePreacherNotes(notes);
    expect(parsePreacherNotes(json)).toEqual(notes);
  });
});

describe('isPdf', () => {
  it('detects %PDF- magic bytes in Buffer, Uint8Array, and ArrayBuffer', () => {
    const valid = Buffer.from('%PDF-1.7 header content');
    expect(isPdf(valid)).toBe(true);

    const u8 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(isPdf(u8)).toBe(true);

    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    expect(isPdf(ab)).toBe(true);
  });

  it('rejects non-PDF bytes or short buffers', () => {
    expect(isPdf(null)).toBe(false);
    expect(isPdf(undefined)).toBe(false);
    expect(isPdf(Buffer.from('GIF89a'))).toBe(false);
    expect(isPdf(Buffer.from('%PDF'))).toBe(false); // only 4 bytes
    expect(isPdf(new Uint8Array([]))).toBe(false);
    expect(isPdf(Buffer.from('PK\x03\x04'))).toBe(false);
  });
});

describe('buildPreacherNotesFolder', () => {
  it('builds PreacherNotes/<CAMPUS|ALL>/<channelId>/<random>/', () => {
    const folderMnl = buildPreacherNotesFolder('MNL', 42, 'abcd1234');
    expect(folderMnl).toBe('PreacherNotes/MNL/42/abcd1234/');

    const folderBne = buildPreacherNotesFolder('BNE', '101', 'fe45');
    expect(folderBne).toBe('PreacherNotes/BNE/101/fe45/');

    const folderSel = buildPreacherNotesFolder('SEL', 55, '0011');
    expect(folderSel).toBe('PreacherNotes/SEL/55/0011/');

    const folderAll = buildPreacherNotesFolder('ALL', 7, 'deadbeef');
    expect(folderAll).toBe('PreacherNotes/ALL/7/deadbeef/');
  });

  it('resolves campus from runsheet title marker or defaults to ALL', () => {
    const fromTitle = buildPreacherNotesFolder('MNL Crowne // Oct 10 // 10AM', 12, '1122');
    expect(fromTitle).toBe('PreacherNotes/MNL/12/1122/');

    const noMarker = buildPreacherNotesFolder('Special Event Run // Oct 10', 99, 'aabb');
    expect(noMarker).toBe('PreacherNotes/ALL/99/aabb/');

    const empty = buildPreacherNotesFolder(null, 5, 'ccdd');
    expect(empty).toBe('PreacherNotes/ALL/5/ccdd/');
  });

  it('generates random hex when randomHex is omitted', () => {
    const folder = buildPreacherNotesFolder('MNL', 42);
    expect(folder).toMatch(/^PreacherNotes\/MNL\/42\/[0-9a-fA-F]+\/$/);
  });
});

describe('isValidNotePath', () => {
  it('accepts valid paths matching channelId and allowed campuses', () => {
    expect(isValidNotePath('PreacherNotes/MNL/42/a1b2c3d4/notes.pdf', 42)).toBe(true);
    expect(isValidNotePath('PreacherNotes/BNE/42/0123456789abcdef/sermon_final.pdf', 42)).toBe(true);
    expect(isValidNotePath('PreacherNotes/SEL/42/DEADBEEF/outline.pdf', 42)).toBe(true);
    expect(isValidNotePath('PreacherNotes/ALL/42/12ab/slides.pdf', '42')).toBe(true);
  });

  it('rejects paths with wrong channelId', () => {
    expect(isValidNotePath('PreacherNotes/MNL/43/a1b2/notes.pdf', 42)).toBe(false);
  });

  it('rejects paths with path traversal (..)', () => {
    expect(isValidNotePath('PreacherNotes/MNL/42/../notes.pdf', 42)).toBe(false);
    expect(isValidNotePath('PreacherNotes/MNL/42/a1b2/../../../etc/passwd.pdf', 42)).toBe(false);
  });

  it('rejects paths with backslashes', () => {
    expect(isValidNotePath('PreacherNotes\\MNL\\42\\a1b2\\notes.pdf', 42)).toBe(false);
    expect(isValidNotePath('PreacherNotes/MNL/42/a1b2\\notes.pdf', 42)).toBe(false);
  });

  it('rejects paths with leading slashes', () => {
    expect(isValidNotePath('/PreacherNotes/MNL/42/a1b2/notes.pdf', 42)).toBe(false);
  });

  it('rejects invalid campuses', () => {
    expect(isValidNotePath('PreacherNotes/NYC/42/a1b2/notes.pdf', 42)).toBe(false);
    expect(isValidNotePath('PreacherNotes/OTHER/42/a1b2/notes.pdf', 42)).toBe(false);
  });

  it('rejects non-hex segments', () => {
    expect(isValidNotePath('PreacherNotes/MNL/42/xyz123/notes.pdf', 42)).toBe(false);
    expect(isValidNotePath('PreacherNotes/MNL/42/random-folder/notes.pdf', 42)).toBe(false);
  });

  it('rejects non-PDF files', () => {
    expect(isValidNotePath('PreacherNotes/MNL/42/a1b2/notes.exe', 42)).toBe(false);
    expect(isValidNotePath('PreacherNotes/MNL/42/a1b2/notes.docx', 42)).toBe(false);
    expect(isValidNotePath('PreacherNotes/MNL/42/a1b2/notes.pdf.exe', 42)).toBe(false);
  });

  it('rejects extra subdirectories or missing filename', () => {
    expect(isValidNotePath('PreacherNotes/MNL/42/a1b2/sub/notes.pdf', 42)).toBe(false);
    expect(isValidNotePath('PreacherNotes/MNL/42/a1b2/.pdf', 42)).toBe(false);
  });
});

describe('PREACHER_NOTES_MAX_BYTES', () => {
  it('is under 4.5 MB to fit within Vercel body limits', () => {
    expect(PREACHER_NOTES_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
    expect(PREACHER_NOTES_MAX_BYTES).toBeGreaterThan(4.0 * 1024 * 1024);
  });
});
