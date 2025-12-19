export interface ApiResponse<T = any> {
  error: boolean;
  code: number;
  message: string;
  data: T | null;
  traceId?: string;
}

export interface PaginationMeta {
  itemCount: number;
  totalItems: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiredAt: string;
}
