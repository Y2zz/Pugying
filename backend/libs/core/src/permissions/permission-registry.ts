import { Injectable } from '@nestjs/common';

@Injectable()
export class PermissionRegistry {
  private readonly permissions = new Set<string>();

  register(...names: string[]): void {
    for (const name of names) {
      this.permissions.add(name);
    }
  }

  getAll(): string[] {
    return Array.from(this.permissions).sort();
  }

  has(name: string): boolean {
    return this.permissions.has(name);
  }
}
