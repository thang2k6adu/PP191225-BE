// Setup environment variables for e2e tests
// Load .env file if available (using dotenv)
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Note: DATABASE_URL should be set in your .env file
// Example: DATABASE_URL=postgresql://user:password@localhost:5432/test_db?schema=public

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.PORT = process.env.PORT || '3000';

// Override DATABASE_URL for E2E tests to use local database
// This ensures tests use the local database instead of production/cloud database
if (!process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/nest_boilerplate?schema=public';
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

// JWT Configuration (required)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-e2e-tests';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-key-for-e2e-tests';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Redis Configuration (optional for e2e tests)
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
