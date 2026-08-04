# Integração n8n com Aggenda

O n8n recebe as mensagens do canal de atendimento e usa a API do Aggenda para
consultar disponibilidade e administrar agendamentos.

Todas as requisições devem enviar:

```http
Authorization: Bearer ${N8N_API_KEY}
X-Clinic-Id: ${N8N_CLINIC_ID}
Content-Type: application/json
```

## Endpoints

- `GET /api/n8n/organizations`
- `GET /api/n8n/professionals`
- `GET /api/n8n/services`
- `GET /api/n8n/available-times?date=2026-08-01&serviceId=<uuid>&professionalId=<uuid>`
- `POST /api/n8n/clients/find-or-create`
- `GET /api/n8n/appointments`
- `POST /api/n8n/appointments`
- `PATCH /api/n8n/appointments/<id>`
- `DELETE /api/n8n/appointments/<id>`

Os aliases `/clinics`, `/doctors`, `/procedures` e
`/patients/find-or-create` foram mantidos para facilitar a transição do workflow
do CliniHora.

Para procurar automaticamente a próxima data com horários, envie
`findNext=true`. A busca considera até 60 dias por padrão; `searchDays` permite
alterar a janela entre 0 e 90 dias. A resposta informa `requestedDate`, `date` e
`foundNextDate`, permitindo distinguir a data solicitada da próxima encontrada.

## Criar cliente

```json
{
  "name": "Maria Silva",
  "phone": "71999999999",
  "email": "maria@email.com"
}
```

## Criar agendamento

```json
{
  "clientId": "<uuid>",
  "serviceId": "<uuid>",
  "professionalId": "<uuid>",
  "startsAt": "2026-08-01T14:00:00-03:00",
  "notes": "Criado pelo atendimento no WhatsApp"
}
```
