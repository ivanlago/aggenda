"use client";

import { useState } from "react";

import { visibleAnamnesisFields, type AnamnesisAnswer, type AnamnesisAnswers, type AnamnesisField } from "@/lib/anamnesis";

export function AnamnesisResponseFields({ schema }: { schema: AnamnesisField[] }) {
  const [answers, setAnswers] = useState<AnamnesisAnswers>({});
  const setAnswer = (id: string, answer: AnamnesisAnswer) => setAnswers((current) => ({ ...current, [id]: answer }));
  const visible = visibleAnamnesisFields(schema, answers);
  return <div className="grid gap-4">
    <input type="hidden" name="signerResponses" value={JSON.stringify(answers)} />
    {visible.map((field) => <fieldset className="grid gap-2 rounded-2xl border bg-white p-4" key={field.id}>
      <legend className="px-1 text-sm font-extrabold">{field.label}{field.required ? " *" : ""}</legend>
      {field.helpText ? <p className="text-xs text-muted">{field.helpText}</p> : null}
      {field.type === "long_text" ? <textarea className="field min-h-24" required={field.required} value={String(answers[field.id] ?? "")} onChange={(event) => setAnswer(field.id, event.target.value)} /> : null}
      {["short_text", "number", "date"].includes(field.type) ? <input className="field" type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} required={field.required} value={String(answers[field.id] ?? "")} onChange={(event) => setAnswer(field.id, event.target.value)} /> : null}
      {field.type === "yes_no" ? <div className="flex gap-3">{["Sim", "Não"].map((option) => <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold" key={option}><input type="radio" name={`answer-${field.id}`} value={option} required={field.required} checked={answers[field.id] === option} onChange={() => setAnswer(field.id, option)} />{option}</label>)}</div> : null}
      {field.type === "single_choice" ? <div className="grid gap-2">{field.options?.map((option) => <label className="flex items-center gap-2 text-sm" key={option}><input type="radio" name={`answer-${field.id}`} value={option} required={field.required} checked={answers[field.id] === option} onChange={() => setAnswer(field.id, option)} />{option}</label>)}</div> : null}
      {field.type === "multiple_choice" ? <div className="grid gap-2">{field.options?.map((option) => { const selected = Array.isArray(answers[field.id]) ? answers[field.id] as string[] : []; return <label className="flex items-center gap-2 text-sm" key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => setAnswer(field.id, event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} />{option}</label>; })}</div> : null}
    </fieldset>)}
  </div>;
}
