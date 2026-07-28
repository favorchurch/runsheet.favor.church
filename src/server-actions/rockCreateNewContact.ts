'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockPost } from '@/server-actions/internal/rockFetch';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';
import { RockPerson } from '@/types/RockPerson';
import { z } from 'zod';
import { NewContactSchema } from '../components/NewContact/NewContactSchema';

type NewContactErrors = z.typeToFlattenedError<z.infer<typeof NewContactSchema>>['fieldErrors'];

interface NewContactState {
  contact: RockPerson | null;
  errors: NewContactErrors | string | null;
}

/**
 * Create a new person in Rock.
 * Replaces fluroCreateNewContact.
 * Intentionally auth-only per issue #35 because attendance leaders use this
 * inside already-authorized group attendance flows.
 */
export async function rockCreateNewContact(formData: FormData): Promise<NewContactState> {
  await assertAuthenticated();

  const validatedData = NewContactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!validatedData.success) {
    return {
      contact: null,
      errors: validatedData.error.flatten().fieldErrors,
    };
  }

  try {
    const data = validatedData.data;

    // Map gender string to Rock integer
    const genderMap: Record<string, number> = { male: 1, female: 2 };
    const gender = genderMap[(data as any).gender?.toLowerCase()] || 0;

    const personId = await rockPost('/People', {
      FirstName: data.firstName,
      LastName: data.lastName,
      Email: (data as any).email || undefined,
      Gender: gender,
      BirthDate: (data as any).dob || undefined,
      RecordStatusValueId: 3, // Active
      ConnectionStatusValueId: 67, // New
      PrimaryCampusId: Number((data as any).campuses?.[0]) || undefined,
    });

    revalidateTag('rock:people');
    await rockClearGroupHierarchyCache();

    // Fetch the created person
    const { rockGet } = await import('@/server-actions/internal/rockFetch');
    const person: RockPerson = await rockGet(`/People/${personId}`, {
      $select: 'Id,FirstName,LastName,NickName,Email,Gender,BirthDate,PrimaryCampusId,PrimaryAliasId,RecordStatusValueId,CreatedDateTime',
      $expand: 'PhoneNumbers',
    });

    return {
      contact: person,
      errors: null,
    };
  } catch (err: any) {
    return {
      contact: null,
      errors: `${err.message}`,
    };
  }
}
