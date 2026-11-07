
import { identity } from '../../lib/security';
import { db } from '../../lib/db';
import { redirect } from 'next/navigation';

import DashboardForm from './profile-form';
import ConnectButton from './connect-button';
import InquiryActions from './inquiry-actions';
import InquiryMessages from './inquiry-messages';
import BookingManager from './booking-manager';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const who = await identity();

  if (!who) {
    redirect('/login');
  }

  const profile =
    who.role === 'TUTOR'
      ? await db.tutorProfile.findUnique({
          where: { userId: who.id },
        })
      : null;

  const inquiries = await db.inquiry.findMany({
    where:
      who.role === 'TUTOR'
        ? { tutor: { userId: who.id } }
        : { parentId: who.id },
    include: {
      parent: {
        select: { name: true },
      },
      tutor: {
        include: {
          user: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });

  return (
    <main>
      <h1>Dashboard</h1>

      <p>Account type: {who.role}</p>

      {who.role === 'TUTOR' && (
        <>
          <p>
            Verification:{' '}
            {profile?.verification || 'Profile not submitted'}
          </p>

          <DashboardForm
            initialProfile={
              profile
                ? {
                    bio: profile.bio,
                    qualifications: profile.qualifications,
                    subjects: profile.subjects,
                    grades: profile.grades,
                    cities: profile.cities,
                    languages: profile.languages,
                    hourlyRateCents: profile.hourlyRateCents,
                    online: profile.online,
                  }
                : null
            }
          />

          {profile?.verification === 'APPROVED' && (
            <div className="card">
              <h2>Receive payments</h2>

              <p>
                Complete secure Stripe Connect onboarding
                before accepting paid sessions.
              </p>

              <ConnectButton />
            </div>
          )}
        </>
      )}

      {who.role === 'PARENT' && (
        <p>
          Browse approved tutors and send inquiries
          through their profiles.
        </p>
      )}

      <h2>Inquiries</h2>

      {inquiries.length === 0 && (
        <p>No inquiries yet.</p>
      )}

      {inquiries.map((inquiry) => (
        <div className="card" key={inquiry.id}>
          <h3>
            {inquiry.subject} — {inquiry.grade}
          </h3>

          <p>{inquiry.message}</p>

          {who.role === 'TUTOR' ? (
            <>
              <p>From: {inquiry.parent.name}</p>

              <InquiryActions
                inquiryId={inquiry.id}
                status={inquiry.status}
              />
            </>
          ) : (
            <>
              <p>Tutor: {inquiry.tutor.user.name}</p>

              <p className="muted">
                Status: {inquiry.status}
              </p>
            </>
          )}

          {inquiry.status === 'ACCEPTED' && (
            <>
              <InquiryMessages inquiryId={inquiry.id} />

              <BookingManager
                inquiryId={inquiry.id}
                role={who.role}
              />
            </>
          )}
        </div>
      ))}
    </main>
  );
}
