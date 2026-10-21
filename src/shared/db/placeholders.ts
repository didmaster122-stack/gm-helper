/** "?, ?, ?" for an `IN (…)` list of the given values. */
export function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}
