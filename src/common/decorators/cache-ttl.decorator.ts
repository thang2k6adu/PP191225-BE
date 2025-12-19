import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_METADATA = 'cache:ttl';
export const CacheTTL = (ttl: number) => SetMetadata(CACHE_TTL_METADATA, ttl);
