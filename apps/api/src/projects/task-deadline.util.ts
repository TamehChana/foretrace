/** UTC calendar-day start (matches date-picker storage as `YYYY-MM-DDT12:00:00.000Z`). */
export function utcDayStartMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole UTC calendar days from `now` to `deadline` (negative = overdue). */
export function utcCalendarDiffDays(deadline: Date, now: Date): number {
  return Math.round(
    (utcDayStartMs(deadline) - utcDayStartMs(now)) / (24 * 60 * 60 * 1000),
  );
}

export function isDeadlineOverdueUtc(
  deadline: Date,
  now: Date = new Date(),
): boolean {
  return utcCalendarDiffDays(deadline, now) < 0;
}

export type TaskScheduleRow = {
  deadline: Date | null;
  progress: number;
};

export type TaskScheduleBuckets = {
  activeCount: number;
  overdueCount: number;
  dueWithin7DaysCount: number;
  dueWithin3DaysCount: number;
  dueBetween4And7DaysCount: number;
  dueSoonLowProgressCount: number;
};

/** Active-task schedule buckets aligned with the web date picker (UTC calendar days). */
export function countTaskScheduleBuckets(
  tasks: TaskScheduleRow[],
  now: Date = new Date(),
): TaskScheduleBuckets {
  let overdueCount = 0;
  let dueWithin7DaysCount = 0;
  let dueWithin3DaysCount = 0;
  let dueBetween4And7DaysCount = 0;
  let dueSoonLowProgressCount = 0;

  for (const t of tasks) {
    if (!t.deadline) {
      continue;
    }
    const diff = utcCalendarDiffDays(t.deadline, now);
    if (diff < 0) {
      overdueCount += 1;
    }
    if (diff >= 0 && diff <= 7) {
      dueWithin7DaysCount += 1;
    }
    if (diff >= 0 && diff <= 3) {
      dueWithin3DaysCount += 1;
    }
    if (diff >= 4 && diff <= 7) {
      dueBetween4And7DaysCount += 1;
    }
    if (diff >= 0 && diff <= 7 && t.progress < 35) {
      dueSoonLowProgressCount += 1;
    }
  }

  return {
    activeCount: tasks.length,
    overdueCount,
    dueWithin7DaysCount,
    dueWithin3DaysCount,
    dueBetween4And7DaysCount,
    dueSoonLowProgressCount,
  };
}
