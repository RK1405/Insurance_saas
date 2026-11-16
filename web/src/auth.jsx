import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.js';

const AuthContext = createContext(null);

export function applyTheme(pref) {
  const dark = pref === 'dark' || (pref !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, org: null });
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/me');
      setState({ loading: false, user: me.user, org: me.org });
    } catch {
      setState({ loading: false, user: null, org: null });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { applyTheme(state.user?.preferences?.theme || 'system'); }, [state.user]);
  useEffect(() => {
    const onUnauth = () => setState({ loading: false, user: null, org: null });
    window.addEventListener('hs:unauthorized', onUnauth);
    return () => window.removeEventListener('hs:unauthorized', onUnauth);
  }, []);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    navigate('/', { replace: true });
    setState({ loading: false, user: null, org: null });
  };
  const setUser = (user) => setState((s) => ({ ...s, user }));

  return <AuthContext.Provider value={{ ...state, refresh, logout, setUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
