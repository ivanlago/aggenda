# Guias de pagamentos

Cada aba de instituição em `/financeiro/cobrancas` tem o link **Passo a passo**, aberto em outra aba para preservar o formulário. O retorno usa `?instituicao=` para abrir a instituição correspondente.

As páginas autenticadas ficam em `/financeiro/cobrancas/guias/[instituicao]`, com conteúdo em `src/lib/payment-connection-guides.ts`.

- Conexão: Asaas, Mercado Pago, PagBank e Efí. As instruções seguem os campos e as operações existentes, com links oficiais, ambiente, teste e diagnóstico.
- Conciliação OFX: Stone/Ton, Cielo, Rede, Getnet e InfinitePay. Não representam conexão direta ou emissão de cobranças. A conciliação existente vincula movimentos e lançamentos sem dar baixa automática; os guias explicam essa limitação.
- Mercado Pago: Checkout Pro / Preferences, evento Pagamentos (legacy), assinatura separada do Access Token e URL do webhook da organização autenticada, com botão de cópia. Nenhuma credencial é consultada ou apresentada pelo guia.
- Testes: acesso à conta é diferente de confirmação automática. Em produção, uma transação de teste movimenta dinheiro real; cada modalidade precisa de validação própria.

Referências oficiais consultadas em 22/10/2026 estão nos próprios guias. Os nomes dos menus externos podem mudar. Nenhuma conexão, cobrança, importação bancária ou pagamento é disparado ao abrir uma página de ajuda.
