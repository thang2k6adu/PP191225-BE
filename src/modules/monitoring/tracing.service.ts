import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);

  generateTraceId(): string {
    return uuidv4();
  }

  logTrace(traceId: string, operation: string, data: any) {
    this.logger.debug(`[${traceId}] ${operation}: ${JSON.stringify(data)}`);
  }

  logSpan(traceId: string, spanId: string, operation: string, duration: number) {
    this.logger.debug(`[${traceId}][${spanId}] ${operation} completed in ${duration}ms`);
  }
}
