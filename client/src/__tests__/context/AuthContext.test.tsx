import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../../context/AuthContext';

// Mock the API module
vi.mock('../../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from '../../lib/api';

// Test component that uses the auth context
function TestComponent() {
  const { user, token, login, logout, isLoading } = useAuth();

  if (isLoading) {
    return <div data-testid="loading">Loading...</div>;
  }

  return (
    <div>
      <div data-testid="user">{user ? user.name : 'No user'}</div>
      <div data-testid="token">{token || 'No token'}</div>
      <button onClick={() => login('test@test.com', 'password')} data-testid="login-btn">
        Login
      </button>
      <button onClick={logout} data-testid="logout-btn">
        Logout
      </button>
    </div>
  );
}

describe('AuthContext', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@test.com',
    name: 'Test User',
    role: 'admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside provider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleError.mockRestore();
    });
  });

  describe('AuthProvider', () => {
    it('should initialize with no user when no token in localStorage', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('No token'));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('user')).toHaveTextContent('No user');
      expect(screen.getByTestId('token')).toHaveTextContent('No token');
    });

    it('should restore user from localStorage token', async () => {
      localStorage.setItem('token', 'saved-token');
      vi.mocked(api.get).mockResolvedValue({
        data: { data: mockUser },
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('user')).toHaveTextContent('Test User');
      expect(screen.getByTestId('token')).toHaveTextContent('saved-token');
    });

    it('should clear token when API returns error', async () => {
      localStorage.setItem('token', 'invalid-token');
      vi.mocked(api.get).mockRejectedValue(new Error('Invalid token'));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('user')).toHaveTextContent('No user');
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('should login successfully', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('No token'));
      vi.mocked(api.post).mockResolvedValue({
        data: {
          data: {
            token: 'new-token',
            user: mockUser,
          },
        },
      });

      const user = userEvent.setup();

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      await act(async () => {
        await user.click(screen.getByTestId('login-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('Test User');
      });

      expect(screen.getByTestId('token')).toHaveTextContent('new-token');
      expect(localStorage.getItem('token')).toBe('new-token');
    });

    it('should logout successfully', async () => {
      localStorage.setItem('token', 'saved-token');
      vi.mocked(api.get).mockResolvedValue({
        data: { data: mockUser },
      });

      const user = userEvent.setup();

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('Test User');
      });

      await act(async () => {
        await user.click(screen.getByTestId('logout-btn'));
      });

      expect(screen.getByTestId('user')).toHaveTextContent('No user');
      expect(screen.getByTestId('token')).toHaveTextContent('No token');
      expect(localStorage.getItem('token')).toBeNull();
    });
  });
});
