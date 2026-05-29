export interface PaginationMeta {
  itemCount: number;
  totalItems: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
}

export interface ApiResponse<T = unknown> {
  error: boolean;
  code: number;
  message: string;
  data: T | null;
  meta?: PaginationMeta | null;
  traceId?: string;
}

/** Internal list shape returned by services; unwrapped by `TransformInterceptor`. */
export interface PaginatedList<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    contactEmail?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    avatar?: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export interface FirebaseLoginResponse {
  user: {
    id: string;
    email: string;
    contactEmail?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    avatar?: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
}
