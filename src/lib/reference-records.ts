export type ReferenceKind = "product_category" | "product_subcategory" | "service_category" | "financial_account" | "financial_category";
export type ReferenceRecord = { id: string; name: string; categoryId?: string; type?: string; accountType?: string; isActive?: boolean };
export const referenceLabels: Record<ReferenceKind, { singular: string; plural: string; permission: "inventory.manage" | "services.manage" | "finance.manage" }> = {
  product_category: { singular: "categoria", plural: "Categorias", permission: "inventory.manage" },
  product_subcategory: { singular: "subcategoria", plural: "Subcategorias", permission: "inventory.manage" },
  service_category: { singular: "categoria", plural: "Categorias", permission: "services.manage" },
  financial_account: { singular: "conta ou caixa", plural: "Contas e caixas", permission: "finance.manage" },
  financial_category: { singular: "categoria", plural: "Categorias", permission: "finance.manage" },
};
export const financialCategoryLabels: Record<string, string> = {
  payable: "Despesa",
  receivable: "Receita",
  transfer: "Transferência",
};

export const isFinancialReference = (kind: ReferenceKind) => ["financial_account", "financial_category"].includes(kind);
