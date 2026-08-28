import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const secret = process.env.OUTBOX_TRIGGER_SECRET ?? process.env.AGGENDA_INTERNAL_API_KEY;
if (!secret) throw new Error("Segredo de acionamento não encontrado no ambiente local.");

const response = await fetch("http://eqqodtoxm3of0terw1qmab2e.129.213.93.43.sslip.io/scheduled", {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
});

console.log(JSON.stringify({ status: response.status, body: await response.text() }));
