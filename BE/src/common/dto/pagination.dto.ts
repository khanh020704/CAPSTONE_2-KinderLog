import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** ?page=1&limit=20 (limit ≤ 100). Lists that use it answer { items, total, page, limit, pages }. */
export class PageQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const toPage = <T>(items: T[], total: number, q: PageQueryDto): Page<T> => ({
  items,
  total,
  page: q.page,
  limit: q.limit,
  pages: Math.ceil(total / q.limit),
});

/** skip/take for TypeORM (SQL Server: OFFSET … FETCH, needs an ORDER BY). */
export const pageWindow = (q: PageQueryDto) => ({ skip: (q.page - 1) * q.limit, take: q.limit });
