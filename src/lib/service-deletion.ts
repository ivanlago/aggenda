export function serviceDeletionError(error: unknown): string | null {
  const visited = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && (current.code === "23503" || current.code === "23001")) {
      return "Este procedimento possui vínculos com agendamentos, pacotes ou outros registros e não pode ser excluído. Para retirá-lo de uso, edite o procedimento, desmarque Ativo e salve as alterações.";
    }
    current = "cause" in current ? current.cause : null;
  }
  return null;
}
