import React, { useState } from 'react';
import { useAuth, type PendingInvitation } from '../context/AuthContext';
import { apiClient } from '../api/client';
import {
  Mail,
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  Key,
  Send,
  Sparkles,
} from 'lucide-react';

interface AcceptInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialToken?: string;
}

export const AcceptInviteModal: React.FC<AcceptInviteModalProps> = ({
  isOpen,
  onClose,
  initialToken = '',
}) => {
  const {
    pendingInvitations,
    refreshPendingInvitations,
    refreshOrganizations,
    switchOrganization,
  } = useAuth();

  const [manualToken, setManualToken] = useState(initialToken);
  const [isSubmittingToken, setIsSubmittingToken] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAcceptPending = async (invitation: PendingInvitation) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setAcceptingId(invitation.id);
    try {
      await apiClient.post(`/invitations/${invitation.id}/accept-pending`);
      setSuccessMsg(`已成功加入组织【${invitation.organization_name}】！`);
      await refreshOrganizations();
      await refreshPendingInvitations();

      // Find the newly joined organization and switch to it
      const updatedOrgsRes = await apiClient.get('/organizations');
      const joinedOrg = updatedOrgsRes.data.find(
        (o: any) => o.id === invitation.organization_id || o.slug === invitation.organization_slug
      );
      if (joinedOrg) {
        switchOrganization(joinedOrg);
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        '接受邀请失败，可能邀请已失效或已接受'
      );
    } finally {
      setAcceptingId(null);
    }
  };

  const handleAcceptByToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmittingToken(true);
    try {
      const res = await apiClient.post(`/invitations/${manualToken.trim()}/accept`);
      setSuccessMsg('已成功接受邀请并加入组织！');
      setManualToken('');
      await refreshOrganizations();
      await refreshPendingInvitations();

      const updatedOrgsRes = await apiClient.get('/organizations');
      const joinedOrg = updatedOrgsRes.data.find((o: any) => o.id === res.data.organization_id);
      if (joinedOrg) {
        switchOrganization(joinedOrg);
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        '验证邀请令牌失败，请检查邀请码是否正确且在有效期内'
      );
    } finally {
      setIsSubmittingToken(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role.toUpperCase()) {
      case 'OWNER':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-700">所有者</span>;
      case 'ADMIN':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-700">管理员</span>;
      case 'EDITOR':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-700">编辑者</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">只读成员</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">接受组织邀请</h3>
              <p className="text-xs text-slate-500">加入新组织与团队协作管理知识库与 Agent</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span className="font-medium">{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Pending Invitations List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                <span>发给您的待处理邀请 ({pendingInvitations.length})</span>
              </label>
              <button
                type="button"
                onClick={() => refreshPendingInvitations()}
                className="text-xs text-orange-600 hover:underline"
              >
                刷新
              </button>
            </div>

            {pendingInvitations.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-center text-xs text-slate-400">
                暂无等待您接受的组织邀请
              </div>
            ) : (
              <div className="space-y-2.5">
                {pendingInvitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-orange-300 transition shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-orange-600 flex-shrink-0" />
                        <span className="font-bold text-slate-900 text-sm">{inv.organization_name}</span>
                        <span className="font-mono text-[10px] text-slate-400">({inv.organization_slug})</span>
                      </div>
                      <div>{getRoleBadge(inv.role)}</div>
                    </div>

                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {inv.invited_by && (
                        <span>
                          邀请人: <span className="font-medium text-slate-700">{inv.invited_by}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3 h-3" />
                        有效期至: {new Date(inv.expires_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => handleAcceptPending(inv)}
                        disabled={acceptingId === inv.id}
                        className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{acceptingId === inv.id ? '加入中...' : '接受邀请并加入'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
              或者通过邀请码加入
            </span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Section 2: Manual Token Form */}
          <form onSubmit={handleAcceptByToken} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                <span>输入邀请令牌码 (Invite Token)</span>
              </label>
              <input
                type="text"
                required
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="粘贴收到的邀请密钥或 Token"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmittingToken || !manualToken.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-orange-400" />
                <span>{isSubmittingToken ? '正在验证...' : '验证并加入组织'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
