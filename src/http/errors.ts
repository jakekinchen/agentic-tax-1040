export class PublicError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "bad_request"
  ) {
    super(message);
  }
}

export function publicMessage(error: unknown): { statusCode: number; body: { error: string; code: string } } {
  if (error instanceof PublicError) {
    return { statusCode: error.statusCode, body: { error: error.message, code: error.code } };
  }
  return { statusCode: 500, body: { error: "Something went wrong. Please reset and try again.", code: "internal_error" } };
}
