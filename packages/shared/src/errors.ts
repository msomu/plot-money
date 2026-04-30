export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'SUBSCRIPTION_INACTIVE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = statusForCode(code);
  }

  toJSON(): { error: string; code: ErrorCode } {
    return { error: this.message, code: this.code };
  }
}

function statusForCode(code: ErrorCode): number {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'SUBSCRIPTION_INACTIVE':
      return 402;
    case 'NOT_FOUND':
      return 404;
    case 'INTERNAL':
      return 500;
  }
}
