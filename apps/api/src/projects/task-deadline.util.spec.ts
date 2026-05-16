import {
  countTaskScheduleBuckets,
  isDeadlineOverdueUtc,
  utcCalendarDiffDays,
} from './task-deadline.util';

describe('task-deadline.util', () => {
  const now = new Date('2026-05-16T18:00:00.000Z');

  it('treats same UTC due date as not overdue until the next UTC day', () => {
    const dueToday = new Date('2026-05-16T12:00:00.000Z');
    expect(utcCalendarDiffDays(dueToday, now)).toBe(0);
    expect(isDeadlineOverdueUtc(dueToday, now)).toBe(false);
  });

  it('marks prior UTC calendar day as overdue', () => {
    const dueYesterday = new Date('2026-05-15T12:00:00.000Z');
    expect(utcCalendarDiffDays(dueYesterday, now)).toBe(-1);
    expect(isDeadlineOverdueUtc(dueYesterday, now)).toBe(true);
  });

  it('counts schedule buckets for active tasks', () => {
    const buckets = countTaskScheduleBuckets(
      [
        { deadline: new Date('2026-05-14T12:00:00.000Z'), progress: 10 },
        { deadline: new Date('2026-05-15T12:00:00.000Z'), progress: 80 },
        { deadline: new Date('2026-05-18T12:00:00.000Z'), progress: 20 },
        { deadline: null, progress: 0 },
      ],
      now,
    );
    expect(buckets.activeCount).toBe(4);
    expect(buckets.overdueCount).toBe(2);
    expect(buckets.dueWithin3DaysCount).toBe(1);
    expect(buckets.dueSoonLowProgressCount).toBe(1);
  });
});
