type AsaasErrorResponse = {
  errors?: Array<{ code?: string; description?: string }>;
};

type AsaasRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

function asaasBaseUrl() {
  return process.env.ASAAS_ENVIRONMENT === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

export function isAsaasConfigured() {
  return Boolean(process.env.ASAAS_API_KEY);
}

export async function asaasRequest<T>(
  path: string,
  options: AsaasRequestOptions = {}
) {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurada.");

  const response = await fetch(`${asaasBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      access_token: apiKey,
      "content-type": "application/json",
      "user-agent": "Aggenda/1.0",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const errorData =
      typeof data === "object" && data !== null
        ? (data as AsaasErrorResponse)
        : null;
    const descriptions =
      errorData?.errors
        ?.map((error) => error.description)
        .filter((description): description is string => Boolean(description)) ??
      [];
    const message =
      descriptions.length
        ? descriptions.join(" ")
        : `Erro ${response.status} ao comunicar com o Asaas.`;
    throw new Error(message);
  }

  return data as T;
}

export function asaasCheckoutLink(checkout: {
  id: string;
  link?: string | null;
}) {
  if (checkout.link) return checkout.link;
  const host =
    process.env.ASAAS_ENVIRONMENT === "production"
      ? "https://www.asaas.com"
      : "https://sandbox.asaas.com";
  return `${host}/checkoutSession/show/${checkout.id}`;
}
