import { SignatureImageForm } from "@/components/signature-image-form";
import Link from "next/link";
import { saveOwnSignatureImage } from "@/actions/signature-image";
import { registerOwnSigningIdentity } from "@/actions/professional-signatures";
import { ActionForm } from "./action-form";

export function MemberVisualSignature({own,image}:{own:boolean;image:string|null}) {
  if(!own) return <p className="text-sm text-muted">A assinatura visual deve ser cadastrada pelo próprio usuário, acessando esta aba com seu login.</p>;
  return <div className="grid gap-3"><p className="text-sm text-muted">Use @AssinaturaProfissional nos modelos para inserir sua imagem ao emitir documentos. A imagem não substitui a assinatura com certificado digital.</p><SignatureImageForm image={image}/>{image&&<ActionForm action={saveOwnSignatureImage} successMessage="Imagem removida."><input type="hidden" name="operation" value="remove"/><button className="secondary-button">Remover imagem</button></ActionForm>}</div>;
}

export function MemberProfessionalSignature({own,enabled,configured}:{own:boolean;enabled:boolean;configured:boolean}) {
  if(!own) return <p className="text-sm text-muted">Por segurança, o próprio usuário habilitado configura sua assinatura profissional nesta aba.</p>;
  if(!enabled) return <p className="text-sm text-muted">É necessário um profissional ativo e permissão para assinar documentos.</p>;
  return <div className="grid gap-4"><p className="status-pill w-fit">{configured?"Identidade cadastrada":"Identidade não cadastrada"}</p><ActionForm action={registerOwnSigningIdentity} successMessage="Identidade de assinatura atualizada." className="grid gap-3"><label className="grid gap-1 text-sm font-bold">Seu CPF<input className="field" name="cpf" inputMode="numeric" autoComplete="off" required placeholder={configured?"Informe o CPF para atualizar":"CPF do titular do certificado"}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" required/>Confirmo que este CPF é meu e corresponde ao meu certificado.</label><div className="flex justify-end"><button className="primary-button">Salvar identidade</button></div></ActionForm><ol className="list-decimal space-y-2 pl-5 text-sm"><li>Cadastre seu CPF, igual ao titular do certificado digital.</li><li>Tenha seu certificado A1 e a ferramenta local de assinatura preparados no computador.</li><li>Abra Assinatura profissional e escolha um documento emitido em seu nome.</li><li>Siga o passo a passo, confirme o código recebido e envie a assinatura para validação. O certificado e sua senha permanecem no computador.</li></ol><div><Link className="secondary-button" href="/documentos/assinatura-profissional">Abrir documentos para assinatura</Link></div></div>;
}
