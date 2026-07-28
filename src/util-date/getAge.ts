export function getAge(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const time = new Date(dob).getTime();
  if (isNaN(time)) return null;
  return Math.floor((new Date().getTime() - time) / 3.15576e+10);
}