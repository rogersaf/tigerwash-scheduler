import React, { createContext, useContext, useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, saveToken, clearToken } from './api';
import Login from './pages/Login';
import Layout from './components/Layout';
import AvailabilityPage from './pages/AvailabilityPage';
import EmployeeSchedulePage from './pages/EmployeeSchedulePage';
import AccountPage from './pages/AccountPage';
import ManagerDashboard from './pages/ManagerDashboard';
import SchedulePage from './pages/SchedulePage';
import EmployeesPage from './pages/EmployeesPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';

export const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tw_token');
    if (!token) { setLoading(false); return; }
    api.me()
      .then((d) => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  function login(token, userData) {
    saveToken(token);
    setUser(userData);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text-muted)' }}>
      Loading…
    </div>
  );

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/*" element={user ? <AuthedRoutes /> : <Navigate to="/login" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}

function AuthedRoutes() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';

  return (
    <Layout>
      <Routes>
        {isManager ? (
          <>
            <Route path="/" element={<ManagerDashboard />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<AvailabilityPage />} />
            <Route path="/schedule" element={<EmployeeSchedulePage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </Layout>
  );
}
