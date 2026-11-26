import { db } from './db';

export async function getPublishedTutors() {
  const approvedTutors = await db.tutorProfile.findMany({
    where: { verification: 'APPROVED' },
    select: {
      id: true,
      bio: true,
      qualifications: true,
      subjects: true,
      grades: true,
      cities: true,
      languages: true,
      online: true,
      hourlyRateCents: true,
      user: { select: { name: true } },
    },
    orderBy: [{ hourlyRateCents: 'asc' }, { id: 'asc' }],
  });

  return approvedTutors.filter(tutor =>
    tutor.bio.trim().length >= 30 &&
    tutor.qualifications.trim().length >= 10 &&
    tutor.subjects.length > 0 &&
    tutor.grades.length > 0 &&
    tutor.cities.length > 0 &&
    tutor.languages.length > 0 &&
    tutor.hourlyRateCents >= 2000 &&
    tutor.hourlyRateCents <= 30000
  );
}

export function tutorFilterOptions(values: string[][]): string[] {
  const options = new Set(values.flat().filter(value => value.trim()));
  return [...options].sort((a, b) =>
    a.localeCompare(b, 'en-CA', { numeric: true, sensitivity: 'base' })
  );
}
