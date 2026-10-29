import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import type { GlobalRole, Me, Membership, Role } from '@genon/shared';
import { auth } from '../lib/firebase';
import { api, errorMessage } from '../lib/api';

interface AuthState {
  user: User | null;
  /** Rol global: superadmin, equipo Gen.iality o null (usuario de clínica) */
  role: GlobalRole | null;
  memberships: Membership[];
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
  /** Vuelve a leer accesos y rol (tras un cambio hecho por un superadmin) */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, 'logout' | 'refresh'>>({
    user: null,
    role: null,
    memberships: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async (user: User | null, forceToken = false) => {
    if (!user) {
      setState({ user: null, role: null, memberships: [], loading: false, error: null });
      return;
    }
    try {
      if (forceToken) await user.getIdToken(true);
      const me = (await api.get<Me>('/me')).data;
      setState({ user, role: me.role, memberships: me.memberships, loading: false, error: null });
    } catch (e) {
      setState({ user, role: null, memberships: [], loading: false, error: errorMessage(e) });
    }
  }, []);

  useEffect(() => onIdTokenChanged(auth, (u) => load(u)), [load]);

  return (
    <AuthContext.Provider
      value={{ ...state, logout: () => signOut(auth), refresh: () => load(auth.currentUser, true) }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}

/** Rol efectivo en una organización (el superadmin entra a todas). */
export function useOrgRole(orgId: string | null | undefined): Role | null {
  const { role, memberships } = useAuth();
  if (role === 'superadmin') return 'superadmin';
  if (!orgId) return null;
  return memberships.find((m) => m.org_id === orgId)?.role ?? null;
}
