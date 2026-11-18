import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  ApiError,
  login as apiLogin,
  refreshSession,
  registerCustomer,
  registerPartner,
  revokeSession,
} from './api';
import type { AuthResponse, UserProfile } from './types';

interface AuthContextValue {
  user: UserProfile | null;
  accessToken: string | null;
  ready: boolean;
  sessionWarning: string | null;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signUpCustomer: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  signUpPartner: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
    companyName: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accessExpiresAt, setAccessExpiresAt] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);

  const acceptSession = useCallback((response: AuthResponse) => {
    setUser(response.user);
    setAccessToken(response.tokens.accessToken);
    setAccessExpiresAt(Date.now() + response.tokens.expiresIn * 1000);
    setSessionWarning(null);
  }, []);

  useEffect(() => {
    let active = true;
    refreshSession()
      .then((response) => {
        if (active) acceptSession(response);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (!(error instanceof ApiError && error.status === 401)) {
          setSessionWarning(
            'We could not reconnect to your account. You can still browse the site.'
          );
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, [acceptSession]);

  useEffect(() => {
    if (!accessExpiresAt) return;
    const refreshDelay = Math.max(0, accessExpiresAt - Date.now() - 30_000);
    const timeout = window.setTimeout(() => {
      refreshSession()
        .then(acceptSession)
        .catch(() => {
          setUser(null);
          setAccessToken(null);
          setAccessExpiresAt(null);
          setSessionWarning('Your session expired. Sign in again to continue.');
        });
    }, refreshDelay);
    return () => window.clearTimeout(timeout);
  }, [accessExpiresAt, acceptSession]);

  const signIn = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      acceptSession(await apiLogin(email, password, rememberMe));
    },
    [acceptSession]
  );

  const signUpCustomer = useCallback(
    async (input: { email: string; password: string; firstName: string; lastName: string }) => {
      const response = await registerCustomer({ ...input, acceptTerms: true });
      acceptSession(response);
    },
    [acceptSession]
  );

  const signUpPartner = useCallback(
    async (input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone: string;
      companyName: string;
    }) => {
      const response = await registerPartner({ ...input, acceptTerms: true });
      acceptSession(response);
    },
    [acceptSession]
  );

  const signOut = useCallback(async () => {
    try {
      if (accessToken) await revokeSession(accessToken);
    } catch (error) {
      setSessionWarning(
        'You have been signed out on this device, but the server could not confirm session revocation.'
      );
      throw error;
    } finally {
      setUser(null);
      setAccessToken(null);
      setAccessExpiresAt(null);
    }
  }, [accessToken]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      ready,
      sessionWarning,
      signIn,
      signUpCustomer,
      signUpPartner,
      signOut,
    }),
    [user, accessToken, ready, sessionWarning, signIn, signUpCustomer, signUpPartner, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
