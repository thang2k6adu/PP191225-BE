import { Injectable } from '@nestjs/common';
import * as promClient from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly httpRequestDuration: promClient.Histogram;
  private readonly httpRequestTotal: promClient.Counter;
  private readonly httpRequestErrors: promClient.Counter;
  private readonly databaseQueryDuration: promClient.Histogram;

  constructor() {
    // Create default metrics
    promClient.collectDefaultMetrics();

    // HTTP metrics
    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5],
    });

    this.httpRequestTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    this.httpRequestErrors = new promClient.Counter({
      name: 'http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'route', 'error_type'],
    });

    // Database metrics
    this.databaseQueryDuration = new promClient.Histogram({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1],
    });
  }

  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration,
    );
    this.httpRequestTotal.inc({ method, route, status_code: statusCode.toString() });
  }

  recordHttpError(method: string, route: string, errorType: string) {
    this.httpRequestErrors.inc({ method, route, error_type: errorType });
  }

  recordDatabaseQuery(operation: string, table: string, duration: number) {
    this.databaseQueryDuration.observe({ operation, table }, duration);
  }

  async getMetrics(): Promise<string> {
    return promClient.register.metrics();
  }
}
