import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { rockGet, rockPost } from '@/server-actions/internal/rockFetch';
import {
  CONTENT_CHANNEL_ENTITY_TYPE_NAME,
  ensurePreacherNotesAttribute,
  getPreacherNotesAttributeValue,
  mutatePreacherNotesAttribute,
  resetPreacherNotesAttributeCache,
  RUNSHEET_CONTENT_CHANNEL_TYPE_ID,
  setPreacherNotesAttributeValue,
} from './rockPreacherNotesAttribute';
import {
  PREACHER_NOTES_ATTRIBUTE_GUID,
  PREACHER_NOTES_ATTRIBUTE_KEY,
  PREACHER_NOTES_MAX_COUNT,
} from '@/lib/preacherNotes';
import type { PreacherNote } from '@/types/PreacherNotes';

jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockGet: jest.fn(),
  rockPost: jest.fn(),
  rockPatch: jest.fn(),
}));

const mockRockGet = jest.mocked(rockGet);
const mockRockPost = jest.mocked(rockPost);

const MOCK_ENTITY_TYPE_ID = 209;
const MOCK_MEMO_FIELD_TYPE_ID = 2;
const MOCK_ATTRIBUTE_ID = 8888;

function expectNeverCalledAttributeValues() {
  for (const call of mockRockGet.mock.calls) {
    expect(call[0]).not.toContain('/AttributeValues');
  }
  for (const call of mockRockPost.mock.calls) {
    expect(call[0]).not.toContain('/AttributeValues');
  }
}

describe('rockPreacherNotesAttribute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPreacherNotesAttributeCache();

    mockRockGet.mockImplementation(async (url: string) => {
      if (url === '/EntityTypes') {
        return [{ Id: MOCK_ENTITY_TYPE_ID, Name: CONTENT_CHANNEL_ENTITY_TYPE_NAME }];
      }
      if (url === '/FieldTypes') {
        return [{ Id: MOCK_MEMO_FIELD_TYPE_ID, Name: 'Memo' }];
      }
      if (url === '/Attributes') {
        return [{ Id: MOCK_ATTRIBUTE_ID }];
      }
      return null;
    });

    mockRockPost.mockImplementation(async (url: string) => {
      if (url === '/Attributes') return MOCK_ATTRIBUTE_ID;
      if (url.startsWith('/ContentChannels/AttributeValue/')) return 202;
      return 1;
    });
  });

  describe('read operations (getPreacherNotesAttributeValue)', () => {
    it('reads via rockGet(/ContentChannels/<id>, { loadAttributes: simple }, true) and returns [] when AttributeValues is missing or channel is null', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/ContentChannels/42') {
          return { Id: 42, AttributeValues: null };
        }
        return null;
      });

      const notes = await getPreacherNotesAttributeValue(42);
      expect(notes).toEqual([]);
      expect(mockRockGet).toHaveBeenCalledWith(
        '/ContentChannels/42',
        { loadAttributes: 'simple' },
        true,
      );
      expect(mockRockPost).not.toHaveBeenCalled();
      expectNeverCalledAttributeValues();
    });

    it('returns empty array when PreacherNotes attribute value is absent or empty', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/ContentChannels/42') {
          return {
            Id: 42,
            AttributeValues: {
              PreacherNotes: { Value: '' },
            },
          };
        }
        return null;
      });

      const notes = await getPreacherNotesAttributeValue(42);
      expect(notes).toEqual([]);
      expect(mockRockGet).toHaveBeenCalledWith(
        '/ContentChannels/42',
        { loadAttributes: 'simple' },
        true,
      );
      expect(mockRockPost).not.toHaveBeenCalled();
      expectNeverCalledAttributeValues();
    });

    it('returns parsed notes when PreacherNotes attribute value exists', async () => {
      const storedNotes: PreacherNote[] = [
        {
          name: 'Notes.pdf',
          path: 'PreacherNotes/MNL/42/deadbeef/notes.pdf',
          size: 1234,
          uploadedAt: '2026-10-06T00:00:00Z',
        },
      ];

      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/ContentChannels/42') {
          return {
            Id: 42,
            AttributeValues: {
              PreacherNotes: { Value: JSON.stringify(storedNotes) },
            },
          };
        }
        return null;
      });

      const notes = await getPreacherNotesAttributeValue(42);
      expect(notes).toEqual(storedNotes);
      expect(mockRockPost).not.toHaveBeenCalled();
      expectNeverCalledAttributeValues();
    });
  });

  describe('ensurePreacherNotesAttribute', () => {
    it('creates attribute with fixed Guid, Memo FieldType, resolved EntityType, and qualifier 13 when missing', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/FieldTypes') return [{ Id: MOCK_MEMO_FIELD_TYPE_ID }];
        if (url === '/Attributes') return [];
        return null;
      });

      const attributeId = await ensurePreacherNotesAttribute();
      expect(attributeId).toBe(MOCK_ATTRIBUTE_ID);

      expect(mockRockPost).toHaveBeenCalledWith('/Attributes', {
        Guid: PREACHER_NOTES_ATTRIBUTE_GUID,
        Key: PREACHER_NOTES_ATTRIBUTE_KEY,
        Name: 'Preacher Notes',
        FieldTypeId: MOCK_MEMO_FIELD_TYPE_ID,
        EntityTypeId: MOCK_ENTITY_TYPE_ID,
        EntityTypeQualifierColumn: 'ContentChannelTypeId',
        EntityTypeQualifierValue: RUNSHEET_CONTENT_CHANNEL_TYPE_ID,
        IsGridColumn: false,
        IsMultiValue: false,
        IsRequired: false,
      });
      expectNeverCalledAttributeValues();
    });

    it('is idempotent: second ensure makes no POST', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/FieldTypes') return [{ Id: MOCK_MEMO_FIELD_TYPE_ID }];
        if (url === '/Attributes') return [];
        return null;
      });

      const firstId = await ensurePreacherNotesAttribute();
      expect(firstId).toBe(MOCK_ATTRIBUTE_ID);
      expect(mockRockPost).toHaveBeenCalledTimes(1);

      const secondId = await ensurePreacherNotesAttribute();
      expect(secondId).toBe(MOCK_ATTRIBUTE_ID);
      expect(mockRockPost).toHaveBeenCalledTimes(1);
      expectNeverCalledAttributeValues();
    });

    it('shares single in-flight promise during concurrent ensurePreacherNotesAttribute calls', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/FieldTypes') return [{ Id: MOCK_MEMO_FIELD_TYPE_ID }];
        if (url === '/Attributes') return [];
        return null;
      });

      mockRockPost.mockImplementation(async (url: string) => {
        if (url === '/Attributes') {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return MOCK_ATTRIBUTE_ID;
        }
        return 1;
      });

      const [id1, id2] = await Promise.all([
        ensurePreacherNotesAttribute(),
        ensurePreacherNotesAttribute(),
      ]);

      expect(id1).toBe(MOCK_ATTRIBUTE_ID);
      expect(id2).toBe(MOCK_ATTRIBUTE_ID);
      expect(mockRockPost).toHaveBeenCalledTimes(1);
      expectNeverCalledAttributeValues();
    });

    it('re-checks attribute id if POST fails due to concurrent creation race', async () => {
      let postAttempted = false;
      mockRockPost.mockImplementation(async (url: string) => {
        if (url === '/Attributes') {
          postAttempted = true;
          throw new Error('Attribute with Guid already exists');
        }
        return 1;
      });

      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/FieldTypes') return [{ Id: MOCK_MEMO_FIELD_TYPE_ID }];
        if (url === '/Attributes') {
          return postAttempted ? [{ Id: MOCK_ATTRIBUTE_ID }] : [];
        }
        return null;
      });

      const id = await ensurePreacherNotesAttribute();
      expect(id).toBe(MOCK_ATTRIBUTE_ID);
      expectNeverCalledAttributeValues();
    });

    it('makes no POST if attribute already exists in Rock prior to ensure', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/Attributes') return [{ Id: 7777 }];
        return null;
      });

      const id = await ensurePreacherNotesAttribute();
      expect(id).toBe(7777);
      expect(mockRockPost).not.toHaveBeenCalled();
      expectNeverCalledAttributeValues();
    });
  });

  describe('write operations (setPreacherNotesAttributeValue)', () => {
    it('writes via rockPost(/ContentChannels/AttributeValue/<id>, undefined, { attributeKey, attributeValue }) and never calls /AttributeValues', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/FieldTypes') return [{ Id: MOCK_MEMO_FIELD_TYPE_ID }];
        if (url === '/Attributes') return [{ Id: MOCK_ATTRIBUTE_ID }];
        return null;
      });

      const notes: PreacherNote[] = [
        {
          name: 'Notes.pdf',
          path: 'PreacherNotes/MNL/42/1234/notes.pdf',
        },
      ];

      const result = await setPreacherNotesAttributeValue(42, notes);
      expect(result).toEqual(notes);

      expect(mockRockPost).toHaveBeenCalledWith(
        '/ContentChannels/AttributeValue/42',
        undefined,
        {
          attributeKey: PREACHER_NOTES_ATTRIBUTE_KEY,
          attributeValue: JSON.stringify(notes),
        },
      );
      expectNeverCalledAttributeValues();
    });

    it('ensures attribute before write when attribute is not yet created', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/FieldTypes') return [{ Id: MOCK_MEMO_FIELD_TYPE_ID }];
        if (url === '/Attributes') return [];
        return null;
      });

      const notes: PreacherNote[] = [
        {
          name: 'Notes.pdf',
          path: 'PreacherNotes/MNL/42/1234/notes.pdf',
        },
      ];

      const result = await setPreacherNotesAttributeValue(42, notes);
      expect(result).toEqual(notes);

      expect(mockRockPost).toHaveBeenCalledWith('/Attributes', expect.anything());
      expect(mockRockPost).toHaveBeenCalledWith(
        '/ContentChannels/AttributeValue/42',
        undefined,
        {
          attributeKey: PREACHER_NOTES_ATTRIBUTE_KEY,
          attributeValue: JSON.stringify(notes),
        },
      );
      expectNeverCalledAttributeValues();
    });

    it('throws an error if attempting to save more than 10 notes to protect query string limit', async () => {
      const elevenNotes: PreacherNote[] = Array.from(
        { length: PREACHER_NOTES_MAX_COUNT + 1 },
        (_, i) => ({
          name: `note_${i}.pdf`,
          path: `PreacherNotes/MNL/42/deadbeef${i}/note_${i}.pdf`,
        }),
      );

      await expect(setPreacherNotesAttributeValue(42, elevenNotes)).rejects.toThrow(
        'A runsheet can hold up to 10 Preacher Notes PDFs',
      );

      expect(mockRockPost).not.toHaveBeenCalled();
      expectNeverCalledAttributeValues();
    });
  });

  describe('atomic serialized mutations (mutatePreacherNotesAttribute)', () => {
    it('serializes concurrent mutations on the same channel and never calls /AttributeValues', async () => {
      let storedNotes: PreacherNote[] = [];

      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/Attributes') return [{ Id: MOCK_ATTRIBUTE_ID }];
        if (url === '/ContentChannels/42') {
          return {
            Id: 42,
            AttributeValues: {
              PreacherNotes: { Value: JSON.stringify(storedNotes) },
            },
          };
        }
        return null;
      });

      mockRockPost.mockImplementation(async (url: string, _body: any, params?: any) => {
        if (url === '/ContentChannels/AttributeValue/42' && params?.attributeValue) {
          storedNotes = JSON.parse(params.attributeValue);
          return 202;
        }
        return 1;
      });

      const op1 = mutatePreacherNotesAttribute(42, async (current) => {
        await new Promise((r) => setTimeout(r, 20));
        return [...current, { name: 'Note 1.pdf', path: 'PreacherNotes/MNL/42/11/note1.pdf' }];
      });

      const op2 = mutatePreacherNotesAttribute(42, async (current) => {
        await new Promise((r) => setTimeout(r, 10));
        return [...current, { name: 'Note 2.pdf', path: 'PreacherNotes/MNL/42/22/note2.pdf' }];
      });

      const [res1, res2] = await Promise.all([op1, op2]);

      expect(res1).toHaveLength(1);
      expect(res2).toHaveLength(2);
      expect(res2.map((n) => n.name)).toEqual(['Note 1.pdf', 'Note 2.pdf']);
      expectNeverCalledAttributeValues();
    });

    it('skips rockPost when mutate leaves notes unchanged (e.g. unlinking non-existent note)', async () => {
      const existingNotes: PreacherNote[] = [
        { name: 'Note 1.pdf', path: 'PreacherNotes/MNL/42/11/note1.pdf' },
      ];

      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/ContentChannels/42') {
          return {
            Id: 42,
            AttributeValues: {
              PreacherNotes: { Value: JSON.stringify(existingNotes) },
            },
          };
        }
        return null;
      });

      const result = await mutatePreacherNotesAttribute(42, async (current) => {
        // Attempt to remove a note that is not in the list
        return current.filter((n) => n.path !== 'PreacherNotes/MNL/42/99/nonexistent.pdf');
      });

      expect(result).toEqual(existingNotes);
      // No POST made to /ContentChannels/AttributeValue/42 or /Attributes
      expect(mockRockPost).not.toHaveBeenCalled();
      expectNeverCalledAttributeValues();
    });
  });
});
