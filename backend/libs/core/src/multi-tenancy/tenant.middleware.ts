import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CurrentTenant } from './current-tenant';

export const TENANT_HEADER = 'x-tenant-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly currentTenant: CurrentTenant) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const raw = req.header(TENANT_HEADER)?.trim();
    let id: string | null = null;

    if (raw && UUID_RE.test(raw)) {
      id = raw;
    }

    this.currentTenant.run({ id }, () => {
      next();
    });
  }
}
