import { describe, expect, it } from '@jest/globals';
import {
  buildAttachmentKey,
  isAllowedAttachmentKey,
  parseAttachments,
  serializeAttachments,
  type RunsheetAttachment,
} from './runsheetAttachments';

const entry: RunsheetAttachment = {
  key: 'PreacherNotes/MNL/1042/9f3c/nov-2-notes.pdf',
  name: 'Nov 2 notes.pdf',
  size: 184320,
  uploadedAt: '2026-09-28T02:11:00.000Z',
};

describe('parseAttachments', () => {
  it('reads a stored array', () => {
    expect(parseAttachments(JSON.stringify([entry]))).toEqual([entry]);
  });

  it('treats absent, empty and malformed values as no attachments', () => {
    expect(parseAttachments(undefined)).toEqual([]);
    expect(parseAttachments('')).toEqual([]);
    expect(parseAttachments('   ')).toEqual([]);
    expect(parseAttachments('not json')).toEqual([]);
    expect(parseAttachments('{"key":"x"}')).toEqual([]);
  });

  it('drops entries that are not shaped like an attachment', () => {
    const mixed = JSON.stringify([entry, { key: 'a' }, null, { ...entry, size: 'big' }]);
    expect(parseAttachments(mixed)).toEqual([entry]);
  });

  it('round-trips through serialize', () => {
    expect(parseAttachments(serializeAttachments([entry]))).toEqual([entry]);
  });

  it('serializes an empty list as an empty string so Rock stores nothing', () => {
    expect(serializeAttachments([])).toBe('');
  });
});

describe('buildAttachmentKey', () => {
  it('partitions by campus and item, and slugifies the filename', () => {
    expect(buildAttachmentKey('MNL | 10AM Sunday Service', 1042, 'Nov 2 Notes.pdf', '9f3c')).toBe(
      'PreacherNotes/MNL/1042/9f3c/nov-2-notes.pdf',
    );
  });

  it('files a channel with no campus under ALL', () => {
    expect(buildAttachmentKey('Master Template', 7, 'notes.pdf', 'abcd')).toBe(
      'PreacherNotes/ALL/7/abcd/notes.pdf',
    );
  });

  it('strips path separators out of the filename', () => {
    expect(buildAttachmentKey('BNE | 9AM', 3, '../../etc/passwd.pdf', 'ffff')).toBe(
      'PreacherNotes/BNE/3/ffff/etc-passwd.pdf',
    );
  });
});

describe('isAllowedAttachmentKey', () => {
  it('accepts keys inside a campus folder', () => {
    expect(isAllowedAttachmentKey('PreacherNotes/SEL/9/abcd/notes.pdf')).toBe(true);
  });

  it('rejects traversal, other roots and non-pdf keys', () => {
    expect(isAllowedAttachmentKey('PreacherNotes/MNL/../../web.config')).toBe(false);
    expect(isAllowedAttachmentKey('Other/MNL/1/a/notes.pdf')).toBe(false);
    expect(isAllowedAttachmentKey('PreacherNotes/XXX/1/a/notes.pdf')).toBe(false);
    expect(isAllowedAttachmentKey('PreacherNotes/MNL/1/a/notes.exe')).toBe(false);
    expect(isAllowedAttachmentKey('')).toBe(false);
  });
});
