import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATABASE_PATH = ':memory:';

// Mock console during tests (optional - can be removed if you want to see logs)
// vi.spyOn(console, 'log').mockImplementation(() => {});
// vi.spyOn(console, 'error').mockImplementation(() => {});

beforeAll(() => {
  // Setup that runs before all tests
});

afterAll(() => {
  // Cleanup that runs after all tests
});
