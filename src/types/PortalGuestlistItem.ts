import { RockGuestlistItem } from './RockGuestlist';
import { PortalContact, normalizePortalContact } from './PortalContact';

export interface PortalGuestlistItem extends RockGuestlistItem, PortalContact {}

export function normalizePortalGuestlistItem(item: RockGuestlistItem): PortalGuestlistItem {
  return {
    ...item,
    ...normalizePortalContact(item),
  };
}
