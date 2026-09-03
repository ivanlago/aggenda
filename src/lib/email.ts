import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const from = process.env.RESEND_FROM_EMAIL || "Aggenda <contato@aggenda.app.br>";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailLayout(title: string, content: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f7f3;font-family:Arial,sans-serif;color:#172018"><div style="max-width:560px;margin:0 auto;padding:32px 16px"><div style="background:#fff;border:1px solid #e2e8df;border-radius:20px;padding:32px"><div style="font-size:24px;font-weight:800;color:#24543a">Aggenda</div><h1 style="font-size:24px;margin:28px 0 12px">${escapeHtml(title)}</h1>${content}<p style="margin:28px 0 0;color:#647066;font-size:13px">Se você não esperava esta mensagem, pode ignorá-la com segurança.</p></div></div></body></html>`;
}

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}) {
  if (!resend) throw new Error("RESEND_API_KEY não configurada.");

  const { error } = await resend.emails.send(
    { from, to: input.to, subject: input.subject, html: input.html },
    { idempotencyKey: input.idempotencyKey },
  );
  if (error) throw new Error(error.message);
}

export async function sendPasswordResetEmail(input: {
  email: string;
  name: string;
  url: string;
  token: string;
}) {
  const name = escapeHtml(input.name || "Olá");
  const url = escapeHtml(input.url);
  const firstAccess = input.url.includes("primeiroAcesso%3D1") || input.url.includes("primeiroAcesso=1");
  await sendEmail({
    to: input.email,
    subject: firstAccess ? "Crie sua senha de acesso ao Aggenda" : "Redefina sua senha do Aggenda",
    idempotencyKey: `password-reset-${input.token}`,
    html: emailLayout(
      firstAccess ? "Seu acesso profissional foi criado" : "Redefinição de senha",
      `<p style="line-height:1.6">${name}, ${firstAccess ? "você foi cadastrado como profissional no Aggenda. Crie sua senha para acessar sua agenda." : "recebemos uma solicitação para redefinir sua senha."}</p><p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#24543a;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">${firstAccess ? "Criar senha e acessar" : "Criar nova senha"}</a></p><p style="line-height:1.6;color:#647066">O link expira em 1 hora.</p>`,
    ),
  });
}

export async function sendTeamInvitationEmail(input: {
  email: string;
  inviterName: string;
  organizationName: string;
  invitationUrl: string;
  token: string;
}) {
  const inviter = escapeHtml(input.inviterName);
  const organization = escapeHtml(input.organizationName);
  const url = escapeHtml(input.invitationUrl);
  await sendEmail({
    to: input.email,
    subject: `Convite para participar da ${input.organizationName} no Aggenda`,
    idempotencyKey: `team-invitation-${input.token}`,
    html: emailLayout(
      "Você recebeu um convite",
      `<p style="line-height:1.6"><strong>${inviter}</strong> convidou você para participar da equipe <strong>${organization}</strong> no Aggenda.</p><p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#24543a;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">Aceitar convite</a></p><p style="line-height:1.6;color:#647066">O convite expira em 7 dias.</p>`,
    ),
  });
}

export async function sendElectronicDocumentEmail(input: {
  email: string;
  signerName: string;
  organizationName: string;
  documentTitle: string;
  url: string;
  verificationCode: string;
  documentId: string;
}) {
  const signer = escapeHtml(input.signerName);
  const organization = escapeHtml(input.organizationName);
  const title = escapeHtml(input.documentTitle);
  const url = escapeHtml(input.url);
  const code = escapeHtml(input.verificationCode);
  await sendEmail({
    to: input.email,
    subject: `${input.organizationName} enviou um documento para sua assinatura`,
    idempotencyKey: `electronic-document-${input.documentId}-${input.verificationCode}`,
    html: emailLayout(
      "Documento aguardando sua assinatura",
      `<p style="line-height:1.6">${signer}, a <strong>${organization}</strong> enviou o documento <strong>${title}</strong> para sua leitura e assinatura.</p><p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#24543a;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">Revisar documento</a></p><p style="line-height:1.6">Código de confirmação: <strong style="font-size:20px;letter-spacing:3px">${code}</strong></p><p style="line-height:1.6;color:#647066">O código expira em 30 minutos. O link fica disponível por 7 dias.</p>`,
    ),
  });
}

export async function sendProfessionalDocumentEmail(input: {
  email: string;
  patientName: string;
  organizationName: string;
  professionalName: string;
  documentTitle: string;
  url: string;
  documentId: string;
}) {
  const patient = escapeHtml(input.patientName);
  const organization = escapeHtml(input.organizationName);
  const professional = escapeHtml(input.professionalName);
  const title = escapeHtml(input.documentTitle);
  const url = escapeHtml(input.url);
  await sendEmail({
    to: input.email,
    subject: `${input.organizationName} enviou ${input.documentTitle}`,
    idempotencyKey: `professional-document-${input.documentId}`,
    html: emailLayout(
      "Documento profissional disponível",
      `<p style="line-height:1.6">${patient}, a <strong>${organization}</strong> enviou o documento <strong>${title}</strong>, emitido por <strong>${professional}</strong>.</p><p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#24543a;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">Baixar documento em PDF</a></p><p style="line-height:1.6;color:#647066">O link é pessoal e temporário. Em caso de dúvida sobre o conteúdo, entre em contato com o profissional emissor.</p>`,
    ),
  });
}

export async function sendRetailReceiptEmail(input: {
  email: string;
  organizationName: string;
  receiptUrl: string;
  saleId: string;
}) {
  const organization = escapeHtml(input.organizationName);
  const url = escapeHtml(input.receiptUrl);
  await sendEmail({
    to: input.email,
    subject: `Recibo de compra - ${input.organizationName}`,
    idempotencyKey: `retail-receipt-${input.saleId}-${input.email}`,
    html: emailLayout(
      "Recibo não fiscal",
      `<p style="line-height:1.6">Seu recibo de compra na <strong>${organization}</strong> está disponível.</p><p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#24543a;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">Visualizar recibo</a></p><p style="line-height:1.6;color:#647066">Este documento é um comprovante não fiscal.</p>`,
    ),
  });
}

export async function sendAppointmentManagementEmail(input: {
  email: string;
  clientName: string;
  organizationName: string;
  serviceName: string;
  scheduledFor: string;
  manageUrl: string;
  appointmentId: string;
  version: string;
}) {
  const client = escapeHtml(input.clientName);
  const organization = escapeHtml(input.organizationName);
  const service = escapeHtml(input.serviceName);
  const scheduledFor = escapeHtml(input.scheduledFor);
  const manageUrl = escapeHtml(input.manageUrl);
  await sendEmail({
    to: input.email,
    subject: `Gerencie seu agendamento - ${input.organizationName}`,
    idempotencyKey: `appointment-management-${input.appointmentId}-${input.version}`,
    html: emailLayout(
      "Seu agendamento",
      `<p style="line-height:1.6">${client}, seu agendamento de <strong>${service}</strong> na <strong>${organization}</strong> está marcado para <strong>${scheduledFor}</strong>.</p><p style="margin:24px 0"><a href="${manageUrl}" style="display:inline-block;background:#24543a;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">Confirmar, reagendar ou cancelar</a></p><p style="line-height:1.6;color:#647066">Este link é pessoal. Não o encaminhe para outras pessoas.</p>`,
    ),
  });
}

export async function sendClientPortalAccessEmail(input: {
  email: string;
  clientName: string;
  organizationName: string;
  accessUrl: string;
  code: string;
  requestId: string;
}) {
  const client = escapeHtml(input.clientName);
  const organization = escapeHtml(input.organizationName);
  const accessUrl = escapeHtml(input.accessUrl);
  const code = escapeHtml(input.code);
  await sendEmail({
    to: input.email,
    subject: `Acesse seus agendamentos - ${input.organizationName}`,
    idempotencyKey: `client-portal-${input.requestId}`,
    html: emailLayout(
      "Acesso à área do cliente",
      `<p style="line-height:1.6">${client}, use uma das opções abaixo para acessar seus agendamentos na <strong>${organization}</strong>.</p><p style="margin:24px 0"><a href="${accessUrl}" style="display:inline-block;background:#24543a;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">Entrar com link seguro</a></p><p style="line-height:1.6">Ou informe este código na página: <strong style="font-size:22px;letter-spacing:4px">${code}</strong></p><p style="line-height:1.6;color:#647066">O link e o código expiram em 15 minutos e só podem ser usados uma vez.</p>`,
    ),
  });
}
