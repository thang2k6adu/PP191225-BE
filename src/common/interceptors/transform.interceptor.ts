import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const traceId = uuidv4();

    return next.handle().pipe(
      map((data) => {
        // If data is already in ApiResponse format, return as is
        if (data && typeof data === 'object' && 'error' in data) {
          return {
            ...data,
            traceId: data.traceId || traceId,
          };
        }

        // Transform to ApiResponse format
        return {
          error: false,
          code: 0,
          message: 'Success',
          data: data || null,
          traceId,
        };
      }),
    );
  }
}
