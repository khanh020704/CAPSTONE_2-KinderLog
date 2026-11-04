import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** One error shape for the FE: { statusCode, message, error, path, timestamp }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ url: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? message);
    } else if (exception instanceof QueryFailedError) {
      // SQL Server error numbers: 2627 / 2601 = duplicate key, 547 = foreign key (or CHECK) conflict
      const code = (exception as QueryFailedError & { driverError?: { number?: number } }).driverError
        ?.number;
      if (code === 2627 || code === 2601) {
        status = HttpStatus.CONFLICT;
        message = 'A record with the same unique value already exists';
      } else if (code === 547) {
        status = HttpStatus.CONFLICT;
        message = 'This record is referenced by other data and cannot be changed this way';
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      statusCode: status,
      message,
      error: HttpStatus[status],
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
