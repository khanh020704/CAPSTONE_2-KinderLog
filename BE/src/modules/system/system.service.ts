import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants, promises as fs } from 'fs';
import { cpus, freemem, totalmem } from 'os';
import { join, resolve } from 'path';
import { DataSource } from 'typeorm';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Measured figures for the System Monitoring page (the server the API runs on, its database and upload folder). */
@Injectable()
export class SystemService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  async metrics() {
    const uploadDir = resolve(this.config.get<string>('uploadDir')!);
    const [cpuPercent, disk, photos, writable, dbBytes] = await Promise.all([
      this.cpuPercent(),
      fs.statfs(uploadDir).catch(() => null),
      folderSize(join(uploadDir, 'photos')),
      fs.access(uploadDir, constants.W_OK).then(
        () => true,
        () => false,
      ),
      this.databaseBytes(),
    ]);
    return {
      cpu: { percent: cpuPercent, cores: cpus().length },
      memory: { usedBytes: totalmem() - freemem(), totalBytes: totalmem() },
      disk: disk && {
        usedBytes: (disk.blocks - disk.bfree) * disk.bsize,
        totalBytes: disk.blocks * disk.bsize,
      },
      uploads: { writable, photoFiles: photos.files, photoBytes: photos.bytes },
      database: { sizeBytes: dbBytes },
      time: new Date().toISOString(),
    };
  }

  /** Busy share of all cores over a short sample (os.loadavg() is always 0 on Windows). */
  private async cpuPercent(sampleMs = 250) {
    const snap = () =>
      cpus().reduce(
        (a, c) => {
          const t = c.times;
          a.idle += t.idle;
          a.total += t.user + t.nice + t.sys + t.irq + t.idle;
          return a;
        },
        { idle: 0, total: 0 },
      );
    const a = snap();
    await sleep(sampleMs);
    const b = snap();
    const total = b.total - a.total;
    return total > 0 ? Math.round((1 - (b.idle - a.idle) / total) * 1000) / 10 : 0;
  }

  /** Data + log files of the current SQL Server database. */
  private async databaseBytes(): Promise<number | null> {
    try {
      const [row] = await this.db.query<{ bytes: string | number }[]>(
        'SELECT SUM(CAST(size AS bigint)) * 8192 AS bytes FROM sys.database_files',
      );
      return Number(row.bytes);
    } catch {
      return null;
    }
  }
}

async function folderSize(dir: string): Promise<{ files: number; bytes: number }> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  let files = 0;
  let bytes = 0;
  for (const e of entries) {
    if (!e.isFile()) continue;
    files += 1;
    bytes += (await fs.stat(join(dir, e.name))).size;
  }
  return { files, bytes };
}
