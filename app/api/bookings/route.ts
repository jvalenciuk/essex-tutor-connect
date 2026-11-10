      id: true,
      inquiryId: true,
      startsAt: true,
      durationMinutes: true,
      amountCents: true,
      platformFeeCents: true,
      status: true,
    },
  });
  return Response.json(booking, { status: 201 });
}

export async function GET() {
  const who = await identity();
  if (!who) return fail('Sign in required', 401);

  const headers = {
    'X-Account-Role': who.role,
    'Cache-Control': 'private, no-store',
  };

  if (who.role !== 'PARENT' && who.role !== 'TUTOR') {
    return Response.json([], { headers });
  }

  const bookings = await db.booking.findMany({
    where: who.role === 'TUTOR'
      ? { tutor: { userId: who.id } }
      : { parentId: who.id },
    include: {
      parent: { select: { name: true } },
      tutor: { include: { user: { select: { name: true } } } },
      inquiry: { select: { subject: true, grade: true } },
    },
    orderBy: { startsAt: 'asc' },
    take: 100,
  });

  return Response.json(bookings, { headers });
}
