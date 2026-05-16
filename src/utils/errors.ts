// src/utils/errors.ts

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Capturar stack trace (mejor para debugging)
    Error.captureStackTrace(this, this.constructor);
  }
}