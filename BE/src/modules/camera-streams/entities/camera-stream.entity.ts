import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import type { ClassEntity } from '../../classes/entities/class.entity';

/**
 * A classroom feed and the daily window in which parents of that class may watch it.
 * `allowed_weekdays` is an ISO weekday bitmask (bit 1 = Monday … bit 7 = Sunday); 62 = Monday–Friday.
 */
@Entity('camera_streams')
export class CameraStream extends BaseEntity {
  @Index()
  @Column({ name: 'class_id', type: 'uuid' })
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
  @Column({ name: 'allowed_start_time', type: 'time' })
  allowedStartTime: string;

  @Column({ name: 'allowed_end_time', type: 'time' })
  allowedEndTime: string;

  @Column({ name: 'allowed_weekdays', type: 'smallint', default: 62 })
  allowedWeekdays: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
