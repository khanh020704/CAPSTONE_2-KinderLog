/** SQL Server expressions used by the aggregate queries (reports, journal history). */

/** Number of rows matching `condition` inside a GROUP BY (SQL Server has no `COUNT(*) FILTER (WHERE …)`). */
export const countWhere = (condition: string) => `SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END)`;

/** A date column as 'YYYY-MM-DD' (style 23 = ISO 8601 date). */
export const isoDateSql = (column: string) => `CONVERT(char(10), ${column}, 23)`;

/** AVG over an integer expression without SQL Server's integer truncation. */
export const avgSql = (expression: string) => `AVG(CAST(${expression} AS float))`;

/**
 * Accent- and case-insensitive LIKE for Vietnamese names: "huong" finds "Hương", "duc" finds "Đức".
 * The Latin1 *_CI_AI collation ignores diacritics; "đ" is a separate letter, so it is mapped to "d" first.
 * Pass the search term through `foldSearch` so both sides are compared without accents.
 */
export const likeFolded = (column: string, param: string) =>
  `REPLACE(${column} COLLATE Latin1_General_100_CI_AI, N'đ', N'd') LIKE :${param} COLLATE Latin1_General_100_CI_AI`;

/** Search term without diacritics, wrapped for LIKE. */
export const foldSearch = (term: string) =>
  `%${term.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')}%`;
