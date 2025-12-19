import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHE_KEY_METADATA } from '../decorators/cache-key.decorator';
import { CACHE_TTL_METADATA } from '../decorators/cache-ttl.decorator';

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const { method } = request;

    // Only cache GET requests
    if (method !== 'GET') {
      return next.handle();
    }

    const cacheKey = this.getCacheKey(context);
    const ttl = this.getTtl(context);

    if (!cacheKey) {
      return next.handle();
    }

    try {
      const cachedData = await this.cacheManager.get(cacheKey);
      if (cachedData) {
        return of(cachedData);
      }

      return next.handle().pipe(
        tap(async (data) => {
          if (data) {
            await this.cacheManager.set(cacheKey, data, ttl || 60000);
          }
        }),
      );
    } catch (error) {
      return next.handle();
    }
  }

  private getCacheKey(context: ExecutionContext): string | undefined {
    const cacheKey = this.reflector.getAllAndOverride<string>(CACHE_KEY_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (cacheKey) {
      const request = context.switchToHttp().getRequest();
      const user = request.user;
      return user ? `${cacheKey}:${user.id}` : cacheKey;
    }

    return undefined;
  }

  private getTtl(context: ExecutionContext): number {
    return (
      this.reflector.getAllAndOverride<number>(CACHE_TTL_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) || 60000
    );
  }
}
