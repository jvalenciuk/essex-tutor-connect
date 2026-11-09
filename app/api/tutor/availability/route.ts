
import { db } from '../../../../lib/db';
import { identity, fail } from '../../../../lib/security';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const slot = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
}).refine(v => v.endMinute > v.startMinute);

const schema = z.object({
  weekly: z.array(slot).max(50),
  blockedDates: z.array(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  ).max(365),
});

async function tutorForUser() {
  const who = await identity();

  if (!who || who.role !== 'TUTOR') {
    return null;
  }

  return db.tutorProfile.findUnique({
    where: { userId: who.id },
    select: { id: true },
  });
}

export async function GET() {
  const tutor = await tutorForUser();

  if (!tutor) {
    return fail('Tutor profile required', 403);
  }

  const [weekly, blocked] = await Promise.all([
    db.tutorAvailability.findMany({
      where: { tutorId: tutor.id },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startMinute: 'asc' },
      ],
    }),
    db.tutorBlockedDate.findMany({
      where: { tutorId: tutor.id },
      orderBy: { dateKey: 'asc' },
    }),
  ]);

  return Response.json({
    weekly: weekly.map(
      ({ dayOfWeek, startMinute, endMinute }) => ({
        dayOfWeek,
        startMinute,
        endMinute,
      })
    ),
    blockedDates: blocked.map(b => b.dateKey),
  });
}

export async function PUT(req: Request) {
  const tutor = await tutorForUser();

  if (!tutor) {
    return fail('Tutor profile required', 403);
  }

  const parsed = schema.safeParse(
    await req.json().catch(() => null)
  );

  if (!parsed.success) {
    return fail('Invalid availability settings', 400);
  }

  const { weekly, blockedDates } = parsed.data;

  if (!weekly.length) {
    return fail(
      'Select at least one weekly availability window.',
      400
    );
  }

  const uniqueDates = [...new Set(blockedDates)];

  if (
    uniqueDates.some(
      d =>
        !Number.isFinite(
          new Date(`${d}T12:00:00Z`).getTime()
        ) ||
        new Date(`${d}T12:00:00Z`)
          .toISOString()
          .slice(0, 10) !== d
    )
  ) {
    return fail('Invalid blocked date', 400);
  }

  for (
    const day of new Set(
      weekly.map(s => s.dayOfWeek)
    )
  ) {
    const windows = weekly
      .filter(s => s.dayOfWeek === day)
      .sort(
        (a, b) =>
          a.startMinute - b.startMinute
      );

    if (
      windows.some(
        (w, i) =>
          i > 0 &&
          w.startMinute < windows[i - 1].endMinute
      )
    ) {
      return fail(
        'Weekly availability windows cannot overlap.',
        400
      );
    }
  }

  await db.$transaction(async tx => {
    await tx.tutorAvailability.deleteMany({
      where: { tutorId: tutor.id },
    });

    await tx.tutorBlockedDate.deleteMany({
      where: { tutorId: tutor.id },
    });

    await tx.tutorAvailability.createMany({
      data: weekly.map(w => ({
        tutorId: tutor.id,
        ...w,
      })),
    });

    if (uniqueDates.length) {
      await tx.tutorBlockedDate.createMany({
        data: uniqueDates.map(dateKey => ({
          tutorId: tutor.id,
          dateKey,
        })),
      });
    }
  });

  return Response.json({ success: true });
}
