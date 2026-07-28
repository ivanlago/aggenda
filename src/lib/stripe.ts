import Stripe from "stripe";

let client: Stripe | undefined;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY não configurada.");
  }
  client ??= new Stripe(secretKey);
  return client;
}
