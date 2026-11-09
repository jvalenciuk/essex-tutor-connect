
'use client';

import {
  useState,
  type FormEvent,
} from 'react';

type TutorProfile = {
  bio: string;
  qualifications: string;
  subjects: string[];
  grades: string[];
  cities: string[];
  languages: string[];
  hourlyRateCents: number;
  online: boolean;
};

type ListField =
  | 'subjects'
  | 'grades'
  | 'cities'
  | 'languages';

const listFields: {
  name: ListField;
  label: string;
  placeholder: string;
  help: string;
}[] = [
  {
    name: 'subjects',
    label: 'Subjects',
    placeholder: 'Math, French, Science',
    help: 'Use consistent subject names so parents can find you.',
  },
  {
    name: 'grades',
    label: 'Grade levels',
    placeholder: 'Grade 4, Grade 5, Grade 6',
    help: 'For example: Grade 7, Grade 8, Grade 9.',
  },
  {
    name: 'cities',
    label: 'Tutoring locations',
    placeholder: 'Windsor, LaSalle, Tecumseh',
    help: 'List areas where you can provide tutoring.',
  },
  {
    name: 'languages',
    label: 'Languages',
    placeholder: 'English, French',
    help: 'List languages in which you can tutor.',
  },
];

function parseList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
}

export default function DashboardForm({
  initialProfile,
}: {
  initialProfile: TutorProfile | null;
}) {
  const [bio, setBio] = useState(
    initialProfile?.bio || ''
  );

  const [qualifications, setQualifications] =
    useState(initialProfile?.qualifications || '');

  const [lists, setLists] = useState<
    Record<ListField, string>
  >({
    subjects: initialProfile?.subjects.join(', ') || '',
    grades: initialProfile?.grades.join(', ') || '',
    cities: initialProfile?.cities.join(', ') || '',
    languages: initialProfile?.languages.join(', ') || '',
  });

  const [rate, setRate] = useState(
    String(
      initialProfile?.hourlyRateCents
        ? initialProfile.hourlyRateCents / 100
        : 40
    )
  );

  const [online, setOnline] = useState(
    initialProfile?.online || false
  );

  const [saved, setSaved] = useState(
    Boolean(initialProfile)
  );

  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  const rateNumber = Number(rate);

  const checklist = [
    {
      label: 'Write an introduction (at least 30 characters)',
      done: bio.trim().length >= 30,
    },
    {
      label: 'Describe qualifications (at least 10 characters)',
      done: qualifications.trim().length >= 10,
    },
    ...listFields.map(field => ({
      label: `Add ${field.label.toLowerCase()}`,
      done: parseList(lists[field.name]).length > 0,
    })),
    {
      label: 'Set an hourly rate between $20 and $300 CAD',
      done:
        rate.trim() !== '' &&
        Number.isFinite(rateNumber) &&
        rateNumber >= 20 &&
        rateNumber <= 300,
    },
  ];

  const completed = checklist.filter(
    item => item.done
  ).length;

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (saving) return;

    setMessage('');
    setIsError(false);

    if (completed !== checklist.length) {
      setMessage(
        'Please complete every required profile item.'
      );
      setIsError(true);
      return;
    }

    setSaving(true);

    const data = {
      bio: bio.trim(),
      qualifications: qualifications.trim(),
      subjects: parseList(lists.subjects),
      grades: parseList(lists.grades),
      cities: parseList(lists.cities),
      languages: parseList(lists.languages),
      hourlyRateCents: Math.round(
        rateNumber * 100
      ),
      online,
    };

    try {
      const response = await fetch('/api/tutors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error || 'Unable to save profile'
        );
      }

      setSaved(true);
      setMessage(
        'Your tutor profile was saved successfully. Check your verification status on the dashboard.'
      );
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2>My Tutor Profile</h2>

      <p>
        Build a profile that helps parents understand
        your experience, teaching approach, and
        the subjects you offer.
      </p>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h3>Profile checklist</h3>

        <p>
          <strong>
            {completed} of {checklist.length}
          </strong>{' '}
          required items complete
        </p>

        <progress
          value={completed}
          max={checklist.length}
          style={{
            width: '100%',
            height: 14,
          }}
        />

        <ul>
          {checklist.map(item => (
            <li key={item.label}>
              <span
                style={{
                  color: item.done
                    ? '#15803d'
                    : 'inherit',
                }}
              >
                {item.done ? '✓ ' : '○ '}
                {item.label}
              </span>
            </li>
          ))}
        </ul>

        {saved && (
          <p className="muted">
            Profile previously saved. Changes must
            be saved again to take effect.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <label>
          About me
          <textarea
            className="field"
            name="bio"
            required
            minLength={30}
            maxLength={3000}
            rows={5}
            value={bio}
            onChange={event =>
              setBio(event.target.value)
            }
            placeholder="Introduce yourself, describe your teaching approach, and explain how you support learners."
          />
        </label>

        <p className="muted">
          {bio.trim().length} characters.
          Describe your actual experience without
          sharing private contact details.
        </p>

        <label>
          Qualifications and experience
          <textarea
            className="field"
            name="qualifications"
            required
            minLength={10}
            maxLength={3000}
            rows={4}
            value={qualifications}
            onChange={event =>
              setQualifications(event.target.value)
            }
            placeholder="Degrees, teaching certifications, subject expertise, and relevant experience."
          />
        </label>

        <p className="muted">
          Only list credentials you actually hold.
          Administrator approval does not
          automatically verify every claim.
        </p>

        {listFields.map(field => (
          <div key={field.name} style={{ marginBottom: 16 }}>
            <label>
              {field.label} (separate with commas)
              <input
                className="field"
                name={field.name}
                required
                value={lists[field.name]}
                onChange={event =>
                  setLists(previous => ({
                    ...previous,
                    [field.name]: event.target.value,
                  }))
                }
                placeholder={field.placeholder}
              />
            </label>

            <p className="muted">
              {field.help}
            </p>
          </div>
        ))}

        <label>
          Hourly tutoring rate (CAD)
          <input
            className="field"
            type="number"
            name="rate"
            min="20"
            max="300"
            step="0.01"
            required
            value={rate}
            onChange={event =>
              setRate(event.target.value)
            }
          />
        </label>

        <p className="muted">
          Essex Tutor Connect retains a 15%
          platform commission on paid sessions.
          Stripe processing fees may also apply.
        </p>

        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            margin: '18px 0',
          }}
        >
          <input
            type="checkbox"
            name="online"
            checked={online}
            onChange={event =>
              setOnline(event.target.checked)
            }
          />
          I offer online tutoring
        </label>

        <button type="submit" disabled={saving}>
          {saving
            ? 'Saving profile...'
            : 'Save Tutor Profile'}
        </button>

        {message && (
          <p
            role={isError ? 'alert' : 'status'}
            style={{
              color: isError
                ? '#b42318'
                : '#15803d',
              marginTop: 12,
            }}
          >
            {message}
          </p>
        )}
      </form>

      <div
        style={{
          borderTop: '1px solid #ddd',
          marginTop: 24,
          paddingTop: 16,
        }}
      >
        <h3>What happens next?</h3>

        <ol>
          <li>
            Save your completed profile.
          </li>
          <li>
            Wait for administrator review and approval.
          </li>
          <li>
            Set your weekly availability and blocked dates.
          </li>
          <li>
            Complete Stripe onboarding to receive payments.
          </li>
          <li>
            Respond to parent inquiries and propose sessions.
          </li>
        </ol>

        <p className="muted">
          Your dashboard displays your verification
          status and payment connection.
        </p>
      </div>
    </section>
  );
}
