import { IsEnum, IsOptional } from 'class-validator';
import { DateRangeQueryDto } from '../../../common/dto/date-range.dto';

export enum ReportType {
  ATTENDANCE = 'attendance',
  NUTRITION = 'nutrition',
  JOURNALS = 'journals',
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
