import { describe, expect, it } from '@jest/globals';
import {
  buildPreacherNotesFolder,
  formatContentDisposition,
  isPdf,
  isValidNotePath,
  parsePreacherNotes,
  sanitizeStorageFileName,
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
      },
    ]);
  });

  it('drops size and uploadedAt to keep stored attribute minimal', () => {
    const raw = [
      {
        name: 'Note with metadata',
        path: 'PreacherNotes/MNL/42/deadbeef/note.pdf',
        size: 12345,
        uploadedAt: '2026-10-06T01:00:00.000Z',
      },
    ];
    const parsed = parsePreacherNotes(JSON.stringify(raw));
    expect(parsed).toEqual([
      {
        name: 'Note with metadata',
        path: 'PreacherNotes/MNL/42/deadbeef/note.pdf',
      },
    ]);
    expect((parsed[0] as any).size).toBeUndefined();
    expect((parsed[0] as any).uploadedAt).toBeUndefined();
  });

  it('caps note name to PREACHER_NOTES_MAX_NAME_LENGTH', () => {
    const veryLongName = 'a'.repeat(200);
    const raw = [{ name: veryLongName, path: 'PreacherNotes/MNL/42/deadbeef/note.pdf' }];
    const parsed = parsePreacherNotes(JSON.stringify(raw));
    expect(parsed[0].name).toHaveLength(100);
    expect(parsed[0].name).toBe('a'.repeat(100));
  });

  it('serializes and roundtrips valid notes without size or uploadedAt', () => {
    const notes = [
      {
        name: 'Sermon 1.pdf',
        path: 'PreacherNotes/MNL/42/1234abcd/sermon1.pdf',
      },
    ];

    const json = serializePreacherNotes(notes);
    expect(parsePreacherNotes(json)).toEqual(notes);
  });

  it('serializePreacherNotes strips extraneous properties and caps name length', () => {
    const notesWithExtra: any[] = [
      {
        name: 'b'.repeat(150),
        path: 'PreacherNotes/MNL/42/abcd/test.pdf',
        size: 9999,
        uploadedAt: '2026-10-06T00:00:00Z',
      },
    ];
    const json = serializePreacherNotes(notesWithExtra);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual([
      {
        name: 'b'.repeat(100),
        path: 'PreacherNotes/MNL/42/abcd/test.pdf',
      },
    ]);
    expect(parsed[0].size).toBeUndefined();
    expect(parsed[0].uploadedAt).toBeUndefined();
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

  it('rejects lowercase campus or folder segments', () => {
    expect(isValidNotePath('preachernotes/mnl/42/a1b2/notes.pdf', 42)).toBe(false);
    expect(isValidNotePath('PreacherNotes/mnl/42/a1b2/notes.pdf', 42)).toBe(false);
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

describe('sanitizeStorageFileName', () => {
  it('removes .. anywhere from the file name', () => {
    expect(sanitizeStorageFileName('Sermon..pdf')).toBe('Sermon.pdf');
    expect(sanitizeStorageFileName('sermon....pdf')).toBe('sermon.pdf');
    expect(sanitizeStorageFileName('..hidden..notes..pdf')).toBe('hiddennotes.pdf');
  });

  it('appends .pdf if extension is missing', () => {
    expect(sanitizeStorageFileName('notes')).toBe('notes.pdf');
    expect(sanitizeStorageFileName('Sermon Notes')).toBe('Sermon Notes.pdf');
    expect(sanitizeStorageFileName('notes.PDF')).toBe('notes.pdf');
  });

  it('takes basename and strips path separators', () => {
    expect(sanitizeStorageFileName('path/to/notes.pdf')).toBe('notes.pdf');
    expect(sanitizeStorageFileName('dir\\sub\\sermon.pdf')).toBe('sermon.pdf');
    expect(sanitizeStorageFileName('../../etc/passwd.pdf')).toBe('passwd.pdf');
  });

  it('collapses whitespace and removes control characters', () => {
    expect(sanitizeStorageFileName('  my \t sermon \r\n notes..  ')).toBe('my sermon notes.pdf');
  });

  it('handles empty, null, or only dots/pdf safely', () => {
    expect(sanitizeStorageFileName('')).toBe('document.pdf');
    expect(sanitizeStorageFileName(null)).toBe('document.pdf');
    expect(sanitizeStorageFileName(undefined)).toBe('document.pdf');
    expect(sanitizeStorageFileName('..')).toBe('document.pdf');
    expect(sanitizeStorageFileName('...')).toBe('document.pdf');
    expect(sanitizeStorageFileName('.pdf')).toBe('document.pdf');
  });
});

describe('formatContentDisposition', () => {
  it('formats ASCII filenames with fallback and encoded filename*', () => {
    const disp = formatContentDisposition('sermon.pdf', false);
    expect(disp).toBe('inline; filename="sermon.pdf"; filename*=UTF-8\'\'sermon.pdf');
  });

  it('sets attachment when isDownload is true', () => {
    const disp = formatContentDisposition('notes.pdf', true);
    expect(disp).toBe('attachment; filename="notes.pdf"; filename*=UTF-8\'\'notes.pdf');
  });

  it('sanitizes quotes, slashes, and control characters in ASCII fallback', () => {
    const disp = formatContentDisposition('Sermon "Quote" / Notes.pdf', false);
    expect(disp).toContain('filename="Sermon _Quote_ _ Notes.pdf"');
    expect(disp).toContain('filename*=UTF-8\'\'Sermon%20%22Quote%22%20%2F%20Notes.pdf');
  });

  it('handles non-Latin names safely with ASCII-only fallback and UTF-8 filename*', () => {
    const koreanName = '설교 노트.pdf';
    const disp = formatContentDisposition(koreanName, false);
    // Header value must be ByteString (ASCII only)
    expect(/^[\x20-\x7E]+$/.test(disp)).toBe(true);
    expect(disp).toContain('inline; filename="__ __.pdf"');
    expect(disp).toContain(`filename*=UTF-8''${encodeURIComponent(koreanName)}`);
  });

  it('ensures .pdf extension is appended when missing from raw filename', () => {
    const disp = formatContentDisposition('notes', true);
    expect(disp).toBe('attachment; filename="notes.pdf"; filename*=UTF-8\'\'notes.pdf');
  });

  it('safely handles lone surrogates without throwing URIError', () => {
    const invalidSurrogate = 'notes_\uD800_test';
    expect(() => formatContentDisposition(invalidSurrogate, true)).not.toThrow();
    const disp = formatContentDisposition(invalidSurrogate, true);
    expect(disp).toContain('attachment;');
    expect(disp).toContain('.pdf');
    expect(/^[\x20-\x7E]+$/.test(disp)).toBe(true);
  });

  it('percent-encodes RFC 5987 special characters like single quotes, parens, and asterisks', () => {
    const complexName = "Pastor's (Sunday)* Notes.pdf";
    const disp = formatContentDisposition(complexName, false);
    expect(disp).toContain("filename*=UTF-8''Pastor%27s%20%28Sunday%29%2A%20Notes.pdf");
    const encodedValue = disp.split("filename*=UTF-8''")[1];
    expect(encodedValue).not.toMatch(/['()*]/);
  });
});

describe('PREACHER_NOTES_MAX_COUNT and query string limits', () => {
  it('is 10 to fit within IIS 2048 query string limit', () => {
    const { PREACHER_NOTES_MAX_COUNT } = require('./preacherNotes');
    expect(PREACHER_NOTES_MAX_COUNT).toBe(10);
  });

  it('PREACHER_NOTES_MAX_QUERY_STRING_LENGTH is 1800 to protect IIS 2048 limit', () => {
    const { PREACHER_NOTES_MAX_QUERY_STRING_LENGTH } = require('./preacherNotes');
    expect(PREACHER_NOTES_MAX_QUERY_STRING_LENGTH).toBe(1800);
  });

  it('PREACHER_NOTES_MAX_NAME_LENGTH is 100 to bound stored note name size', () => {
    const { PREACHER_NOTES_MAX_NAME_LENGTH } = require('./preacherNotes');
    expect(PREACHER_NOTES_MAX_NAME_LENGTH).toBe(100);
  });

  it('computePreacherNotesQueryString builds URLSearchParams query string', () => {
    const { computePreacherNotesQueryString, PREACHER_NOTES_ATTRIBUTE_KEY } = require('./preacherNotes');
    const notes = [{ name: 'Test.pdf', path: 'PreacherNotes/MNL/1/ab/test.pdf' }];
    const qs = computePreacherNotesQueryString(notes);
    expect(qs).toContain(`attributeKey=${PREACHER_NOTES_ATTRIBUTE_KEY}`);
    expect(qs).toContain('attributeValue=');
    expect(qs).toContain('Test.pdf');
  });
});

