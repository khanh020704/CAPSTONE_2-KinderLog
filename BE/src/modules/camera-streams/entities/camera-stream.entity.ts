import { Column, Entity, Index, JoinColumn, ManyToOne, ValueTransformer } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import type { ClassEntity } from '../../classes/entities/class.entity';

/**
 * TypeORM's SQL Server driver turns an 'HH:mm' string into `new Date()` with only hours/minutes set,
 * which keeps the current seconds and milliseconds; build the Date here so exactly HH:mm:ss is stored.
 */
const exactTime: ValueTransformer = {
  to: (value?: string | null) => {
    if (typeof value !== 'string') return value;
    const [h, m, sec] = value.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, sec || 0, 0);
    return date;
  },
  from: (value: string | null) => value,
};

/**
 * A classroom feed and the daily window in which parents of that class may watch it.
 * `allowed_weekdays` is an ISO weekday bitmask (bit 1 = Monday … bit 7 = Sunday); 62 = Monday–Friday.
 */
@Entity('camera_streams')
export class CameraStream extends BaseEntity {
  @Index()
  @Column({ name: 'class_id', type: 'uniqueidentifier' })
  classId: string;

  @ManyToOne('ClassEntity', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;

  @Column({ length: 80 })
  name: string;

  /** HLS (.m3u8) or MP4 demo URL. Never returned to parents outside the allowed window. */
  @Column({ name: 'stream_url', length: 500 })
  streamUrl: string;

  /** 'HH:mm:ss' in APP_TIMEZONE */
  @Column({ name: 'allowed_start_time', type: 'time', transformer: exactTime })
  allowedStartTime: string;

  @Column({ name: 'allowed_end_time', type: 'time', transformer: exactTime })
  allowedEndTime: string;

  @Column({ name: 'allowed_weekdays', type: 'smallint', default: 62 })
  allowedWeekdays: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
