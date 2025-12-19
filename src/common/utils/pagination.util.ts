import { PaginatedResponse } from '../interfaces/api-response.interface';

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    items,
    meta: {
      itemCount: items.length,
      totalItems: total,
      itemsPerPage: limit,
      totalPages,
      currentPage: page,
    },
  };
}

export function getPaginationOptions(
  page?: number,
  limit?: number,
): { skip: number; take: number; page: number; limit: number } {
  const currentPage = page && page > 0 ? page : 1;
  const pageLimit = limit && limit > 0 ? limit : 10;
  const skip = (currentPage - 1) * pageLimit;

  return {
    skip,
    take: pageLimit,
    page: currentPage,
    limit: pageLimit,
  };
}
