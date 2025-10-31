export const DAY_MS = 86_400_000;

export const parseISODate = (value: string) => new Date(`${value}T00:00:00`);

export const differenceInDays = (start: Date, end: Date) =>
  Math.round((end.getTime() - start.getTime()) / DAY_MS);

export const toISODate = (date: Date) => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone.toISOString().slice(0, 10);
};
