import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class PerUserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const user = (req as Request).user;
    if (user && (user as any).id) {
      return `user:${(user as any).id}`;
    }
    return (req as Request).ip || 'unknown';
  }
}
