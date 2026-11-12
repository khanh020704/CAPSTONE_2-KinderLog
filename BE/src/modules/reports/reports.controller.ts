import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ExportReportQueryDto, ReportFormat } from './dto/report.dto';
import { toExcel } from './exporters/excel.exporter';
import { toPdf } from './exporters/pdf.exporter';
import { ReportsService } from './reports.service';

@ApiTags('Reports & Dashboard')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Principal dashboard: KPIs, today's classes, attendance & submission trend, nutrition, health alerts. */
  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Query() q: DateRangeQueryDto) {
    return this.reports.principalDashboard(user, q);
  }

  /** System Admin: platform overview. */
  @Roles(UserRole.SYSTEM_ADMIN)
  @Get('admin-dashboard')
  adminDashboard() {
    return this.reports.adminDashboard();
  }

  /** Report rows as JSON (the FE renders the same table it can export). */
  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Get('table')
  table(@CurrentUser() user: AuthUser, @Query() q: ExportReportQueryDto) {
    return this.reports.buildReport(user, q.type, q);
  }

  /** Download: ?type=attendance|nutrition|journals|health&format=pdf|xlsx&from=&to=&classId= */
  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Get('export')
  @ApiProduces('application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async export(@CurrentUser() user: AuthUser, @Query() q: ExportReportQueryDto, @Res() res: Response) {
    const report = await this.reports.buildReport(user, q.type, q);
    const pdf = q.format === ReportFormat.PDF;
    const body = pdf ? await toPdf(report) : await toExcel(report);
    const name = `kinderlog-${q.type}-${report.from}_${report.to}.${pdf ? 'pdf' : 'xlsx'}`;
    res
      .status(200)
      .set({
        'Content-Type': pdf
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': body.length,
      })
      .end(body);
  }
}
