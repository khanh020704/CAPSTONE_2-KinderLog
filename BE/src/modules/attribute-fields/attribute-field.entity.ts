import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum AttributeFieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
}

/** The record an attribute field adds information to. */
export enum AttributeTarget {
  STUDENT = 'STUDENT',
  PARENT = 'PARENT',
  TEACHER = 'TEACHER',
  CLASS = 'CLASS',
}

export enum AttributeFieldStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
}

/**
 * A system attribute field (User Story 2.2): an extra piece of structured information the platform may collect,
 * e.g. "Blood type" on a student. A LOCKED field is hidden from new entries; nothing stored is removed.
 */
@Entity('attribute_fields')
@Index(['target', 'name'], { unique: true })
export class AttributeField extends BaseEntity {
  @Column({ type: 'nvarchar', length: 60 })
  name: string;

  @Column({ type: 'simple-enum', enum: AttributeFieldType })
  type: AttributeFieldType;

  @Column({ type: 'simple-enum', enum: AttributeTarget })
  target: AttributeTarget;

  @Column({ type: 'bit', default: false })
  required: boolean;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'simple-enum', enum: AttributeFieldStatus, default: AttributeFieldStatus.ACTIVE })
  status: AttributeFieldStatus;
}
