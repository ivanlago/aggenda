# Aggenda — operação dos clientes-piloto

## Checklist de implantação

1. Contrato e responsável pelo tratamento dos dados definidos.
2. Assinatura ou período de teste ativado.
3. Empresa, terminologia e fuso horário revisados.
4. Equipe, profissionais, serviços e preços cadastrados.
5. Jornada semanal, intervalos, férias e bloqueios configurados.
6. Página pública habilitada e testada em celular.
7. WhatsApp e n8n homologados quando fizerem parte da oferta.
8. Um agendamento completo criado, confirmado, reagendado e cancelado.
9. Responsável do cliente treinado.
10. Retornos agendados para 24 horas, 7 dias e 30 dias.

## Suporte inicial

- Canal oficial: definir antes do primeiro piloto.
- Horário sugerido: dias úteis, das 8h às 18h, horário de Brasília.
- Incidente crítico: sistema indisponível ou risco de exposição de dados.
- Incidente alto: agendamento ou integração principal sem funcionar.
- Incidente normal: dúvida, configuração ou falha sem bloqueio da operação.
- Solicitação: melhoria ou mudança de escopo, sem SLA de incidente.

Metas iniciais de resposta: 1 hora útil para crítico, 4 horas úteis para alto e
1 dia útil para normal. São hipóteses e devem ser ajustadas após medir o custo
real dos pilotos.

## Rotina operacional

- verificar diariamente falhas de webhooks e workflows;
- acompanhar semanalmente ativação, agendamentos, cancelamentos e ausências;
- testar restauração de backup mensalmente;
- documentar incidente, causa, impacto, correção e prevenção;
- nunca registrar chaves, tokens ou conteúdo sensível nos chamados;
- transformar dúvidas recorrentes em documentação ou configuração do produto.

## Métrica de ativação

Uma organização é considerada ativada quando possui profissional, serviço,
disponibilidade publicada e ao menos um agendamento concluído pelo fluxo real.
