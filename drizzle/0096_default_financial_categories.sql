CREATE FUNCTION aggenda_seed_financial_categories(org uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO financial_categories (organization_id, type, name)
  SELECT org, defaults.type, defaults.name
  FROM (VALUES
    ('payable', 'Despesas financeiras'),
    ('payable', 'Despesas financeiras / Juros sobre empréstimos'),
    ('payable', 'Despesas financeiras / Taxas bancárias'),
    ('payable', 'Despesas fixas'),
    ('payable', 'Despesas fixas / Água'),
    ('payable', 'Despesas fixas / Alarme'),
    ('payable', 'Despesas fixas / Aluguel'),
    ('payable', 'Despesas fixas / Celular'),
    ('payable', 'Despesas fixas / Contabilidade'),
    ('payable', 'Despesas fixas / IPTU'),
    ('payable', 'Despesas fixas / Luz'),
    ('payable', 'Despesas fixas / Manutenção e limpeza'),
    ('payable', 'Despesas fixas / Pró-labore'),
    ('payable', 'Despesas fixas / Seguro'),
    ('payable', 'Despesas fixas / Sistemas e assinaturas'),
    ('payable', 'Despesas fixas / Tarifas de manutenção bancária'),
    ('payable', 'Despesas fixas / Telefone'),
    ('payable', 'Despesas variáveis'),
    ('payable', 'Despesas variáveis / Contas de consumo'),
    ('payable', 'Despesas variáveis / Curso e aperfeiçoamento'),
    ('payable', 'Despesas variáveis / Empréstimos'),
    ('payable', 'Despesas variáveis / Lavanderia'),
    ('payable', 'Despesas variáveis / Materiais de trabalho'),
    ('payable', 'Despesas variáveis / Outros'),
    ('payable', 'Despesas variáveis / Reparos e manutenção'),
    ('payable', 'Fornecedores'),
    ('payable', 'Fornecedores / Compras de fornecedores'),
    ('payable', 'Funcionários'),
    ('payable', 'Funcionários / Bônus'),
    ('payable', 'Funcionários / Comissão'),
    ('payable', 'Funcionários / INSS'),
    ('payable', 'Funcionários / Salários'),
    ('payable', 'Funcionários / Uniformes'),
    ('payable', 'Funcionários / Vale'),
    ('payable', 'Funcionários / Vale / Vale por profissional'),
    ('payable', 'Funcionários / Vale-transporte'),
    ('payable', 'Impostos'),
    ('payable', 'Impostos / Anvisa'),
    ('payable', 'Impostos / ISS'),
    ('receivable', 'Receita de venda'),
    ('receivable', 'Receita de venda / Vendas'),
    ('transfer', 'Transferência'),
    ('transfer', 'Transferência / Fechamento')
  ) AS defaults(type, name)
  WHERE NOT EXISTS (
    SELECT 1 FROM financial_categories AS existing
    WHERE existing.organization_id = org
      AND existing.type = defaults.type
      AND lower(btrim(existing.name)) = lower(defaults.name)
  )
  ON CONFLICT (organization_id, type, name) DO NOTHING;
$$;
--> statement-breakpoint
SELECT aggenda_seed_financial_categories(id) FROM organizations;
--> statement-breakpoint
CREATE FUNCTION aggenda_new_organization_financial_categories() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM aggenda_seed_financial_categories(NEW.id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER organization_financial_category_defaults AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION aggenda_new_organization_financial_categories();
