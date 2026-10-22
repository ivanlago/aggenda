# Página comercial do Aggenda

## Escopo e arquivos

Nova página `/`, sem mudanças em autenticação, checkout, dados de clientes ou permissões. Componentes em `src/components/landing`, conteúdo em `src/lib/landing-content.ts` e estilos isolados sob `.aggenda-landing` em `src/app/landing.css`. Reutiliza Next/React, Lucide, fonte e identidade existentes; CSS com movimento reduzido e controles nativos substituem dependências adicionais de animação/UI.

São 13 áreas: cabeçalho, hero, dor/solução, funcionalidades, segmentos, etapas, demonstração, preços, WhatsApp/IA, segurança, FAQ, CTA e rodapé. Segmentos selecionáveis e abas são exemplos do produto, não interfaces operacionais. Todas as ilustrações SVG locais e demos são representativas; não usam registros reais de clientes. Imagem Open Graph local em `public/landing/og.png`.

## Configuração comercial e acesso

- `landingOffer`: URLs de login/cadastro, contato, teste e preço-base. O catálogo serve à apresentação, nunca ao cálculo da cobrança.
- `landingPlans` em `landing-content.ts`: composições Essencial (app), Profissional (app + Aggenda Atendimento) e Completo (app + Aggenda Secretária). Não criam três planos novos no banco.
- A pedido do usuário, app anual de R$ 478,80 (equivalente a R$ 39,90/mês). Mensal R$ 49,90; adicionais da proposta aprovada. Semestral continua documentado, mas não foi acrescentado ao seletor da landing neste momento.
- A alternância mensal/anual compara a oferta comercial futura; não envia seleção para checkout nem altera assinatura. Aviso de piloto informa condições específicas no checkout.
- `billing-plans.ts`, variáveis financeiras e ações de cobrança não foram alterados: preservar o teste de R$ 5.
- `/entrar` mantém login e-mail/senha, Google quando configurado, cadastro e recuperação de senha. CTAs mantêm o callback existente para onboarding e assinatura.
- 30 dias gratuitos já existentes no cadastro de organizações; não converter automaticamente módulos experimentais em cobrança. Sem promessa de inclusão gratuita de agentes/integrações.

## SEO, acessibilidade e analytics

Metadados específicos, canonical, Open Graph/Twitter e JSON-LD SoftwareApplication sem avaliações ou preços transacionais fictícios. Um h1, títulos e landmarks, skip link, menu móvel com Escape, abas com setas/Home/End, controles com estados e FAQ nativo. Imagens next/image com dimensões e SVGs locais; sem fotos externas ou bibliotecas pesadas adicionadas. CSS de animação respeita prefers-reduced-motion.

CTAs possuem atributos `data-conversion` com identificadores sem dados pessoais, prontos para instrumentação futura. Não há SDK de analytics ou transmissão adicional instalada. Contato reutiliza endereço existente; redes sociais omitidas por não haver perfis institucionais confirmados.

## Pendências comerciais e publicação

Antes de substituir a cobrança piloto pela oferta: integrar catálogo modular à cobrança, seleção de período/módulos e limites reais; conferir condições de cancelamento/restituição/parcelamento, custos Meta/IA/assinatura, contratação posterior e franquias. Certificar que comunicação e checkout concordam antes de encerrar piloto. Oferta ICP e NFS-e não anunciada como pronta; gravação/transcrição adiada.

Publicar pelo fluxo habitual do repositório/Vercel após build e revisão. Não requer migração ou nova variável de ambiente. A alteração da landing não exige redeploy do worker. Validar `/`, imagens, `/entrar`, callbacks, `/privacidade` e `/termos`; testar abas, segmentos, períodos, FAQ e menu em desktop/tablet/celular. Nunca concluir pagamentos apenas para testar a landing.


## Verificação local

Build completo `next build --webpack` concluído com sucesso (94 páginas geradas), incluindo a página inicial estática. Publicação em produção não executada nesta entrega.

Conferidos no Chrome: desktop, celular (390 px) e tablet (768 px), sem rolagem horizontal; imagens carregadas, seleção de segmentos, seis abas de demonstração, setas de teclado, menu móvel e Escape, FAQ e alternância de preços. Login conferido com e-mail/senha, criação de conta, recuperação e Google presentes. Links internos existentes, um h1 e canonical corretos. TypeScript, ESLint e diff sem erros. O Turbopack local apresentou falha interna ao iniciar subprocesso de CSS; compilação alternativa Webpack usada para validação. Não houve compra, envio a clientes ou alteração em dados/checkout.
