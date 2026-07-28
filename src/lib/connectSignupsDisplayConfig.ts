import { z } from 'zod';

export const filterDisplayConfigSchema = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(1),
  mobileLabel: z.string().trim().min(1),
});

export const locationFilterConfigSchema = filterDisplayConfigSchema.extend({
  sourceField: z.enum(['locality', 'landmark']),
  splitValues: z.boolean(),
});

export const campusDisplayConfigSchema = z.object({
  version: z.literal(1),
  filters: z.object({
    forAgeGroup: filterDisplayConfigSchema,
    meetupDay: filterDisplayConfigSchema,
    location: locationFilterConfigSchema,
    tags: filterDisplayConfigSchema,
  }),
});

const partialFilterDisplayConfigSchema = filterDisplayConfigSchema.partial();
const partialLocationFilterConfigSchema = locationFilterConfigSchema.partial();
const partialCampusDisplayConfigSchema = z.object({
  version: z.literal(1).optional(),
  filters: z
    .object({
      forAgeGroup: partialFilterDisplayConfigSchema.optional(),
      meetupDay: partialFilterDisplayConfigSchema.optional(),
      location: partialLocationFilterConfigSchema.optional(),
      tags: partialFilterDisplayConfigSchema.optional(),
    })
    .partial()
    .optional(),
});

export type FilterDisplayConfig = z.infer<typeof filterDisplayConfigSchema>;
export type LocationFilterConfig = z.infer<typeof locationFilterConfigSchema>;
export type CampusDisplayConfig = z.infer<typeof campusDisplayConfigSchema>;

const standardFilters = {
  forAgeGroup: { enabled: true, label: 'Age Group', mobileLabel: 'Age' },
  meetupDay: { enabled: true, label: 'Meetup Day', mobileLabel: 'Day' },
  tags: { enabled: true, label: 'Demographics', mobileLabel: 'Demographics' },
} satisfies Omit<CampusDisplayConfig['filters'], 'location'>;

/** Shared v1 defaults used by the portal and connectsignups.favor.church. */
export function defaultConfigForShortCode(shortCode: string): CampusDisplayConfig {
  const isManila = shortCode.trim().toUpperCase() === 'MNL';

  return {
    version: 1,
    filters: {
      forAgeGroup: { ...standardFilters.forAgeGroup },
      meetupDay: { ...standardFilters.meetupDay },
      location: isManila
        ? {
            enabled: true,
            label: 'City',
            mobileLabel: 'City',
            sourceField: 'locality',
            splitValues: false,
          }
        : {
            enabled: true,
            label: 'Suburb',
            mobileLabel: 'Suburb',
            sourceField: 'landmark',
            splitValues: true,
          },
      tags: { ...standardFilters.tags },
    },
  };
}

/**
 * Safely layer a persisted partial configuration over the campus defaults.
 * Invalid JSON, invalid values, and non-object inputs deliberately return the
 * defaults so the public app always receives a usable v1 configuration.
 */
export function mergeOverDefaults(
  shortCode: string,
  partial: unknown,
): CampusDisplayConfig {
  let candidate = partial;

  if (typeof partial === 'string') {
    try {
      candidate = JSON.parse(partial);
    } catch {
      return defaultConfigForShortCode(shortCode);
    }
  }

  const parsed = partialCampusDisplayConfigSchema.safeParse(candidate);
  if (!parsed.success) return defaultConfigForShortCode(shortCode);

  const defaults = defaultConfigForShortCode(shortCode);
  const filters = parsed.data.filters;

  return {
    version: 1,
    filters: {
      forAgeGroup: { ...defaults.filters.forAgeGroup, ...filters?.forAgeGroup },
      meetupDay: { ...defaults.filters.meetupDay, ...filters?.meetupDay },
      location: { ...defaults.filters.location, ...filters?.location },
      tags: { ...defaults.filters.tags, ...filters?.tags },
    },
  };
}
