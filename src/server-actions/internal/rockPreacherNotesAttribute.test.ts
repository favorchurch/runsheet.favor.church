import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { rockGet, rockPatch, rockPost } from '@/server-actions/internal/rockFetch';
import {
  CONTENT_CHANNEL_ENTITY_TYPE_NAME,
  ensurePreacherNotesAttribute,
  getPreacherNotesAttributeValue,
  mutatePreacherNotesAttribute,
  resetPreacherNotesAttributeCache,
  RUNSHEET_CONTENT_CHANNEL_TYPE_ID,
  setPreacherNotesAttributeValue,
} from './rockPreacherNotesAttribute';
import { PREACHER_NOTES_ATTRIBUTE_GUID, PREACHER_NOTES_ATTRIBUTE_KEY } from '@/lib/preacherNotes';

jest.mock('@/server-actions/internal/rockFetch', () => ({
  rockGet: jest.fn(),
  rockPost: jest.fn(),
  rockPatch: jest.fn(),
}));

const mockRockGet = jest.mocked(rockGet);
const mockRockPost = jest.mocked(rockPost);
const mockRockPatch = jest.mocked(rockPatch);

const MOCK_ENTITY_TYPE_ID = 209;
const MOCK_MEMO_FIELD_TYPE_ID = 2;
const MOCK_ATTRIBUTE_ID = 8888;

describe('rockPreacherNotesAttribute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPreacherNotesAttributeCache();

    mockRockGet.mockImplementation(async (url: string, params?: any) => {
      if (url === '/EntityTypes') {
        return [{ Id: MOCK_ENTITY_TYPE_ID, Name: CONTENT_CHANNEL_ENTITY_TYPE_NAME }];
      }
      if (url === '/FieldTypes') {
        return [{ Id: MOCK_MEMO_FIELD_TYPE_ID, Name: 'Memo' }];
      }
      if (url === '/Attributes') {
        return [];
      }
      if (url === '/AttributeValues') {
        return [];
      }
      return [];
    });

    mockRockPost.mockImplementation(async (url: string) => {
      if (url === '/Attributes') return MOCK_ATTRIBUTE_ID;
      if (url === '/AttributeValues') return 9999;
      return 1;
    });

    mockRockPatch.mockResolvedValue(null);
  });

  describe('read operations (getPreacherNotesAttributeValue)', () => {
    it('returns empty array when attribute does not exist in Rock, making no POST', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/Attributes') return [];
        return [];
      });

      const notes = await getPreacherNotesAttributeValue(42);
      expect(notes).toEqual([]);
      expect(mockRockPost).not.toHaveBeenCalled();
      expect(mockRockPatch).not.toHaveBeenCalled();
    });

    it('returns empty array when attribute exists but no value row exists', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/Attributes') return [{ Id: MOCK_ATTRIBUTE_ID }];
        if (url === '/AttributeValues') return [];
        return [];
      });

      const notes = await getPreacherNotesAttributeValue(42);
      expect(notes).toEqual([]);
      expect(mockRockPost).not.toHaveBeenCalled();
    });

    it('returns parsed notes when attribute and value exist', async () => {
      const storedNotes = [
        {
          name: 'Notes.pdf',
          path: 'PreacherNotes/MNL/42/deadbeef/notes.pdf',
          size: 1234,
          uploadedAt: '2026-10-06T00:00:00Z',
        },
      ];

      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/Attributes') return [{ Id: MOCK_ATTRIBUTE_ID }];
        if (url === '/AttributeValues') {
          return [{ Id: 101, AttributeId: MOCK_ATTRIBUTE_ID, Value: JSON.stringify(storedNotes) }];
        }
        return [];
      });

      const notes = await getPreacherNotesAttributeValue(42);
      expect(notes).toEqual(storedNotes);
      expect(mockRockPost).not.toHaveBeenCalled();
    });
  });

  describe('ensurePreacherNotesAttribute', () => {
    it('creates attribute with fixed Guid, Memo FieldType, resolved EntityType, and qualifier 13 when missing', async () => {
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
    });

    it('is idempotent: second ensure makes no POST', async () => {
      const firstId = await ensurePreacherNotesAttribute();
      expect(firstId).toBe(MOCK_ATTRIBUTE_ID);
      expect(mockRockPost).toHaveBeenCalledTimes(1);

      const secondId = await ensurePreacherNotesAttribute();
      expect(secondId).toBe(MOCK_ATTRIBUTE_ID);
      expect(mockRockPost).toHaveBeenCalledTimes(1); // No additional POST
    });

    it('shares single in-flight promise during concurrent ensurePreacherNotesAttribute calls', async () => {
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
        return [];
      });

      const id = await ensurePreacherNotesAttribute();
      expect(id).toBe(MOCK_ATTRIBUTE_ID);
    });

    it('makes no POST if attribute already exists in Rock prior to ensure', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/Attributes') return [{ Id: 7777 }];
        return [];
      });

      const id = await ensurePreacherNotesAttribute();
      expect(id).toBe(7777);
      expect(mockRockPost).not.toHaveBeenCalled();
    });
  });

  describe('write operations (setPreacherNotesAttributeValue)', () => {
    it('creates a new AttributeValue when none exists', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/FieldTypes') return [{ Id: MOCK_MEMO_FIELD_TYPE_ID }];
        if (url === '/Attributes') return [{ Id: MOCK_ATTRIBUTE_ID }];
        if (url === '/AttributeValues') return [];
        return [];
      });

      const notes = [
        {
          name: 'Notes.pdf',
          path: 'PreacherNotes/MNL/42/1234/notes.pdf',
        },
      ];

      const result = await setPreacherNotesAttributeValue(42, notes);
      expect(result).toEqual(notes);

      expect(mockRockPost).toHaveBeenCalledWith('/AttributeValues', {
        AttributeId: MOCK_ATTRIBUTE_ID,
        EntityId: 42,
        Value: JSON.stringify(notes),
      });
      expect(mockRockPatch).not.toHaveBeenCalled();
    });

    it('patches an existing AttributeValue when a record already exists', async () => {
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/Attributes') return [{ Id: MOCK_ATTRIBUTE_ID }];
        if (url === '/AttributeValues') return [{ Id: 5432, Value: '[]' }];
        return [];
      });

      const notes = [
        {
          name: 'Notes.pdf',
          path: 'PreacherNotes/MNL/42/1234/notes.pdf',
        },
      ];

      const result = await setPreacherNotesAttributeValue(42, notes);
      expect(result).toEqual(notes);

      expect(mockRockPatch).toHaveBeenCalledWith('/AttributeValues/5432', {
        Value: JSON.stringify(notes),
      });
      expect(mockRockPost).not.toHaveBeenCalledWith('/AttributeValues', expect.anything());
    });
  });

  describe('atomic serialized mutations (mutatePreacherNotesAttribute)', () => {
    it('serializes concurrent mutations on the same channel to prevent dropped updates', async () => {
      let storedValue = '[]';
      mockRockGet.mockImplementation(async (url: string) => {
        if (url === '/EntityTypes') return [{ Id: MOCK_ENTITY_TYPE_ID }];
        if (url === '/Attributes') return [{ Id: MOCK_ATTRIBUTE_ID }];
        if (url === '/AttributeValues') return [{ Id: 9001, Value: storedValue }];
        return [];
      });
      mockRockPatch.mockImplementation(async (_url: string, body: any) => {
        storedValue = body.Value;
        return {} as any;
      });

      // Launch two concurrent mutations
      const op1 = mutatePreacherNotesAttribute(42, async (current) => {
        // slight delay to simulate async processing
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
    });
  });
});

