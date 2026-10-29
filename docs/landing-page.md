# Página comercial do Aggenda

## Destaques comerciais — 29/10/2026

Funcionalidades ampliadas com cartões próprios para vendas e PDV, integrações de pagamento (Asaas, Mercado Pago, PagBank e Efí/Pix), assinatura eletrônica e emissão de NFS-e. O cartão fiscal tem selo explícito de homologação e informa que produção ainda não está liberada; também é excluído da lista de recursos disponíveis no JSON-LD. FAQ detalha configuração/ativação de pagamentos, contratação/franquia de assinatura eletrônica e separação da assinatura qualificada ICP-Brasil. Abertura e metadados reforçam o fluxo de agendar, atender, vender e receber. Sem alterações na cobrança ou habilitação de recursos.

## Vídeo de apresentação — 29/10/2026

Vídeo final fornecido pelo usuário incorporado em `public/landing/aggenda-demonstracao.mp4` (3,7 MB, 1280 × 720, aproximadamente 100 segundos), na seção de demonstração antes dos módulos ilustrativos. O CTA secundário do hero leva diretamente ao player. Capa SVG local, controles nativos, reprodução inline em celulares e `preload="none"`, sem autoplay ou dependência de serviços externos. Link alternativo permite abrir o MP4 em outra aba. Mantido aviso sobre contratação/configuração de WhatsApp e IA.

Atualização de 22/10/2026: as descrições históricas abaixo registram a criação original da landing. A contratação agora usa `/assinatura` com três composições e preços reais do catálogo comercial, transmite plano/período selecionados e separa o piloto anual de R$ 5 por convite. Os adicionais de profissionais e as franquias foram atualizados. Referência vigente: `checkout-comercial-piloto.md` e `precificacao-aprovada.md`.

## Escopo e arquivos

Nova página `/`, sem mudanças em autenticação, checkout, dados de clientes ou permissões. Componentes em `src/components/landing`, conteúdo em `src/lib/landing-content.ts` e estilos isolados sob `.aggenda-landing` em `src/app/landing.css`. Reutiliza Next/React, Lucide, fonte e identidade existentes, com Motion (antes Framer Motion) para animações.

São 13 áreas: cabeçalho, hero, dor/solução, funcionalidades, segmentos, etapas, demonstração, preços, WhatsApp/IA, segurança, FAQ, CTA e rodapé. Segmentos selecionáveis e abas são exemplos do produto, não interfaces operacionais. Todas as ilustrações SVG locais e demos são representativas; não usam registros reais de clientes. Imagem Open Graph local em `public/landing/og.png`.

## Configuração comercial e acesso

- Oferta de importação gratuita: primeira importação de cadastros de clientes e serviços, a partir de Excel/CSV exportados pelo cliente, com conferência de campos/compatibilidade e orientação da equipe. Destaque próprio antes das etapas de implantação e resposta no FAQ. Não inclui automaticamente prontuários, imagens, documentos ou histórico financeiro; esses casos precisam de avaliação. Contato pelo e-mail institucional existente, sem envio automático de dados.

- `landingOffer`: URLs de login/cadastro, contato, teste e preço-base. O catálogo serve à apresentação, nunca ao cálculo da cobrança.
- `landingPlans` em `landing-content.ts`: composições Essencial (app), Profissional (app + Aggenda Atendimento) e Completo (app + Aggenda Secretária). Não criam três planos novos no banco.
- A pedido do usuário, app anual de R$ 478,80 (equivalente a R$ 39,90/mês). Mensal R$ 49,90; adicionais da proposta aprovada. Semestral continua documentado, mas não foi acrescentado ao seletor da landing neste momento.
- A alternância mensal/anual compara a oferta comercial futura; não envia seleção para checkout nem altera assinatura. Aviso de piloto informa condições específicas no checkout.
- `billing-plans.ts`, variáveis financeiras e ações de cobrança não foram alterados: preservar o teste de R$ 5.
- `/entrar` mantém login e-mail/senha, Google quando configurado, cadastro e recuperação de senha. CTAs mantêm o callback existente para onboarding e assinatura.
- 30 dias gratuitos já existentes no cadastro de organizações; não converter automaticamente módulos experimentais em cobrança. Sem promessa de inclusão gratuita de agentes/integrações.

## SEO, acessibilidade e analytics

Metadados específicos, canonical, Open Graph/Twitter e JSON-LD SoftwareApplication sem avaliações ou preços transacionais fictícios. Um h1, títulos e landmarks, skip link, menu móvel com Escape, abas com setas/Home/End, controles com estados e FAQ nativo. Imagens next/image com dimensões e SVGs locais; sem fotos externas. CSS e Motion respeitam prefers-reduced-motion.

## Animações e interação

Motion (`motion` / `motion/react`) anima a entrada sequencial do hero, revelações por viewport (fade, subida, deslocamento lateral e zoom), menu móvel e trocas de módulos, segmentos e valores dos planos. A página mantém seu conteúdo renderizado no servidor e visível sem JavaScript; apenas a camada de animação e os controles interativos são componentes cliente. Os observadores e animações são encerrados ao desmontar.

Hover em links e menus: sublinhado animado, cores, deslocamento das setas, destaque de botões/abas e ícones dos cartões. Hover com deslocamento é limitado a ponteiros precisos; foco visível permanece disponível por teclado. Com movimento reduzido, as entradas e deslocamentos são removidos. Não há animações contínuas de fundo nem mudanças nas URLs de login/cadastro ou valores comerciais.

CTAs possuem atributos `data-conversion` com identificadores sem dados pessoais, prontos para instrumentação futura. Não há SDK de analytics ou transmissão adicional instalada. Contato reutiliza endereço existente; redes sociais omitidas por não haver perfis institucionais confirmados.

## Pendências comerciais e publicação

Antes de substituir a cobrança piloto pela oferta: integrar catálogo modular à cobrança, seleção de período/módulos e limites reais; conferir condições de cancelamento/restituição/parcelamento, custos Meta/IA/assinatura, contratação posterior e franquias. Certificar que comunicação e checkout concordam antes de encerrar piloto. Oferta ICP e NFS-e não anunciada como pronta; gravação/transcrição adiada.

Publicar pelo fluxo habitual do repositório/Vercel após build e revisão. Não requer migração ou nova variável de ambiente. A alteração da landing não exige redeploy do worker. Validar `/`, imagens, `/entrar`, callbacks, `/privacidade` e `/termos`; testar abas, segmentos, períodos, FAQ e menu em desktop/tablet/celular. Nunca concluir pagamentos apenas para testar a landing.


## Verificação local

Build completo `next build --webpack` concluído com sucesso (94 páginas geradas), incluindo a página inicial estática. Publicação em produção não executada nesta entrega.

Conferidos no Chrome: desktop, celular (390 px) e tablet (768 px), sem rolagem horizontal; imagens carregadas, seleção de segmentos, seis abas de demonstração, setas de teclado, menu móvel e Escape, FAQ e alternância de preços. Login conferido com e-mail/senha, criação de conta, recuperação e Google presentes. Links internos existentes, um h1 e canonical corretos. TypeScript, ESLint e diff sem erros. O Turbopack local apresentou falha interna ao iniciar subprocesso de CSS; compilação alternativa Webpack usada para validação. Não houve compra, envio a clientes ou alteração em dados/checkout.
