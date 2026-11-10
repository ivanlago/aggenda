export class ProviderRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
