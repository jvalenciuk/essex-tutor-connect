
import { db } from '../../lib/db';
import InquiryForm from './inquiry-form';
import TutorAvailability from './tutor-availability';

export const dynamic = 'force-dynamic';

type Filters = {
  subject?: string;
  grade?: string;
  city?: string;
  online?: string;
  maxRate?: string;
};

function tags(items: string[]) {
  return items.map(item => (
    <span
      key={item}
      className="tag"
      style={{ margin: '3px' }}
    >
      {item}
    </span>
  ));
}

export default async function Tutors({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const q = await searchParams;

  const maxRate = Number(q.maxRate);

  const validRate =
    q.maxRate &&
    Number.isFinite(maxRate) &&
    maxRate > 0;

  const tutors = await db.tutorProfile.findMany({
    where: {
      verification: 'APPROVED',
      ...(q.subject
        ? { subjects: { has: q.subject } }
        : {}),
      ...(q.grade
        ? { grades: { has: q.grade } }
        : {}),
      ...(q.city
        ? { cities: { has: q.city } }
        : {}),
      ...(q.online === 'yes'
        ? { online: true }
        : {}),
      ...(validRate
        ? {
            hourlyRateCents: {
              lte: Math.round(maxRate * 100),
            },
          }
        : {}),
    },
    include: {
      user: {
        select: { name: true },
      },
    },
    orderBy: {
      hourlyRateCents: 'asc',
    },
    take: 100,
  });

  return (
    <main style={{ maxWidth: 1150, margin: '0 auto' }}>
      <h1>Find your tutor</h1>

      <p className="muted">
        Explore approved tutors in Windsor and
        Essex County. Compare qualifications,
        subjects, rates, and availability.
      </p>

      <form
        method="GET"
        className="card"
        style={{
          marginBottom: 24,
        }}
      >
        <h2>Find the right match</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
            gap: 14,
          }}
        >
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
            Grade
            <input
              className="field"
              name="grade"
              defaultValue={q.grade || ''}
              placeholder="e.g. Grade 7"
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

          <label>
            Maximum hourly rate (CAD)
            <input
              className="field"
              name="maxRate"
              type="number"
              min="1"
              step="1"
              defaultValue={q.maxRate || ''}
              placeholder="e.g. 50"
            />
          </label>

          <label>
            Online tutoring
            <select
              className="field"
              name="online"
              defaultValue={q.online || ''}
            >
              <option value="">
                All tutors
              </option>
              <option value="yes">
                Online available
              </option>
            </select>
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 16,
          }}
        >
          <button type="submit">
            Search tutors
          </button>

          <a
            href="/tutors"
            style={{
              padding: '10px 16px',
              border: '1px solid #ccc',
              borderRadius: 8,
            }}
          >
            Clear filters
          </a>
        </div>
      </form>

      <p className="muted">
        <strong>{tutors.length}</strong>{' '}
        matching tutor{tutors.length === 1 ? '' : 's'}
        {tutors.length === 100
          ? ' shown (maximum 100)'
          : ''}
      </p>

      <div
        style={{
          display: 'grid',
          gap: 20,
        }}
      >
        {tutors.map(tutor => (
          <article
            className="card"
            key={tutor.id}
            style={{
              minWidth: 0,
              overflowWrap: 'anywhere',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h2 style={{ marginBottom: 6 }}>
                  {tutor.user.name}
                </h2>

                <p className="muted">
                  {tutor.cities.join(', ')}
                </p>
              </div>

              <div>
                <strong
                  style={{ fontSize: '1.3rem' }}
                >
                  $
                  {(
                    tutor.hourlyRateCents / 100
                  ).toFixed(2)}
                </strong>

                <div className="muted">
                  CAD per hour
                </div>
              </div>
            </div>

            <p>
              {tutor.online
                ? 'Online tutoring available'
                : 'Contact tutor about session location'}
            </p>

            <h3>About this tutor</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>
              {tutor.bio}
            </p>

            <h3>Qualifications and experience</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>
              {tutor.qualifications ||
                'Contact this tutor for details.'}
            </p>

            <h3>Subjects</h3>
            <div>{tags(tutor.subjects)}</div>

            <h3>Grades</h3>
            <div>{tags(tutor.grades)}</div>

            <h3>Languages</h3>
            <div>{tags(tutor.languages)}</div>

            <TutorAvailability
              tutorId={tutor.id}
            />

            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: '1px solid #ddd',
              }}
            >
              <h3>Interested in tutoring?</h3>

              <p className="muted">
                Contact this tutor to discuss your
                learning goals. No payment is
                required to send an inquiry.
              </p>

              <InquiryForm
                tutorId={tutor.id}
                name={tutor.user.name}
              />
            </div>
          </article>
        ))}

        {tutors.length === 0 && (
          <div className="card">
            <h2>No matching tutors</h2>
            <p>
              Try removing a filter or
              increasing your maximum hourly rate.
            </p>
            <a href="/tutors">
              View all tutors
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
