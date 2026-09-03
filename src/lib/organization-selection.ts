export function selectCurrentOrganization<T extends { id: string }>(
  memberships: readonly T[],
  requestedOrganizationId: string | null = null,
) {
  return (
    memberships.find((membership) => membership.id === requestedOrganizationId) ??
    memberships[0]
  );
}
