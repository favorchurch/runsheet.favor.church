import { z } from 'zod';
import { RockConnectGroupData } from '../RockGroup';

export type Weekday = NonNullable<RockConnectGroupData['meetupDay']>;
export const weekday = (): z.ZodType<Weekday> =>
  z.enum(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
