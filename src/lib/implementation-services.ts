export const implementationModes = ["guided_free", "assisted"] as const;
export type ImplementationMode = (typeof implementationModes)[number];

export const fiscalSetupModes = ["none", "self_service", "assisted"] as const;
export type FiscalSetupMode = (typeof fiscalSetupModes)[number];

export const IMPLEMENTATION_ASSISTED_PRICE_IN_CENTS = 24_900;
export const FISCAL_SETUP_ASSISTED_PRICE_IN_CENTS = 29_900;

export function isImplementationMode(value: string): value is ImplementationMode {
  return implementationModes.includes(value as ImplementationMode);
}

export function isFiscalSetupMode(value: string): value is FiscalSetupMode {
  return fiscalSetupModes.includes(value as FiscalSetupMode);
}

export function formatImplementationPrice(valueInCents: number) {
  return (valueInCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
