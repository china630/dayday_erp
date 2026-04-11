/** Ответ GET /api/hr/employees (пагинация). */

export type HrEmployeesPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function parseHrEmployeesResponse<T = unknown>(json: unknown): HrEmployeesPage<T> {
  if (Array.isArray(json)) {
    return {
      items: json as T[],
      total: json.length,
      page: 1,
      pageSize: json.length || 1,
    };
  }
  const o = json as {
    items?: T[];
    total?: number;
    page?: number;
    pageSize?: number;
  };
  return {
    items: Array.isArray(o.items) ? o.items : [],
    total: typeof o.total === "number" ? o.total : 0,
    page: typeof o.page === "number" ? o.page : 1,
    pageSize: typeof o.pageSize === "number" ? o.pageSize : 20,
  };
}
