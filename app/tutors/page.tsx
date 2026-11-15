
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
  sort?: string;
};

function uniqueOptions(values: string[][]): string[] {
  return Array.from(
    new Set(
      values
        .flat()
        .map(value => value.trim())
        .filter(Boolean)
    )
  ).sort((a, b) =>
    a.localeCompare(b, 'en-CA', {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

function Tags({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="muted">Not specified</p>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map(item => (
        <span className="tag" key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

export default async function Tutors({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const q = await searchParams;

  // Load approved profiles once, so dropdown choices
  // always reflect the tutors currently on the site.
  const approvedTutors = await db.tutorProfile.findMany({
    where: {
      verification: 'APPROVED',
    },
    include: {
      user: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      hourlyRateCents: 'asc',
    },
  });

  const subjects = uniqueOptions(
    approvedTutors.map(tutor => tutor.subjects)
  );

  const grades = uniqueOptions(
    approvedTutors.map(tutor => tutor.grades)
  );

  const cities = uniqueOptions(
    approvedTutors.map(tutor => tutor.cities)
  );

  const subject = subjects.includes(q.subject || '')
    ? q.subject || ''
    : '';

  const grade = grades.includes(q.grade || '')
    ? q.grade || ''
    : '';

  const city = cities.includes(q.city || '')
    ? q.city || ''
    : '';

  const maxRate = Number(q.maxRate);

  const hasValidMaxRate =
    Boolean(q.maxRate) &&
    Number.isFinite(maxRate) &&
    maxRate > 0;

  const sort = ['price-asc', 'price-desc', 'name'].includes(q.sort || '') ? q.sort : 'price-asc';

  const tutors = approvedTutors
    .filter(tutor => {
      if (subject && !tutor.subjects.includes(subject)) {
        return false;
      }

      if (grade && !tutor.grades.includes(grade)) {
        return false;
      }

      if (city && !tutor.cities.includes(city)) {
        return false;
      }

      if (q.online === 'yes' && !tutor.online) {
        return false;
      }

      if (
        hasValidMaxRate &&
        tutor.hourlyRateCents > Math.round(maxRate * 100)
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => sort === 'price-desc'
      ? b.hourlyRateCents - a.hourlyRateCents
      : sort === 'name'
        ? a.user.name.localeCompare(b.user.name, 'en-CA')
        : a.hourlyRateCents - b.hourlyRateCents)
    .slice(0, 100);

  return (
    <main style={{ maxWidth: 1150, margin: '0 auto' }}>
      <h1>Find your tutor</h1>

      <p className="muted">
        Explore approved tutors in Windsor and Essex County.
        Compare qualifications, subjects, rates, and availability.
      </p>

      <form
        method="GET"
        className="card"
        style={{
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Find the right match</h2>

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
            <select
              className="field"
              name="subject"
              defaultValue={subject}
            >
              <option value="">All subjects</option>
              {subjects.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            Grade
            <select
              className="field"
              name="grade"
              defaultValue={grade}
            >
              <option value="">All grades</option>
              {grades.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            City
            <select
              className="field"
              name="city"
              defaultValue={city}
            >
              <option value="">All cities</option>
              {cities.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
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
            Sort results
            <select className="field" name="sort" defaultValue={sort}>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Tutor name: A to Z</option>
            </select>
          </label>

          <label>
            Online tutoring
            <select
              className="field"
              name="online"
              defaultValue={q.online === 'yes' ? 'yes' : ''}
            >
              <option value="">All tutors</option>
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
            alignItems: 'center',
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
              textDecoration: 'none',
            }}
          >
            Clear filters
          </a>
        </div>
      </form>

      <p className="muted" role="status">
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
            className="card tutor-result-card"
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
                <strong style={{ fontSize: '1.3rem' }}>
                  ${(tutor.hourlyRateCents / 100).toFixed(2)}
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

            <p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{tutor.bio}</p>

            <div className="tutor-quick-facts">
              <div><strong>Subjects</strong><Tags items={tutor.subjects} /></div>
              <div><strong>Grades</strong><Tags items={tutor.grades} /></div>
              <div><strong>Languages</strong><Tags items={tutor.languages} /></div>
            </div>

            <details className="tutor-more-details">
              <summary>Qualifications, experience and availability</summary>
              <h3>Qualifications and experience</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>
                {tutor.qualifications || 'Contact this tutor for details.'}
              </p>
              <TutorAvailability tutorId={tutor.id} />
            </details>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #ddd' }}>
              <p className="muted">Send a free inquiry to discuss tutoring and scheduling. No payment required.</p>

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
              Try removing a filter or increasing
              your maximum hourly rate.
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
