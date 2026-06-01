import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { shouldSkipRequestLogging } from '@/common/utils/skip-request-logging.util';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    if (shouldSkipRequestLogging(req.originalUrl)) {
      next();
      return;
    }

    const { method, originalUrl, ip } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      const duration = Date.now() - startTime;

      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${contentLength} - ${ip} - ${duration}ms`,
      );
    });

    next();
  }
}
