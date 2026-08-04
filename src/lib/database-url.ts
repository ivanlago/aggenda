export function normalizeDatabaseUrl(value: string) {
  return value.replace(
    /([?&])sslmode=(prefer|require|verify-ca)(?=(&|$))/i,
    "$1sslmode=verify-full"
  );
}
