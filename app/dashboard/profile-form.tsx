
'use client';

import { useState, type FormEvent } from 'react';

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

export default function DashboardForm({
  initialProfile,
}: {
  initialProfile: TutorProfile | null;
}) {
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    const form = new FormData(e.currentTarget);

    const csv = (key: string): string[] =>
      String(form.get(key) || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    const data = {
      bio: String(form.get('bio') || ''),
      qualifications: String(form.get('qualifications') || ''),
      subjects: csv('subjects'),
      grades: csv('grades'),
      cities: csv('cities'),
      languages: csv('languages'),
      hourlyRateCents: Math.round(
        Number(form.get('rate')) * 100
      ),
      online: form.get('online') === 'on',
    };

    try {
      const response = await fetch('/api/tutors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.error || 'Unable to save profile'
        );
      }

      setMsg('Profile saved successfully.');
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : 'Something went wrong.'
      );
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    {
      name: 'subjects',
      label: 'Subjects',
      placeholder: 'Math, French, Science',
    },
    {
      name: 'grades',
      label: 'Grade levels',
      placeholder: 'Grade 4, Grade 5, Grade 6',
    },
    {
      name: 'cities',
      label: 'Tutoring locations',
      placeholder: 'Windsor, LaSalle, Tecumseh',
    },
    {
      name: 'languages',
      label: 'Languages',
      placeholder: 'English, French',
    },
  ] as const;

  return (
    <div className="card">
      <h2>My Tutor Profile</h2>

      <p>
        Complete your information for administrator review.
      </p>

      <form onSubmit={handleSubmit}>
        <label>
          About me
          <textarea
            className="field"
            name="bio"
            minLength={30}
            required
            defaultValue={initialProfile?.bio || ''}
            placeholder="Tell parents about your teaching experience."
          />
        </label>

        <label>
          Qualifications
          <textarea
            className="field"
            name="qualifications"
            minLength={10}
            required
            defaultValue={initialProfile?.qualifications || ''}
            placeholder="Teaching certifications, degrees, experience..."
          />
        </label>

        {fields.map((field) => (
          <label key={field.name}>
            {field.label} (separate with commas)
            <input
              className="field"
              name={field.name}
              required
              defaultValue={
                initialProfile?.[field.name].join(', ') || ''
              }
              placeholder={field.placeholder}
            />
          </label>
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
            defaultValue={
              initialProfile?.hourlyRateCents
                ? initialProfile.hourlyRateCents / 100
                : 40
            }
          />
        </label>

        <label>
          <input
            type="checkbox"
            name="online"
            defaultChecked={
              initialProfile?.online || false
            }
          />
          {' '}I offer online tutoring
        </label>

        <p>
          <button type="submit" disabled={saving}>
            {saving
              ? 'Saving...'
              : 'Save Tutor Profile'}
          </button>
        </p>

        <p role="status">{msg}</p>
      </form>
    </div>
  );
}
