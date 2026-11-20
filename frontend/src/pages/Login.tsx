import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PasswordField } from '../components/PasswordField';
import { isAxiosError } from 'axios';
import { Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const res = await apiClient.post('/auth/login', { email: email.trim(), password });
      const { access_token, refresh_token } = res.data;
      login(access_token, refresh_token);
      navigate('/');
    } catch (err) {
      const invalidCredentials = isAxiosError(err) && err.response?.status === 401;
      setError(invalidCredentials ? '邮箱或密码错误。' : '暂时无法登录，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-neutral-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900">登录 AI Knowledge Hub</h1>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} aria-busy={loading} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium text-neutral-800">
              工作邮箱
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-lg border border-neutral-300 py-2.5 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-2 focus:outline-indigo-600/20"
              />
            </div>
          </div>

          <PasswordField value={password} onChange={setPassword} />

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-indigo-700 hover:bg-indigo-800 text-white font-medium rounded-lg shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? '登录中...' : '立即登录'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          还没有企业账户？{' '}
          <Link to="/register" className="text-indigo-700 hover:underline font-medium">
            注册新组织
          </Link>
        </div>
      </div>
    </div>
  );
};
