import { IsEnum, IsOptional } from 'class-validator';
import { DateRangeQueryDto } from '../../../common/dto/date-range.dto';

export enum ReportType {
  ATTENDANCE = 'attendance',
  /** Journal completion: one row per class and day */
  JOURNALS = 'journals',
  /** Per class over the range: attendance days, published journals, photos, teacher ↔ parent messages */
  ACTIVITY = 'activity',
  /** Current students (no date range) */
  STUDENTS = 'students',
  /** Parent ↔ child links (no date range) */
  PARENTS = 'parents',
  NUTRITION = 'nutrition',
  HEALTH = 'health',
}

export enum ReportFormat {
  PDF = 'pdf',
  XLSX = 'xlsx',
}

export class ExportReportQueryDto extends DateRangeQueryDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat = ReportFormat.XLSX;
}

export interface ReportColumn {
  key: string;
  header: string;
  width?: number;
  /** percent values are stored as 0–100 numbers */
  format?: 'text' | 'number' | 'percent' | 'date';
  /** Codes stored in the rows (e.g. PUBLISHED, MALE) → the text written in the exported file. */
  labels?: Record<string, string>;
}

export interface ReportTable {
  title: string;
  subtitle: string;
  /** the resolved range (defaults applied), for file names */
  from: string;
  to: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
}
