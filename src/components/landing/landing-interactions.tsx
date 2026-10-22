"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Menu,
  Sparkles,
  X,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  landingNav,
  landingOffer,
  landingSegments,
  landingPlans,
} from "@/lib/landing-content";
import { ProductPreview, type PreviewView } from "./product-preview";

export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const toggle = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    toggle.current?.focus();
  }
  return (
    <div
      className="landing-mobile-nav"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) close();
      }}
    >
      <button
        ref={toggle}
        type="button"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls="landing-mobile-menu"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      <AnimatePresence initial={false}>{open && (
        <motion.nav id="landing-mobile-menu" aria-label="Navegação móvel"
          initial={{ opacity: 0, y: reducedMotion ? 0 : -10, scale: reducedMotion ? 1 : 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          {landingNav.map(([label, id]) => (
            <a href={`#${id}`} key={id} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          <Link href={landingOffer.loginUrl}>Entrar na minha conta</Link>
          <Link className="landing-button" href={landingOffer.signupUrl}>
            Começar agora <ArrowRight size={16} />
          </Link>
        </motion.nav>
      )}</AnimatePresence>
    </div>
  );
}

export function SegmentSelector() {
  const [selected, setSelected] = useState(0);
  const reducedMotion = useReducedMotion();
  const item = landingSegments[selected];
  return (
    <>
      <div className="segment-grid">
        {landingSegments.map((segment, index) => (
          <button
            className={`segment-card ${selected === index ? "is-selected" : ""}`}
            key={segment.name}
            type="button"
            aria-pressed={selected === index}
            aria-controls="segment-detail"
            onClick={() => setSelected(index)}
          >
            <div className="segment-image">
              <Image
                src={`/landing/${segment.image}.svg`}
                alt=""
                width={480}
                height={300}
                sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw"
              />
              <span>{String(index + 1).padStart(2, "0")}</span>
            </div>
            <div className="segment-copy">
              <h3>{segment.name}</h3>
              <p>{segment.description}</p>
              <span className="segment-link">
                Explorar possibilidades <ArrowRight size={15} />
              </span>
            </div>
          </button>
        ))}
      </div>
      <div id="segment-detail" className="segment-detail" aria-live="polite">
        <motion.div key={item.name} initial={false}
          animate={reducedMotion ? { opacity: 1 } : { opacity: [0.5, 1], x: [-10, 0] }}
          transition={{ duration: 0.28 }}>
          <span className="landing-eyebrow">
            AGGENDA PARA {item.short.toLocaleUpperCase("pt-BR")}
          </span>
          <h3>Uma gestão que acompanha seu jeito de atender.</h3>
          <p>{item.detail}</p>
        </motion.div>
        <ul>
          {item.benefits.map((benefit) => (
            <li key={benefit}>
              <Check size={17} />
              {benefit}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

const demoViews: { id: PreviewView; label: string; benefit: string }[] = [
  {
    id: "agenda",
    label: "Agenda",
    benefit:
      "Veja os horários da equipe e encontre espaço para cada atendimento.",
  },
  {
    id: "clientes",
    label: "Clientes",
    benefit:
      "Encontre contatos e histórico sem perder o contexto de cada cliente.",
  },
  {
    id: "financeiro",
    label: "Financeiro",
    benefit: "Acompanhe recebimentos e despesas com uma visão organizada.",
  },
  {
    id: "pacotes",
    label: "Pacotes",
    benefit:
      "Confira o saldo de sessões e a continuidade dos serviços contratados.",
  },
  {
    id: "estoque",
    label: "Estoque",
    benefit: "Conecte produtos, vendas e consumo interno ao controle de saldo.",
  },
  {
    id: "atendimento",
    label: "Atendimento",
    benefit:
      "Reúna registros, documentos e informações para atender com contexto.",
  },
];

export function ProductDemo() {
  const [selected, setSelected] = useState(0);
  const reducedMotion = useReducedMotion();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % demoViews.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + demoViews.length) % demoViews.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = demoViews.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  }
  return (
    <div className="demo-interactive">
      <div
        className="demo-tabs"
        role="tablist"
        aria-label="Explore os módulos do Aggenda"
      >
        {demoViews.map((view, index) => (
          <button
            type="button"
            role="tab"
            key={view.id}
            id={`demo-tab-${view.id}`}
            aria-controls={`demo-panel-${view.id}`}
            aria-selected={index === selected}
            tabIndex={index === selected ? 0 : -1}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => setSelected(index)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <motion.div
        key={demoViews[selected].id}
        initial={false}
        animate={reducedMotion ? { opacity: 1 } : { opacity: [0.5, 1], y: [10, 0] }}
        transition={{ duration: 0.3 }}
        id={`demo-panel-${demoViews[selected].id}`}
        role="tabpanel"
        aria-labelledby={`demo-tab-${demoViews[selected].id}`}
        tabIndex={0}
      >
        <ProductPreview view={demoViews[selected].id} />
        <div className="demo-caption">
          <p>{demoViews[selected].benefit}</p>
          <span>Demonstração visual · dados ilustrativos</span>
        </div>
      </motion.div>
    </div>
  );
}

const formatMoney = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function LandingPricing() {
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");
  const reducedMotion = useReducedMotion();
  return (
    <>
      <div
        className="price-cycle"
        role="group"
        aria-label="Comparar períodos da oferta comercial"
      >
        <button
          type="button"
          aria-pressed={cycle === "monthly"}
          onClick={() => setCycle("monthly")}
        >
          Mensal
        </button>
        <button
          type="button"
          aria-pressed={cycle === "annual"}
          onClick={() => setCycle("annual")}
        >
          Anual <span>Economize</span>
        </button>
      </div>
      <div className="pricing-grid">
        {landingPlans.map((card, index) => (
          <article
            className={`price-card ${index === 1 ? "price-featured" : ""}`}
            key={card.name}
          >
            {index === 1 && (
              <div className="price-ribbon">
                <Sparkles size={13} /> PARA CONECTAR GESTÃO E ATENDIMENTO
              </div>
            )}
            <span className="landing-eyebrow">{card.tag}</span>
            <h3>{card.name}</h3>
            <p className="price-subtitle">{card.subtitle}</p>
            <div className="price-value">
              <motion.strong key={cycle} initial={false}
                animate={reducedMotion ? { opacity: 1 } : { opacity: [0.4, 1], y: [6, 0] }}
                transition={{ duration: 0.25 }}>
                {formatMoney(
                  cycle === "monthly" ? card.monthly : card.annual / 12,
                )}
              </motion.strong>
              <span>/mês</span>
            </div>
            <p className="price-period">
              {cycle === "annual"
                ? `${formatMoney(card.annual)} por ano, pagamento antecipado`
                : "Cobrança mensal"}
            </p>
            <Link
              href={landingOffer.signupUrl}
              className={`landing-button ${index === 1 ? "button-light" : "button-outline"}`}
              data-conversion={`plan-${card.name.toLowerCase()}-${cycle}`}
            >
              Ver condições do plano <ArrowRight size={16} />
            </Link>
            <ul>
              {card.features.map((feature) => (
                <li key={feature}>
                  <Check size={16} />
                  {feature}
                </li>
              ))}
            </ul>
            <p className="price-note">{card.note}</p>
          </article>
        ))}
      </div>
      <details className="price-addons">
        <summary>
          Seu negócio cresceu? Conheça os adicionais <ChevronDown size={17} />
        </summary>
        <div>
          <p>
            Valores mensais da oferta comercial. Profissionais e módulos são
            contratados separadamente.
          </p>
          <ul>
            <li>
              Profissional adicional <strong>R$ 19,90/mês</strong>
            </li>
            <li>
              Assinatura eletrônica: 50 documentos <strong>R$ 19,90/mês</strong>
            </li>
            <li>
              Aggenda Atendimento: informações e link para agendar{" "}
              <strong>R$ 99,90/mês</strong>
            </li>
            <li>
              Aggenda Secretária: agendamento na conversa <strong>R$ 199,90/mês</strong>
            </li>
          </ul>
          <p>
            Agentes com franquia proposta de 1.000 respostas/mês e um canal por
            contratação. Tarifas da Meta e serviços externos podem ser cobradas
            separadamente. Consulte as condições de ativação e os pacotes
            adicionais.
          </p>
        </div>
      </details>
      <p className="price-pilot">
        <strong>Contratação em fase piloto.</strong> Esta é a oferta comercial
        de lançamento. O checkout mantém condições específicas de teste; confira
        o valor e as condições exibidos antes de pagar. A seleção acima compara
        ofertas e não altera sua contratação. Recursos externos dependem de
        configuração e validação.
      </p>
    </>
  );
}
