import { Entity } from '@pugying/core/domain/entity.base';
import { AuditedEntity, SoftDeleteAuditedEntity } from './audited.entity';

class Invoice extends AuditedEntity {
  amount: number;
}

class Document extends SoftDeleteAuditedEntity {
  title: string;
}

describe('entity base classes', () => {
  describe('AuditedEntity', () => {
    it('is an Entity carrying id and audit timestamps', () => {
      const invoice = new Invoice();
      invoice.id = '550e8400-e29b-41d4-a716-446655440000';
      invoice.createdAt = new Date('2026-01-01T00:00:00Z');
      invoice.updatedAt = new Date('2026-01-02T00:00:00Z');
      invoice.amount = 100;

      expect(invoice).toBeInstanceOf(Entity);
      expect(invoice).toBeInstanceOf(AuditedEntity);
      expect(invoice.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(invoice.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(invoice.updatedAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    });
  });

  describe('SoftDeleteAuditedEntity', () => {
    it('extends AuditedEntity', () => {
      const document = new Document();

      expect(document).toBeInstanceOf(AuditedEntity);
      expect(document).toBeInstanceOf(SoftDeleteAuditedEntity);
    });

    it('is not deleted by default', () => {
      const document = new Document();

      expect(document.deletedAt).toBeUndefined();
    });

    it('marks deletion through deletedAt and supports restore via null', () => {
      const document = new Document();

      document.deletedAt = new Date('2026-03-01T00:00:00Z');
      expect(document.deletedAt).toEqual(new Date('2026-03-01T00:00:00Z'));

      document.deletedAt = null;
      expect(document.deletedAt).toBeNull();
    });
  });
});
