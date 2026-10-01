import { deleteDocumentTemplate } from "@/actions/electronic-documents";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export function DeleteDocumentTemplateForm({ id, name }: { id: string; name: string }) {
  return <ActionForm action={deleteDocumentTemplate} successMessage="Modelo excluído.">
    <input type="hidden" name="id" value={id} />
    <ConfirmSubmitButton className="secondary-button py-2 text-red-700" message={`Excluir o modelo “${name}”? Documentos já emitidos serão preservados.`}>Excluir modelo</ConfirmSubmitButton>
  </ActionForm>;
}
