export function sumProcedureMaterials(rows: { serviceId: string; productId: string; quantity: number }[], procedures: { serviceId: string; quantity: number }[]) {
  const amounts = new Map<string, number>();
  for (const procedure of procedures) {
    for (const row of rows) {
      if (row.serviceId === procedure.serviceId) amounts.set(row.productId, (amounts.get(row.productId) ?? 0) + row.quantity * procedure.quantity);
    }
  }
  return [...amounts].map(([productId, quantity]) => ({ productId, quantity })).sort((a, b) => a.productId.localeCompare(b.productId));
}
