import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '../../modules/monitoring/metrics.service';
import { shouldSkipRequestLogging } from '@/common/utils/skip-request-logging.util';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, route, url } = request;

    if (shouldSkipRequestLogging(route?.path || url)) {
      return next.handle();
    }
    const routePath = route?.path || request.url;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (Date.now() - startTime) / 1000;
          const response = context.switchToHttp().getResponse();
          this.metricsService.recordHttpRequest(method, routePath, response.statusCode, duration);
        },
        error: (error) => {
          const duration = (Date.now() - startTime) / 1000;
          this.metricsService.recordHttpError(method, routePath, error.constructor.name);
          this.metricsService.recordHttpRequest(method, routePath, error.status || 500, duration);
        },
      }),
    );
  }
}
