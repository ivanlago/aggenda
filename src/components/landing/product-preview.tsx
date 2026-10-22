import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  LayoutGrid,
  Package,
  Search,
  UsersRound,
} from "lucide-react";

export type PreviewView =
  | "agenda"
  | "clientes"
  | "financeiro"
  | "pacotes"
  | "estoque"
  | "atendimento";
const labels: Record<PreviewView, string> = {
  agenda: "Sua agenda, em equilíbrio.",
  clientes: "Cada cliente tem uma história.",
  financeiro: "Clareza para acompanhar o caixa.",
  pacotes: "Cada sessão no seu lugar.",
  estoque: "Tudo pronto para atender.",
  atendimento: "Um cuidado que tem continuidade.",
};
const people = [
  "Cliente de exemplo A",
  "Cliente de exemplo B",
  "Cliente de exemplo C",
];

export function ProductPreview({
  view = "agenda",
  compact = false,
}: {
  view?: PreviewView;
  compact?: boolean;
}) {
  return (
    <div
      className={`product-preview ${compact ? "preview-compact" : ""}`}
      aria-label={`Demonstração ilustrativa: ${view}`}
    >
      <div className="preview-chrome">
        <span />
        <span />
        <span />
        <p>aggenda · seu espaço de trabalho</p>
        <span className="preview-secure">Ambiente ilustrativo</span>
      </div>
      <div className="preview-shell">
        <aside className="preview-sidebar" aria-hidden="true">
          <div className="preview-symbol">
            a<span>g</span>
          </div>
          {[
            LayoutGrid,
            CalendarDays,
            UsersRound,
            CircleDollarSign,
            Package,
          ].map((Icon, index) => (
            <div className={index === 1 ? "selected" : ""} key={index}>
              <Icon size={17} />
            </div>
          ))}
          <div className="preview-avatar">A</div>
        </aside>
        <div className="preview-main">
          <div className="preview-topline">
            <span>
              Studio exemplo <ChevronRight size={12} /> Visão geral
            </span>
            <Search size={15} />
          </div>
          <div className="preview-heading">
            <div>
              <small>MAIS CLAREZA PARA O SEU DIA</small>
              <h3>{labels[view]}</h3>
            </div>
            <span className="preview-new">+ Novo</span>
          </div>
          {view === "agenda" ? (
            <>
              <div className="preview-metrics">
                <div>
                  <span>Agenda do dia</span>
                  <strong>3 atendimentos</strong>
                  <small>Exemplo de organização</small>
                </div>
                <div>
                  <span>Recebimentos</span>
                  <strong>R$ —</strong>
                  <small>Seu financeiro conectado</small>
                </div>
                <div>
                  <span>Clientes</span>
                  <strong>Tudo por perto</strong>
                  <small>Histórico em um só lugar</small>
                </div>
              </div>
              <div className="preview-calendar">
                <div className="preview-calendar-head">
                  <strong>Uma manhã bem organizada</strong>
                  <span>
                    <ChevronLeft size={13} /> Dia · Semana{" "}
                    <ChevronRight size={13} />
                  </span>
                </div>
                <div className="preview-days">
                  <span>Horário</span>
                  <span>Profissional A</span>
                  <span>Profissional B</span>
                </div>
                {["09:00", "10:00", "11:00"].map((time, index) => (
                  <div className="preview-time-row" key={time}>
                    <time>{time}</time>
                    <div className={`preview-event event-${index}`}>
                      <span>
                        {["Avaliação", "Tratamento facial", "Retorno"][index]}
                      </span>
                      <small>{people[index]}</small>
                      <em>
                        <Check size={10} /> Confirmado
                      </em>
                    </div>
                    <div className="preview-free">
                      {index === 1 ? (
                        <div className="preview-event event-light">
                          <span>Atendimento</span>
                          <small>Cliente de exemplo D</small>
                        </div>
                      ) : (
                        <span>Disponível</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : view === "atendimento" ? (
            <div className="preview-record">
              <div className="preview-client">
                <span>CE</span>
                <div>
                  <strong>Cliente de exemplo</strong>
                  <small>Histórico do atendimento</small>
                </div>
                <span className="preview-status">Em atendimento</span>
              </div>
              <div className="preview-record-tabs">
                Visão geral <b>Consulta</b> Fotos e exames
              </div>
              <h4>Evolução do atendimento</h4>
              <p>
                Informações e orientações organizadas para acompanhar cada
                etapa.
              </p>
              <div className="preview-lines">
                <i />
                <i />
                <i />
              </div>
              <span className="preview-save">
                <Check size={13} /> Rascunho salvo
              </span>
            </div>
          ) : (
            <div className="preview-table">
              <div className="preview-table-title">
                <strong>
                  {
                    {
                      clientes: "Seus clientes",
                      financeiro: "Movimentações",
                      pacotes: "Pacotes em acompanhamento",
                      estoque: "Produtos e materiais",
                    }[view]
                  }
                </strong>
                <span>Exemplos de cadastro</span>
              </div>
              <div className="preview-table-header">
                <span>{view === "estoque" ? "Produto" : "Descrição"}</span>
                <span>Informações</span>
                <span>Situação</span>
              </div>
              {[0, 1, 2, 3].map((index) => (
                <div className="preview-table-row" key={index}>
                  <span>
                    <i>{index + 1}</i>
                    {view === "clientes"
                      ? `Cliente de exemplo ${index + 1}`
                      : view === "estoque"
                        ? [
                            "Sérum facial",
                            "Creme hidratante",
                            "Material de consumo",
                            "Óleo de massagem",
                          ][index]
                        : view === "pacotes"
                          ? [
                              "Cuidados faciais",
                              "Massoterapia",
                              "Tratamento corporal",
                              "Depilação",
                            ][index]
                          : [
                              "Atendimento",
                              "Venda de produto",
                              "Despesa operacional",
                              "Pacote de sessões",
                            ][index]}
                  </span>
                  <span>
                    {view === "financeiro"
                      ? "R$ —"
                      : view === "pacotes"
                        ? "Saldo de sessões"
                        : view === "estoque"
                          ? "Controle de saldo"
                          : "Histórico e contatos"}
                  </span>
                  <span className="preview-status">
                    {view === "financeiro" && index === 2
                      ? "A pagar"
                      : "Organizado"}
                  </span>
                </div>
              ))}
              <div className="preview-bottom">
                <Check size={13} /> Informações conectadas à sua rotina{" "}
                <ArrowUpRight size={13} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
