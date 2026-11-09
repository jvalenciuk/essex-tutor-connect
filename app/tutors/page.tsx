
import { db } from '../../lib/db';
import InquiryForm from './inquiry-form';
import TutorAvailability from './tutor-availability';

export const dynamic = 'force-dynamic';

type Search = {
  subject?: string;
  city?: string;
};

export default async function Tutors({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const q = await searchParams;

  const profiles = await db.tutorProfile.findMany({
    where: {
      verification: 'APPROVED',
      ...(q.subject
        ? { subjects: { has: q.subject } }
        : {}),
      ...(q.city
        ? { cities: { has: q.city } }
        : {}),
    },
    include: {
      user: {
        select: { name: true },
      },
    },
    take: 100,
  });

  return (
    <main>
      <h1>Find a tutor</h1>

      <p className="muted">
        Browse administrator-approved tutors,
        compare their availability, and send
        an inquiry to get started.
      </p>

      <form method="GET" className="cards">
        <label>
          Subject
          <input
            className="field"
            name="subject"
            defaultValue={q.subject || ''}
            placeholder="e.g. French"
          />
        </label>

        <label>
          City
          <input
            className="field"
            name="city"
            defaultValue={q.city || ''}
            placeholder="e.g. Windsor"
          />
        </label>

        <button type="submit">
          Search
        </button>
      </form>

      <div className="cards">
        {profiles.map(tutor => (
          <div
            className="card"
            key={tutor.id}
          >
            <h2>{tutor.user.name}</h2>

            <p>
              {tutor.cities.join(', ')}
            </p>

            <p>
              {tutor.subjects.map(subject => (
                <span
                  className="tag"
                  key={subject}
                >
                  {subject}
                </span>
              ))}
            </p>

            <p>{tutor.bio}</p>

            <p>
              <strong>
                $
                {(
                  tutor.hourlyRateCents / 100
                ).toFixed(2)}
                {' CAD/hour'}
              </strong>
            </p>

            <p className="muted">
              {tutor.online
                ? 'Online tutoring available'
                : 'Contact tutor about session location'}
            </p>

            <TutorAvailability
              tutorId={tutor.id}
            />

            <InquiryForm
              tutorId={tutor.id}
              name={tutor.user.name}
            />
          </div>
        ))}

        {!profiles.length && (
          <p>
            No approved tutors match your
            search yet.
          </p>
        )}
      </div>
    </main>
  );
}
