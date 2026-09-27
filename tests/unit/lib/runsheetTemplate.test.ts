import {
  buildDefaultTemplateItems,
  isMasterTemplateName,
  masterTemplateName,
} from '@/lib/runsheetTemplate';
import { DEFAULT_RUNSHEET_TEMPLATE } from '@/constants/defaultRunsheetTemplate';

describe('runsheetTemplate', () => {
  it('names a template after its campus', () => {
    expect(masterTemplateName('MNL')).toBe('MNL // Runsheet Master Template');
    expect(masterTemplateName('BNE')).toBe('BNE // Runsheet Master Template');
  });

  it('recognises template names, ignoring case and surrounding whitespace', () => {
    expect(isMasterTemplateName('MNL // Runsheet Master Template')).toBe(true);
    expect(isMasterTemplateName('  sel // runsheet master template  ')).toBe(true);
    expect(isMasterTemplateName('Runsheet Master Template')).toBe(true);
  });

  it('does not treat ordinary runsheets as templates', () => {
    expect(isMasterTemplateName('MNL Crowne // August 9, 2026 // 10AM')).toBe(false);
    expect(isMasterTemplateName('MNL // Runsheet Master Template copy')).toBe(false);
    expect(isMasterTemplateName('')).toBe(false);
  });

  it('builds new, ordered items from the hardcoded default template', () => {
    const items = buildDefaultTemplateItems();
    expect(items).toHaveLength(DEFAULT_RUNSHEET_TEMPLATE.length);
    items.forEach((item, idx) => {
      expect(item.isNew).toBe(true);
      expect(typeof item.id).toBe('string');
      expect(item.order).toBe(idx + 1);
      expect(item.title).toBe(DEFAULT_RUNSHEET_TEMPLATE[idx].title);
    });
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});
