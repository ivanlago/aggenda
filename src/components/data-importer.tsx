"use client";

import Papa from "papaparse";
import { useMemo, useState } from "react";

type EntityType = "clients" | "services";
type Matrix = string[][];
const fields = {
  clients: [
    ["name", "Nome *"], ["phone", "Telefone"], ["email", "E-mail"], ["birthDate", "Data de nascimento"], ["gender", "Sexo"], ["notes", "Observações"],
  ],
  services: [
    ["name", "Nome *"], ["description", "Descrição"], ["durationMinutes", "Duração em minutos *"],
    ["price", "Preço"], ["isActive", "Ativo"], ["requiresProfessional", "Exige profissional"],
  ],
} as const;
const aliases: Record<string, string[]> = {
  name: ["nome", "nome completo", "nome do cliente", "nome do paciente", "servico", "serviço", "procedimento"],
  phone: ["telefone", "celular", "whatsapp", "fone", "contato"], email: ["email", "e-mail", "e mail"],
  birthDate: ["data de nascimento", "nascimento", "data_nascimento", "birthdate"],
  gender: ["sexo", "genero", "gênero", "gender"],
  notes: ["observacoes", "observações", "anotacoes", "anotações", "notas"],
  description: ["descricao", "descrição", "detalhes"], durationMinutes: ["duracao", "duração", "duracao minutos", "duração minutos", "tempo", "minutos"],
  price: ["preco", "preço", "valor"], isActive: ["ativo", "status"], requiresProfessional: ["exige profissional", "requer profissional", "profissional obrigatorio"],
};
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function parseFile(file: File): Promise<Matrix> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    return new Promise((resolve, reject) => Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy", complete: (result) => resolve(result.data.map((row) => row.map(String))), error: reject,
    }));
  }
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("A planilha não possui nenhuma aba.");
  const matrix: Matrix = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    matrix.push((row.values as unknown[]).slice(1).map((value) => {
      if (value && typeof value === "object" && "text" in value) return String((value as { text: unknown }).text);
      if (value && typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "");
      return String(value ?? "");
    }));
  });
  return matrix;
}

export function DataImporter() {
  const [entityType, setEntityType] = useState<EntityType>("clients");
  const [fileName, setFileName] = useState("");
  const [matrix, setMatrix] = useState<Matrix>([]);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [strategy, setStrategy] = useState<"skip" | "update">("skip");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ summary?: Record<string, number>; results?: Array<{ row: number; action: string; error?: string }>; error?: string } | null>(null);
  const headers = matrix[0] ?? [];
  const dataRows = useMemo(() => matrix.slice(1).filter((row) => row.some((cell) => cell.trim())), [matrix]);

  async function selectFile(file?: File) {
    if (!file) return;
    setResult(null); setFileName(file.name);
    if (!/\.(csv|xlsx)$/i.test(file.name)) { setResult({ error: "Use um arquivo CSV ou XLSX." }); return; }
    if (file.size > 5_000_000) { setResult({ error: "O arquivo deve ter no máximo 5 MB." }); return; }
    try {
      const parsed = await parseFile(file);
      if (parsed.length < 2) throw new Error("O arquivo precisa conter cabeçalho e pelo menos uma linha.");
      if (parsed.length > 5001) throw new Error("Importe no máximo 5.000 registros por arquivo.");
      setMatrix(parsed);
      const automatic: Record<string, number | null> = {};
      fields[entityType].forEach(([key]) => {
        automatic[key] = parsed[0].findIndex((header) => [key, ...(aliases[key] ?? [])].map(normalize).includes(normalize(header)));
        if (automatic[key] === -1) automatic[key] = null;
      });
      setMapping(automatic);
    } catch (error) { setResult({ error: error instanceof Error ? error.message : "Não foi possível ler o arquivo." }); }
  }

  function changeType(type: EntityType) { setEntityType(type); setMatrix([]); setMapping({}); setFileName(""); setResult(null); }
  async function importData() {
    if (mapping.name == null || (entityType === "services" && mapping.durationMinutes == null)) {
      setResult({ error: "Relacione todas as colunas obrigatórias." }); return;
    }
    setBusy(true); setResult(null);
    const rows = dataRows.map((row) => Object.fromEntries(fields[entityType].map(([key]) => [key, mapping[key] == null ? "" : row[mapping[key]!] ?? ""])));
    try {
      const response = await fetch("/api/data-imports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ importId: crypto.randomUUID(), entityType, fileName, strategy, rows }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha na importação.");
      setResult(payload); if (!payload.summary?.errorRows) setMatrix([]);
    } catch (error) { setResult({ error: error instanceof Error ? error.message : "Falha na importação." }); }
    finally { setBusy(false); }
  }
  function downloadErrors() {
    const errors = result?.results?.filter((item) => item.error) ?? [];
    const csv = `\uFEFFlinha;erro\r\n${errors.map((item) => `${item.row};"${item.error?.replace(/"/g, '""')}"`).join("\r\n")}`;
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); link.download = "erros-importacao.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  return <div className="grid gap-6">
    <section className="panel grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">Conteúdo<select className="field" value={entityType} onChange={(event) => changeType(event.target.value as EntityType)}><option value="clients">Clientes</option><option value="services">Serviços</option></select></label>
        <label className="grid gap-2 text-sm font-bold">Arquivo CSV ou XLSX<input className="field" type="file" accept=".csv,.xlsx" onChange={(event) => selectFile(event.target.files?.[0])} /></label>
      </div>
      <div className="flex flex-wrap gap-2 text-sm"><a className="secondary-button" href={`/api/data-exports?type=${entityType}&format=csv&template=1`}>Baixar modelo CSV</a><a className="secondary-button" href={`/api/data-exports?type=${entityType}&format=xlsx&template=1`}>Baixar modelo XLSX</a></div>
    </section>
    {matrix.length > 0 && <section className="panel grid gap-5">
      <div><h2 className="text-lg font-extrabold">Relacionar colunas</h2><p className="text-sm text-muted">{fileName} · {dataRows.length} registros encontrados</p></div>
      <div className="grid gap-3 sm:grid-cols-2">{fields[entityType].map(([key, label]) => <label key={key} className="grid gap-1 text-sm font-bold">{label}<select className="field" value={mapping[key] ?? ""} onChange={(event) => setMapping({ ...mapping, [key]: event.target.value === "" ? null : Number(event.target.value) })}><option value="">Não importar</option>{headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header || `Coluna ${index + 1}`}</option>)}</select></label>)}</div>
      <label className="grid gap-2 text-sm font-bold">Registros já existentes<select className="field" value={strategy} onChange={(event) => setStrategy(event.target.value as "skip" | "update")}><option value="skip">Ignorar e manter o cadastro atual</option><option value="update">Atualizar com os dados da planilha</option></select></label>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{fields[entityType].map(([key, label]) => <th className="border-b p-2" key={key}>{label}</th>)}</tr></thead><tbody>{dataRows.slice(0, 8).map((row, index) => <tr key={index}>{fields[entityType].map(([key]) => <td className="border-b p-2" key={key}>{mapping[key] == null ? "—" : row[mapping[key]!] || "—"}</td>)}</tr>)}</tbody></table></div>
      <button className="primary-button" disabled={busy} onClick={importData}>{busy ? "Importando…" : `Confirmar importação de ${dataRows.length} registros`}</button>
    </section>}
    {result?.error && <div className="rounded-xl bg-red-50 p-4 font-bold text-red-800">{result.error}</div>}
    {result?.summary && <section className="panel"><h2 className="font-extrabold">Importação concluída</h2><p className="mt-2 text-sm">{result.summary.createdRows} criados · {result.summary.updatedRows} atualizados · {result.summary.skippedRows} ignorados · {result.summary.errorRows} erros</p>{result.summary.errorRows > 0 && <button className="secondary-button mt-4" onClick={downloadErrors}>Baixar linhas com erro</button>}</section>}
  </div>;
}
