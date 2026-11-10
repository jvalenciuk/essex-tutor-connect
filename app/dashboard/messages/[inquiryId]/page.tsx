
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { identity } from '../../../../lib/security';
import { db } from '../../../../lib/db';
import InquiryMessages from '../../inquiry-messages';

export const dynamic = 'force-dynamic';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ inquiryId: string }>;
}) {
  const who = await identity();

  if (!who) {
    redirect('/login');
  }

  const { inquiryId } = await params;

  if (
    who.role !== 'PARENT' &&
    who.role !== 'TUTOR'
  ) {
    notFound();
  }

  const inquiry = await db.inquiry.findFirst({
    where: {
      id: inquiryId,
      ...(who.role === 'PARENT'
        ? { parentId: who.id }
        : { tutor: { userId: who.id } }),
    },
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
  });

  if (!inquiry) {
    notFound();
  }

  const isParent = who.role === 'PARENT';

  const otherPerson = isParent
    ? inquiry.tutor.user.name
    : inquiry.parent.name;

  return (
    <main style={{ maxWidth: 850 }}>
      <Link href="/dashboard/bookings">
        Back to My Bookings
      </Link>

      <h1>Private Conversation</h1>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>
          {inquiry.subject} — {inquiry.grade}
        </h2>

        <p>
          <strong>
            {isParent ? 'Tutor' : 'Parent'}:
          </strong>{' '}
          {otherPerson}
        </p>

        <p className="muted">
          Inquiry status: {inquiry.status}
        </p>

        <p>{inquiry.message}</p>

        {inquiry.status === 'ACCEPTED' ? (
          <InquiryMessages inquiryId={inquiry.id} />
        ) : (
          <p className="muted">
            Private messaging becomes available
            once the tutor accepts the inquiry.
          </p>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard">
          Return to Dashboard
        </Link>
      </div>
    </main>
  );
}
