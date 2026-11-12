import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Platform-wide settings of the System Settings page, as one JSON document under the key "global". */
@Entity('system_settings')
export class SystemSetting {
  @PrimaryColumn({ type: 'nvarchar', length: 50 })
  key: string;

  @Column({ type: 'nvarchar', length: 'MAX' })
  value: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime2' })
  updatedAt: Date;
}
