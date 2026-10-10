import { isPersonColumn, ROCK_PERSON_FIELD_TYPE_ID } from '@/constants/runsheetColumns';
import type { DynamicAttributeColumn } from '@/types/Runsheet';

/**
 * Checks whether a column holds person-sourced data that requires sanitization.
 */
export function isRunsheetPersonColumn(column: Pick<DynamicAttributeColumn, 'key' | 'fieldTypeId'>): boolean {
  if (column.fieldTypeId === ROCK_PERSON_FIELD_TYPE_ID) return true;
  return isPersonColumn(column);
}

/**
 * Scrubs values originating from Person attributes.
 *
 * NOTE: Only person-sourced values are scrubbed; authored free text renders
 * verbatim as in the UI (no global regex scrub).
 *
 * Person columns render display names only; any value still matching a GUID or
 * numeric-id pattern after resolution, or containing an email address, renders as "—".
 */
export function scrubPersonValue(value: string | undefined | null): string {
  if (!value) return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  // 1. Matches standard or hyphenless GUID / PersonAlias GUID
  const isGuid =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed) ||
    /^[0-9a-fA-F]{32}$/.test(trimmed);

  // 2. Matches bare numeric Rock ID
  const isNumericId = /^\d+$/.test(trimmed);

  // 3. Contains an email address
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed);

  // 4. Matches phone-shaped values (only digits, '+', spaces, dashes, parentheses, dots with 7+ digits)
  const isPhoneShape =
    /^[0-9+\s\-().]+$/.test(trimmed) && (trimmed.match(/\d/g) ?? []).length >= 7;

  if (isGuid || isNumericId || hasEmail || isPhoneShape) {
    return '—';
  }

  return trimmed;
}
