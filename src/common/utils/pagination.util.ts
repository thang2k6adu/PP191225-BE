import { PaginatedList } from '../interfaces/api-response.interface';

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  size: number,
): PaginatedList<T> {
  const totalPages = total === 0 ? 0 : Math.ceil(total / size);

  return {
    items,
    meta: {
      itemCount: items.length,
      totalItems: total,
      itemsPerPage: size,
      totalPages,
      currentPage: page,
    },
  };
}

export function getPaginationOptions(
  page?: number,
  size?: number,
): { skip: number; take: number; page: number; size: number } {
  const currentPage = page && page > 0 ? page : 1;
  const pageSize = size && size > 0 ? Math.min(size, 100) : 10;
  const skip = (currentPage - 1) * pageSize;

  return {
    skip,
    take: pageSize,
    page: currentPage,
    size: pageSize,
  };
}
