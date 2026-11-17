import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { CheckCircle2, AlertCircle, Sparkles, Building2, ArrowRight } from 'lucide-react';

export const AcceptInvitePage: React.FC = () => {
  const { token: urlToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { token: authToken, refreshOrganizations, switchOrganization } = useAuth();

  const [inviteToken, setInviteToken] = useState(urlToken || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (urlToken) {
      setInviteToken(urlToken);
    }
  }, [urlToken]);

  const handleAccept = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inviteToken.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiClient.post(`/invitations/${inviteToken.trim()}/accept`);
      setSuccess('恭喜！您已成功接受邀请并加入该组织。');
      await refreshOrganizations();

      const orgsRes = await apiClient.get('/organizations');
      const joinedOrg = orgsRes.data.find((o: any) => o.id === res.data.organization_id);
      if (joinedOrg) {
        switchOrganization(joinedOrg);
      }
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        '接受邀请失败，可能邀请链接已失效或已被接受'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-2xl bg-orange-600 flex items-center justify-center text-white mx-auto shadow-lg shadow-orange-500/20 mb-4">
          <Sparkles className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">接受组织协作邀请</h2>
        <p className="mt-2 text-sm text-slate-400">
          加入企业团队，共享知识库索引并体验智能 AI 问答
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-sm space-y-5">
          {success && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{success} 正在为您跳转至工作台...</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!authToken ? (
            <div className="space-y-4 text-center">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700 text-xs text-slate-300">
                请先登录或注册您的 Knowledge Hub 账号，随后即可直接加入组织。
              </div>
              <div className="flex gap-3">
                <Link
                  to="/login"
                  className="flex-1 py-2 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium text-xs text-center transition shadow-sm"
                >
                  去登录
                </Link>
                <Link
                  to="/register"
                  className="flex-1 py-2 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium text-xs text-center transition"
                >
                  去注册
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAccept} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  邀请令牌 (Invite Token)
                </label>
                <input
                  type="text"
                  required
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  placeholder="请输入或粘贴邀请令牌"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 text-slate-200 rounded-lg focus:outline-none focus:border-orange-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !inviteToken.trim()}
                className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm rounded-lg transition shadow-md shadow-orange-600/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                <span>{isSubmitting ? '正在验证加入...' : '确认接受并加入组织'}</span>
              </button>

              <div className="text-center pt-2">
                <Link
                  to="/"
                  className="text-xs text-slate-400 hover:text-white transition inline-flex items-center gap-1"
                >
                  返回我的工作台 <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
