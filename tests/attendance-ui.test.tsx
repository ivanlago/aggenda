import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, type ComponentType, type ReactNode } from "react";
import { blankClinicalDraft, type ClinicalDraftData } from "../src/lib/clinical-draft";

test("internal attendance preserves drafts, tab state and failed form submissions", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost/atendimento/test" });
  const globals = globalThis as unknown as Record<string, unknown>;
  const original = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ["window", "document", "navigator", "Element", "HTMLElement", "HTMLFormElement", "HTMLAnchorElement", "HTMLInputElement", "HTMLTextAreaElement", "FormData", "Event", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT"]) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
  }
  let saves = 0, finalizations = 0, failSave = true, failFinalization = true, lastData: ClinicalDraftData | undefined;
  globals.attendanceUiSave = async (input: { version: number; data: ClinicalDraftData }) => {
    saves++; if (failSave) return { ok: false, error: "Falha simulada de conexão" };
    lastData = input.data; return { ok: true, version: input.version + 1, savedAt: new Date().toISOString() };
  };
  globals.attendanceUiFinalize = async () => { finalizations++; return failFinalization ? { ok: false, error: "Falha simulada ao finalizar" } : { ok: true, recordId: "record" }; };
  const bundle = await build({ stdin: { contents: 'export { ClinicalConsultationEditor } from "./src/components/clinical-consultation-editor"; export { AttendanceWorkspaceTabs } from "./src/components/attendance-workspace-tabs"; export { ActionForm } from "./src/components/action-form"; export { ModalShell } from "./src/components/modal-shell";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: "ui-boundaries", setup(builder) {
    const mocks: Record<string, string> = { "next/navigation": "const router={refresh(){}};export function useRouter(){return router}", "@/actions/clinical-draft": "export const saveClinicalDraft=(input)=>globalThis.attendanceUiSave(input);export const finalizeClinicalDraft=(input)=>globalThis.attendanceUiFinalize(input);" };
    builder.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: "ui-mock" } : undefined);
    builder.onLoad({ filter: /./, namespace: "ui-mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }] });
  const bundled = { exports: {} as Record<string, ComponentType<Record<string, unknown>>> };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), bundled, bundled.exports);
  const { ClinicalConsultationEditor: Editor, AttendanceWorkspaceTabs: Tabs, ActionForm, ModalShell } = bundled.exports;
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const render = async (node: ReactNode) => { await act(async () => { root.render(node); }); };
  const click = async (element: Element | null) => { assert.ok(element); await act(async () => { (element as HTMLElement).click(); }); };
  const button = (text: string) => Array.from(container.querySelectorAll("button")).find(node => node.textContent?.includes(text)) ?? null;
  const input = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(async () => {
      const prototype = element.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  };
  try {
    const data = { ...blankClinicalDraft("medical"), subjective: "Relato inicial", assessment: "Avaliação", plan: "Plano" };
    await render(<Tabs tabs={[{ id: "consultation", label: "Consulta", content: <Editor appointmentId="appointment" initialId="draft" initialData={data} /> }, { id: "finance", label: "Financeiro", content: <p>Pagamento</p> }]} />);
    const textarea = container.querySelector("textarea")!;
    await input(textarea, "Relato alterado e preservado");
    await click(button("Financeiro")); await click(button("Consulta"));
    assert.equal(container.querySelector("textarea")!.value, "Relato alterado e preservado");
    await click(button("Salvar rascunho agora"));
    assert.match(container.textContent!, /Falha simulada de conexão/);
    assert.equal(textarea.value, "Relato alterado e preservado");
    failSave = false;
    await click(button("Salvar rascunho agora"));
    assert.equal(lastData?.subjective, "Relato alterado e preservado");
    assert.match(container.textContent!, /Salvo no servidor/);
    await click(container.querySelector('input[type="checkbox"]'));
    await click(button("Finalizar registro clínico"));
    assert.equal(finalizations, 1); assert.match(container.textContent!, /Falha simulada ao finalizar/);
    assert.equal(textarea.value, "Relato alterado e preservado");
    failFinalization = false;
    await click(button("Finalizar registro clínico"));
    assert.equal(finalizations, 2); assert.match(container.textContent!, /Registro clínico finalizado/);
    assert.equal(saves, 2, "finalization reuses the saved version without another write");

    await render(<Editor appointmentId="appointment" initialId="recovered" initialVersion={1} initialData={lastData!} initialSavedAt={new Date().toISOString()} />);
    assert.equal(container.querySelector("textarea")!.value, "Relato alterado e preservado");
    assert.match(container.textContent!, /Rascunho recuperado/);
    await input(container.querySelector("textarea")!, "Nova alteração para salvamento automático");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1750)); });
    assert.equal(saves, 3); assert.equal(lastData?.subjective, "Nova alteração para salvamento automático");

    let attempts = 0; const received: string[] = [];
    await render(<ActionForm action={async (form: FormData) => { attempts++; received.push(String(form.get("intent"))); return attempts === 1 ? { error: "Confira o cadastro" } : undefined; }} successMessage="Cadastro salvo"><input name="name" defaultValue="" /><button name="intent" value="save">Enviar</button></ActionForm>);
    const field = container.querySelector("input")!;
    await input(field, "Nome preservado"); await click(button("Enviar"));
    assert.equal(field.value, "Nome preservado"); assert.match(container.textContent!, /Confira o cadastro/);
    assert.equal(dom.window.document.activeElement?.getAttribute("role"), "alert");
    await click(button("Enviar")); assert.equal(field.value, ""); assert.deepEqual(received, ["save", "save"]);

    Object.defineProperties(dom.window.HTMLDialogElement.prototype, {
      showModal: { configurable: true, value() { this.open = true; } }, close: { configurable: true, value() { this.open = false; } },
    });
    let confirms = 0; dom.window.confirm = () => { confirms++; return false; };
    await render(<ModalShell title="Novo cadastro" variant="new"><form><input /></form></ModalShell>);
    const trigger = button("Novo cadastro")!; await click(trigger);
    assert.equal(dom.window.document.activeElement?.tagName, "H2");
    await input(container.querySelector("input")!, "Rascunho");
    await act(async () => { container.querySelector("dialog")!.dispatchEvent(new dom.window.Event("cancel", { cancelable: true })); });
    assert.equal(confirms, 1); assert.ok(container.querySelector("dialog"));
    dom.window.confirm = () => true;
    await click(container.querySelector('[aria-label="Fechar"]'));
    assert.equal(container.querySelector("dialog"), null); assert.equal(dom.window.document.activeElement, trigger);

    // A category edit must notify the modal only after persistence succeeds.
    let savedCategory = "", rejectCategory = true;
    confirms = 0; dom.window.confirm = () => { confirms++; return false; };
    await render(<ModalShell title="Editar Avaliação" variant="edit"><ActionForm
      action={async (form: FormData) => { if (rejectCategory) return { error: "Falha ao salvar categoria" }; savedCategory = String(form.get("categoryId")); }}
      successMessage="Procedimento atualizado com sucesso." resetOnSuccess={false}>
      <select name="categoryId" defaultValue=""><option value="">Sem categoria</option><option value="consultas">Consultas</option></select>
      <button type="submit">Salvar alterações</button>
    </ActionForm></ModalShell>);
    await click(container.querySelector('[aria-label="Editar Avaliação"]'));
    const category = container.querySelector("select")!;
    await act(async () => { category.value = "consultas"; category.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    await click(button("Salvar alterações"));
    assert.match(container.textContent!, /Falha ao salvar categoria/);
    assert.equal(category.value, "consultas");
    await click(container.querySelector('[aria-label="Fechar"]'));
    assert.equal(confirms, 1, "failed saves preserve the unsaved warning");
    rejectCategory = false;
    await click(button("Salvar alterações"));
    assert.equal(savedCategory, "consultas");
    assert.equal(category.value, "consultas", "editing does not reset to the old category");
    assert.match(container.textContent!, /Procedimento atualizado com sucesso/);
    await click(container.querySelector('[aria-label="Fechar"]'));
    assert.equal(confirms, 1, "successful saves clear the dirty state");
    assert.equal(container.querySelector("dialog"), null);

  } finally {
    await act(async () => { root.unmount(); }); dom.window.close();
    for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globals[key]; }
    delete globals.attendanceUiSave; delete globals.attendanceUiFinalize;
  }
});
