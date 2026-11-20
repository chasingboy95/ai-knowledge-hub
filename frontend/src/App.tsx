import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { AcceptInvitePage } from './pages/AcceptInvitePage';

const Dashboard = React.lazy(() => import('./pages/Dashboard').then(({ Dashboard }) => ({ default: Dashboard })));
const KnowledgeBases = React.lazy(() => import('./pages/KnowledgeBases').then(({ KnowledgeBases }) => ({ default: KnowledgeBases })));
const KnowledgeBaseDetail = React.lazy(() => import('./pages/KnowledgeBaseDetail').then(({ KnowledgeBaseDetail }) => ({ default: KnowledgeBaseDetail })));
const Chat = React.lazy(() => import('./pages/Chat').then(({ Chat }) => ({ default: Chat })));
const Members = React.lazy(() => import('./pages/Members').then(({ Members }) => ({ default: Members })));
const AuditLogs = React.lazy(() => import('./pages/AuditLogs').then(({ AuditLogs }) => ({ default: AuditLogs })));

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isLoading, initializationFailed, retryInitialization, logout } = useAuth();

  if (isLoading) {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center gap-3 bg-neutral-50 px-5 text-sm text-neutral-700">
        <span className="size-5 rounded-full border-2 border-indigo-600 border-t-transparent motion-safe:animate-spin" aria-hidden="true" />
        正在连接工作区…
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (initializationFailed) {
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-50 p-5">
        <section className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6">
          <h1 role="alert" className="text-lg font-semibold text-neutral-900">暂时无法连接工作区。</h1>
          <p className="text-sm text-neutral-600">请检查网络连接，再试一次。</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={retryInitialization} className="rounded-lg bg-indigo-700 px-4 py-2 text-white hover:bg-indigo-800">重试</button>
            <button type="button" onClick={logout} className="rounded-lg border border-neutral-200 px-4 py-2 text-neutral-800 hover:bg-neutral-100">返回登录</button>
          </div>
        </section>
      </div>
    );
  }

  return <>{children}</>;
};

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/invite" element={<AcceptInvitePage />} />
          <Route path="/invite/:token" element={<AcceptInvitePage />} />

          {/* Protected Application Console Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/chat" replace />} />
            <Route path="overview" element={<Dashboard />} />
            <Route path="knowledge-bases" element={<KnowledgeBases />} />
            <Route path="knowledge-bases/:id" element={<KnowledgeBaseDetail />} />
            <Route path="chat" element={<Chat />} />
            <Route path="members" element={<Members />} />
            <Route path="audit" element={<AuditLogs />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
