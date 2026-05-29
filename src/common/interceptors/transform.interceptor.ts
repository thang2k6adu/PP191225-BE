import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse, PaginatedList } from '../interfaces/api-response.interface';

function isPaginatedList(data: unknown): data is PaginatedList<unknown> {
  return (
    !!data &&
    typeof data === 'object' &&
    Array.isArray((data as PaginatedList<unknown>).items) &&
    !!(data as PaginatedList<unknown>).meta &&
    typeof (data as PaginatedList<unknown>).meta === 'object'
  );
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const traceId = uuidv4();

    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'error' in data) {
          return {
            ...data,
            traceId: data.traceId || traceId,
          };
        }

        if (isPaginatedList(data)) {
          return {
            error: false,
            code: 0,
            message: 'Success',
            data: data.items as T,
            meta: data.meta,
            traceId,
          };
        }

        return {
          error: false,
          code: 0,
          message: 'Success',
          data: data ?? null,
          traceId,
        };
      }),
    );
  }
}
