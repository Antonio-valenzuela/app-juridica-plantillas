import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export function apiErrorResponse(input: {
  requestId: string;
  status: number;
  errorCode: string;
  message: string;
  internalError?: unknown;
  headers?: Record<string, string>;
}) {
  if (input.internalError) {
    logger.error(input.errorCode, {
      requestId: input.requestId,
      operation: 'api_error',
      errorCode: input.errorCode,
    });
  }
  return NextResponse.json(
    { errorCode: input.errorCode, message: input.message, requestId: input.requestId },
    { status: input.status, headers: input.headers },
  );
}
