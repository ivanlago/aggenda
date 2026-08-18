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
  await sendEmail({
    to: input.email,
    subject: "Redefina sua senha do Aggenda",
    idempotencyKey: `password-reset-${input.token}`,
    html: emailLayout(
      "Redefinição de senha",
      `<p style="line-height:1.6">${name}, recebemos uma solicitação para redefinir sua senha.</p><p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#24543a;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">Criar nova senha</a></p><p style="line-height:1.6;color:#647066">O link expira em 1 hora.</p>`,
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
