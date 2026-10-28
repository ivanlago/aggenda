const actions: Record<string, string> = {
  create: "Cadastro criado", update: "Cadastro atualizado", delete: "Cadastro excluído", reconcile: "Conciliação registrada",
  "pos_payment:completed": "Pagamento da venda confirmado", "pos_payment:cancelled": "Pagamento da venda cancelado",
  "pos_payment:refunded": "Pagamento da venda estornado", "status:completed": "Atendimento concluído",
  "status:scheduled": "Agendamento registrado", "status:confirmed": "Agendamento confirmado", "status:cancelled": "Agendamento cancelado",
  "status:no_show": "Falta registrada", reschedule: "Agendamento remarcado", login: "Acesso realizado",
};
const entities: Record<string, string> = { retail_sale: "Venda", appointment: "Agendamento", client: "Cliente", service: "Procedimento", professional: "Profissional", commission_entries: "Comissões", financial_entry: "Lançamento financeiro", payment_charge: "Cobrança", electronic_document: "Documento", document_template: "Modelo de documento", product: "Produto", inventory_product: "Produto", inventory_lot: "Lote", user: "Usuário", organization: "Empresa" };
export function auditPresentation(action: string, entity: string, id: string | null) {
  const label = actions[action] ?? "Alteração registrada";
  const object = entities[entity] ?? "Registro";
  const paths: Record<string, string> = { client: "/clientes", appointment: "/atendimento" };
  const destination = paths[entity];
  const href = id && /^[a-f0-9-]{36}$/i.test(id) && destination ? `${destination}/${id}` : entity === "retail_sale" && id && /^[a-f0-9-]{36}$/i.test(id) ? `/vendas/pagamento/${id}` : null;
  return { label, object, href };
}
