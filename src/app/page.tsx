import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleDollarSign,
  FileText,
  HeartHandshake,
  Images,
  Layers3,
  LockKeyhole,
  MessageCircle,
  Package,
  PanelTop,
  Scissors,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import {
  LandingPricing,
  MobileNavigation,
  ProductDemo,
  SegmentSelector,
} from "@/components/landing/landing-interactions";
import { ProductPreview } from "@/components/landing/product-preview";
import { LandingMotion } from "@/components/landing/landing-motion";
import {
  landingFaqs,
  landingFeatures,
  landingOffer,
  landingNav,
} from "@/lib/landing-content";
import "./landing.css";

const title = "Aggenda — Seu negócio organizado. Seu tempo valorizado.";
const description =
  "Gestão para estética, salões, barbearias e bem-estar. Conecte agenda online, clientes, equipe, vendas, pacotes, estoque e financeiro. Conheça o Aggenda.";
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  keywords: [
    "sistema para clínica de estética",
    "software para estética",
    "agendamento online",
    "gestão para salão de beleza",
    "sistema para barbearia",
    "controle financeiro para estética",
    "gestão de clientes e agendamentos",
  ],
  openGraph: {
    title,
    description,
    url: "https://www.aggenda.app.br",
    siteName: "Aggenda",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/landing/og.png",
        width: 1200,
        height: 630,
        alt: "Aggenda — Seu negócio organizado. Seu tempo valorizado.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/landing/og.png"],
  },
};
const featureIcons = [
  CalendarDays,
  PanelTop,
  UsersRound,
  CircleDollarSign,
  Layers3,
  Package,
  HeartHandshake,
  Workflow,
  FileText,
  Images,
  MessageCircle,
  ChartNoAxesCombined,
];
const painPoints = [
  "Horários espalhados em mensagens e anotações",
  "Recebimentos e despesas difíceis de acompanhar",
  "Pacotes, sessões e comissões sem clareza",
  "Produtos e materiais sem controle",
  "Clientes que não retornam e tarefas que se acumulam",
];
function Brand() {
  return (
    <Link
      href="/#inicio"
      className="landing-brand"
      aria-label="Aggenda — início"
    >
      <Image src="/aggenda-icon.svg" width={35} height={35} alt="" />
      <span>
        aggenda<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
function Cta({
  children = "Começar agora",
  light = false,
  event = "signup",
}: {
  children?: React.ReactNode;
  light?: boolean;
  event?: string;
}) {
  return (
    <Link
      className={`landing-button ${light ? "button-light" : ""}`}
      href={landingOffer.signupUrl}
      data-conversion={event}
    >
      {children}
      <ArrowRight size={17} />
    </Link>
  );
}
function SectionHeading({
  eyebrow,
  children,
  text,
  centered = false,
}: {
  eyebrow: string;
  children: React.ReactNode;
  text?: string;
  centered?: boolean;
}) {
  return (
    <div
      className={`landing-section-heading ${centered ? "heading-centered" : ""}`}
    >
      <span className="landing-eyebrow">{eyebrow}</span>
      <h2>{children}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

export default function Home() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Aggenda",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://www.aggenda.app.br",
    description,
    inLanguage: "pt-BR",
    featureList: landingFeatures.map(([name]) => name),
  };
  return (
    <LandingMotion>
      <a className="landing-skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="landing-header">
        <div className="landing-container header-inner">
          <Brand />
          <nav className="landing-desktop-nav" aria-label="Navegação principal">
            {landingNav.map(([label, id]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <Link className="landing-login" href={landingOffer.loginUrl}>
              Entrar <ArrowUpRight size={14} />
            </Link>
            <Cta event="header-signup" />
            <MobileNavigation />
          </div>
        </div>
      </header>
      <main id="conteudo">
        <section id="inicio" className="landing-hero">
          <div className="hero-grid landing-container">
            <div className="hero-copy">
              <span className="hero-kicker">
                <span /> MENOS IMPROVISO. MAIS POSSIBILIDADES.
              </span>
              <h1>
                Mais organização
                <br />
                para seu negócio.
                <br />
                <span>Mais tempo para você.</span>
              </h1>
              <p>
                Agenda, clientes, equipe, vendas, pacotes, estoque e financeiro
                em um só lugar. Simplifique sua rotina com o Aggenda.
              </p>
              <div className="hero-actions">
                <Cta event="hero-signup" />
                <a className="landing-text-link" href="#funcionalidades">
                  Conhecer funcionalidades <ArrowDown size={16} />
                </a>
              </div>
              <div className="hero-offer">
                <span>
                  <Check size={16} /> 30 dias grátis para conhecer
                </span>
                <span>
                  A partir de <strong>R$ 39,90/mês</strong> no anual
                </span>
              </div>
            </div>
            <div className="hero-visual">
              <div className="hero-visual-label">
                <span className="landing-eyebrow">SUA ROTINA, CONECTADA</span>
                <span>01 / VISÃO DO DIA</span>
              </div>
              <ProductPreview compact />
              <div className="hero-floating-note">
                <span>
                  <Check size={17} />
                </span>
                <div>
                  <strong>Do agendamento ao próximo retorno.</strong>
                  <small>Cada etapa no mesmo lugar.</small>
                </div>
              </div>
              <div className="hero-phone">
                <div className="phone-notch" />
                <div className="phone-brand">
                  aggenda<span>.</span>
                </div>
                <small>PÁGINA DO SEU NEGÓCIO</small>
                <h3>Seu próximo cuidado começa aqui.</h3>
                <div className="phone-service">
                  <Sparkles size={18} />
                  <span>
                    Avaliação
                    <br />
                    <small>Escolha seu horário</small>
                  </span>
                </div>
                <div className="phone-days">
                  <span>
                    SEG
                    <br />
                    <b>21</b>
                  </span>
                  <span>
                    TER
                    <br />
                    <b>22</b>
                  </span>
                  <span>
                    QUA
                    <br />
                    <b>23</b>
                  </span>
                </div>
                <div className="phone-times">
                  <span>09:00</span>
                  <span>10:30</span>
                  <span>14:00</span>
                  <span>15:30</span>
                </div>
                <div className="phone-confirm">
                  Continuar <ArrowRight size={12} />
                </div>
                <p>Ilustração do portal</p>
              </div>
              <p className="hero-demo-note">
                Demonstração visual com dados ilustrativos.
              </p>
            </div>
          </div>
        </section>
        <section
          className="landing-audience-strip"
          aria-label="Segmentos atendidos"
        >
          <div className="landing-container">
            <p>
              FEITO PARA QUEM
              <br />
              <strong>CUIDA E EMPREENDE.</strong>
            </p>
            <span>
              <Sparkles size={19} /> Estética
            </span>
            <span>
              <Scissors size={19} /> Salões de beleza
            </span>
            <span>
              <UsersRound size={19} /> Barbearias
            </span>
            <span>
              <HeartHandshake size={19} /> Bem-estar
            </span>
          </div>
        </section>
        <section className="landing-section landing-container pain-section">
          <SectionHeading eyebrow="A ROTINA PODE SER MAIS LEVE">
            Seu negócio cresceu.
            <br />
            <span>Sua gestão também precisa evoluir.</span>
          </SectionHeading>
          <div className="pain-layout">
            <div className="pain-list">
              {painPoints.map((pain, index) => (
                <div key={pain}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{pain}</p>
                  <ArrowRight size={16} />
                </div>
              ))}
            </div>
            <article className="solution-card">
              <div className="solution-orbit">
                <CalendarCheck size={44} />
                <span>
                  <UsersRound size={18} />
                </span>
                <span>
                  <CircleDollarSign size={18} />
                </span>
                <span>
                  <Package size={18} />
                </span>
              </div>
              <span className="landing-eyebrow">
                UM SÓ LUGAR. UMA VISÃO MAIS CLARA.
              </span>
              <h3>
                Troque tarefas soltas
                <br />
                por uma gestão conectada.
              </h3>
              <p>
                O cliente agenda. A equipe atende. A venda entra no financeiro.
                Você acompanha o que acontece e prepara o próximo passo.
              </p>
              <a href="#demonstracao" className="landing-text-link">
                Veja como tudo se conecta <ArrowRight size={16} />
              </a>
            </article>
          </div>
        </section>
        <section
          id="funcionalidades"
          className="features-section landing-section"
        >
          <div className="landing-container">
            <SectionHeading
              eyebrow="DA AGENDA AO CRESCIMENTO"
              text="As ferramentas do dia a dia, reunidas para você administrar com mais clareza."
              centered
            >
              Tudo o que seu negócio precisa,
              <br />
              <span>conectado.</span>
            </SectionHeading>
            <div className="features-grid">
              {landingFeatures.map(([name, text], index) => {
                const Icon = featureIcons[index];
                return (
                  <article key={name}>
                    <span className="feature-icon">
                      <Icon size={22} />
                    </span>
                    <h3>{name}</h3>
                    <p>{text}</p>
                  </article>
                );
              })}
            </div>
            <div className="features-bottom">
              <p>Conheça o Aggenda e simplifique sua gestão.</p>
              <Cta event="features-signup" />
            </div>
          </div>
        </section>
        <section id="para-quem" className="landing-section landing-container">
          <SectionHeading
            eyebrow="O SEU JEITO DE ATENDER TEM ESPAÇO AQUI"
            text="Configure serviços, equipe e documentos para a realidade do seu negócio. Selecione seu segmento para explorar."
          >
            Feito para quem cuida de pessoas
            <br />
            <span>e administra um negócio.</span>
          </SectionHeading>
          <SegmentSelector />
        </section>
      <section className="landing-container migration-card" aria-labelledby="migration-title">
        <div>
          <span className="landing-eyebrow">JÁ USA OUTRO SISTEMA?</span>
          <h2 id="migration-title">Sua primeira importação é por nossa conta.</h2>
          <p>Traga seus cadastros de clientes e serviços para o Aggenda gratuitamente. Nossa equipe confere os arquivos exportados em Excel ou CSV e orienta a importação.</p>
          <small>Sujeito à compatibilidade dos arquivos e dos campos disponíveis. Outros tipos de dados precisam de avaliação.</small>
        </div>
        <a className="landing-button" href={`mailto:${landingOffer.contactEmail}?subject=Importa%C3%A7%C3%A3o%20gratuita%20para%20o%20Aggenda`} data-conversion="free-import-contact">Quero trazer meus dados <ArrowRight size={17} /></a>
      </section>
      <section id="como-funciona" className="steps-section landing-section">
          <div className="landing-container">
            <SectionHeading eyebrow="UM NOVO CAPÍTULO PARA SUA ROTINA" centered>
              Comece a organizar seu negócio
              <br />
              <span>em poucos passos.</span>
            </SectionHeading>
            <ol className="steps-grid">
              {[
                [
                  "Crie sua conta",
                  "Acesse o Aggenda e prepare seu espaço de trabalho.",
                ],
                [
                  "Dê seu toque",
                  "Cadastre seu negócio, profissionais, serviços e horários.",
                ],
                [
                  "Organize sua agenda",
                  "Reúna clientes e disponibilidades em uma rotina clara.",
                ],
                [
                  "Conecte sua gestão",
                  "Acompanhe atendimentos, vendas e financeiro no dia a dia.",
                ],
              ].map(([name, text], index) => (
                <li key={name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{name}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section
          id="demonstracao"
          className="landing-section landing-container"
        >
          <SectionHeading
            eyebrow="MENOS ABAS. MAIS CONTROLE."
            text="Explore uma representação dos módulos que acompanham sua operação."
            centered
          >
            Conheça o Aggenda <span>por dentro.</span>
          </SectionHeading>
          <ProductDemo />
        </section>
        <section className="whatsapp-section landing-section">
          <div className="landing-container whatsapp-grid">
            <div>
              <span className="landing-eyebrow">
                SEU ATENDIMENTO CONTINUA CONECTADO
              </span>
              <h2>
                Mais inteligência
                <br />
                para cada <span>conversa.</span>
              </h2>
              <p>
                Apresente seus serviços, organize o histórico e encaminhe o
                cliente para o próximo passo. Sua equipe assume quando precisar.
              </p>
              <ul>
                {[
                  "Confirmações e lembretes conforme configuração",
                  "Serviços, produtos e informações em um só canal",
                  "Histórico e encaminhamento para a equipe",
                ].map((item) => (
                  <li key={item}>
                    <Check size={17} />
                    {item}
                  </li>
                ))}
              </ul>
              <a href="#planos" className="landing-text-link">
                Conhecer as modalidades <ArrowRight size={16} />
              </a>
            </div>
            <div className="whatsapp-modes">
              <article>
                <span className="mode-icon">
                  <MessageCircle size={23} />
                </span>
                <div>
                  <small>AGGENDA ATENDIMENTO</small>
                  <h3>Acolhe, informa e direciona.</h3>
                  <p>
                    Responde dúvidas, apresenta o catálogo e envia o link para
                    agendar no portal.
                  </p>
                </div>
                <ArrowUpRight size={20} />
              </article>
              <article>
                <span className="mode-icon">
                  <CalendarCheck size={23} />
                </span>
                <div>
                  <small>AGGENDA SECRETÁRIA</small>
                  <h3>Da conversa ao agendamento.</h3>
                  <p>
                    Consulta horários, agenda, reagenda, cancela e confirma
                    presença, com alterações controladas.
                  </p>
                </div>
                <ArrowUpRight size={20} />
              </article>
              <p className="integration-note">
                <LockKeyhole size={15} /> Módulos adicionais. Dependem de canal
                ativo, integração, configuração, franquias e condições do plano.
                Tarifas externas podem se aplicar.
              </p>
            </div>
          </div>
        </section>
        <section
          id="planos"
          className="landing-section landing-container pricing-section"
        >
          <SectionHeading
            eyebrow="COMECE SIMPLES. CRESÇA NO SEU RITMO."
            text="Comece com o app e escolha os recursos adequados ao seu crescimento. Composições para um profissional, com adicionais opcionais."
            centered
          >
            Gestão profissional com um preço
            <br />
            <span>que cabe no seu negócio.</span>
          </SectionHeading>
          <LandingPricing />
        </section>
        <section className="security-section">
          <div className="landing-container security-grid">
            <div className="security-mark">
              <ShieldCheck size={46} />
            </div>
            <div>
              <span className="landing-eyebrow">
                CADA INFORMAÇÃO EM SEU LUGAR
              </span>
              <h2>
                Informações organizadas.
                <br />
                Acessos controlados.
              </h2>
              <p>
                Permissões por função, restrições para informações clínicas e
                histórico de operações ajudam sua equipe a trabalhar com
                responsabilidade.
              </p>
            </div>
            <ul>
              {[
                "Perfis e permissões de acesso",
                "Histórico e auditoria de operações",
                "Documentos e registros organizados",
              ].map((item) => (
                <li key={item}>
                  <Check size={17} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section
          id="perguntas"
          className="landing-section landing-container faq-section"
        >
          <div>
            <SectionHeading eyebrow="VAMOS SIMPLIFICAR SUAS DÚVIDAS">
              Antes de começar,
              <br />
              <span>vale saber.</span>
            </SectionHeading>
            <p>Não encontrou sua resposta?</p>
            <a
              className="landing-text-link"
              href={`mailto:${landingOffer.contactEmail}`}
            >
              Fale com a gente <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="faq-list">
            {landingFaqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <ChevronDown size={18} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="final-section">
          <div className="landing-container final-inner">
            <span className="landing-eyebrow">
              SEU NEGÓCIO ORGANIZADO. SEU TEMPO VALORIZADO.
            </span>
            <h2>
              Mais espaço para o que
              <br />
              <span>faz seu negócio acontecer.</span>
            </h2>
            <p>
              Seu próximo passo para uma gestão mais simples começa aqui.
              Organize seus atendimentos e tenha mais controle da sua rotina com
              o Aggenda.
            </p>
            <div>
              <Cta light event="final-signup">
                Começar com Aggenda
              </Cta>
              <a className="final-plans" href="#planos">
                Conhecer os planos <ArrowRight size={16} />
              </a>
            </div>
            <small>A partir de R$ 39,90/mês no anual · R$ 478,80 por ano</small>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="footer-grid">
            <div>
              <Brand />
              <p>
                Seu negócio organizado.
                <br />
                Seu tempo valorizado.
              </p>
            </div>
            <div>
              <h3>Explore</h3>
              <a href="#funcionalidades">Funcionalidades</a>
              <a href="#para-quem">Para quem é</a>
              <a href="#demonstracao">Conheça por dentro</a>
            </div>
            <div>
              <h3>Comece por aqui</h3>
              <a href="#planos">Planos e adicionais</a>
              <Link href={landingOffer.loginUrl}>Entrar na minha conta</Link>
              <a href={`mailto:${landingOffer.contactEmail}`}>Contato</a>
            </div>
            <div>
              <h3>Informações</h3>
              <Link href="/privacidade">Política de Privacidade</Link>
              <Link href="/termos">Termos de Uso</Link>
              <a href="#perguntas">Perguntas frequentes</a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              © {new Date().getFullYear()} Aggenda. Todos os direitos
              reservados.
            </p>
            <span>Feito para estética, beleza e bem-estar.</span>
          </div>
        </div>
      </footer>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />
    </LandingMotion>
  );
}
