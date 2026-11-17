import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import {
  Users,
  UserPlus,
  Trash2,
  Shield,
  Mail,
  CheckCircle2,
  AlertCircle,
  Copy,
  Key,
  ShieldAlert,
  Loader2,
} from 'lucide-react';

interface Member {
  id: string;
  user_id: string;
  organization_id: string;
  email: string;
  full_name?: string;
  role: string;
}

export const Members: React.FC = () => {
  const {
    currentOrg,
    user: currentUser,
    currentRole,
    hasPermission,
    isOwnerOrAdmin,
  } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Invite Modal State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'>('EDITOR');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const isOwner = currentRole?.toUpperCase() === 'OWNER';
  const canManageMembers = hasPermission('member:invite') || isOwnerOrAdmin;
  const canRemoveMembers = hasPermission('member:remove') || isOwnerOrAdmin;

  const loadMembers = async () => {
    if (!currentOrg) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<Member[]>(`/organizations/${currentOrg.id}/members`);
      setMembers(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || '获取组织成员列表失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [currentOrg]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!currentOrg) return;
    setUpdatingUserId(userId);
    setError(null);
    setSuccessToast(null);
    try {
      await apiClient.patch(`/organizations/${currentOrg.id}/members/${userId}`, {
        role: newRole,
      });
      setSuccessToast('成员权限与角色已成功变更');
      setTimeout(() => setSuccessToast(null), 3000);
      await loadMembers();
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        '更新成员权限角色失败'
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !inviteEmail.trim()) return;

    setInviteLoading(true);
    setInviteSuccessMsg(null);
    setGeneratedToken(null);
    try {
      const res = await apiClient.post(`/organizations/${currentOrg.id}/invitations`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      setInviteSuccessMsg(`邀请已成功生成并发送至 ${inviteEmail}`);
      if (res.data.invite_token) {
        setGeneratedToken(res.data.invite_token);
      }
      setInviteEmail('');
      loadMembers();
    } catch (err: any) {
      setError(err.response?.data?.detail || '发送邀请失败');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string, email: string) => {
    if (!currentOrg) return;
    if (!window.confirm(`确定要移除成员 ${email} 吗？`)) return;

    try {
      await apiClient.delete(`/organizations/${currentOrg.id}/members/${userId}`);
      setSuccessToast(`已移除成员 ${email}`);
      setTimeout(() => setSuccessToast(null), 3000);
      loadMembers();
    } catch (err: any) {
      setError(err.response?.data?.detail || '移除成员失败');
    }
  };

  const copyTokenToClipboard = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role.toUpperCase()) {
      case 'OWNER':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">所有者 (Owner)</span>;
      case 'ADMIN':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">管理员 (Admin)</span>;
      case 'EDITOR':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">编辑者 (Editor)</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">只读 (Viewer)</span>;
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">组织成员与权限</h1>
            <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-md font-mono">
              {currentOrg?.name || '未选定组织'}
            </span>
            {currentRole && (
              <span className="text-xs px-2 py-0.5 rounded font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                我的身份: {getRoleBadge(currentRole)}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">管理当前企业租户下的成员身份、角色访问控制 (RBAC) 以及邀请协作。</p>
        </div>

        {canManageMembers && (
          <button
            onClick={() => {
              setIsInviteOpen(true);
              setInviteSuccessMsg(null);
              setGeneratedToken(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg shadow-sm transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            邀请新成员
          </button>
        )}
      </div>

      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span>{successToast}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Members Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Users className="w-4 h-4 text-slate-500" />
            <span>成员列表 ({members.length})</span>
          </div>
          {!canManageMembers && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              当前账户为只读权限，不可修改成员角色
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400">正在加载成员信息...</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-slate-400">暂无成员数据</div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 text-left">成员名称 / 邮箱</th>
                <th className="px-6 py-3 text-left">租户角色与权限设置</th>
                <th className="px-6 py-3 text-left">租户安全边界</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {members.map((member) => {
                const isSelf = member.user_id === currentUser?.id;
                const isTargetOwner = member.role.toUpperCase() === 'OWNER';
                // Can edit role if has permission, and not demoting self from owner, and non-owner cannot edit owner
                const canEditThisMember =
                  canManageMembers &&
                  (!isTargetOwner || isOwner) &&
                  !(isSelf && isTargetOwner);

                return (
                  <tr key={member.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs">
                          {member.full_name ? member.full_name[0].toUpperCase() : member.email[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 flex items-center gap-1.5">
                            {member.full_name || '未设置昵称'}
                            {isSelf && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                                我
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            {member.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {canEditThisMember ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={member.role.toUpperCase()}
                            disabled={updatingUserId === member.user_id}
                            onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                            className="bg-slate-50 border border-slate-300 text-slate-700 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer font-medium disabled:opacity-50"
                          >
                            {isOwner && <option value="OWNER">所有者 (OWNER)</option>}
                            <option value="ADMIN">管理员 (ADMIN)</option>
                            <option value="EDITOR">编辑者 (EDITOR)</option>
                            <option value="VIEWER">只读访问 (VIEWER)</option>
                          </select>
                          {updatingUserId === member.user_id && (
                            <Loader2 className="w-4 h-4 text-orange-600 animate-spin" />
                          )}
                        </div>
                      ) : (
                        getRoleBadge(member.role)
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-600" />
                        <span>org:{currentOrg?.slug}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {canRemoveMembers && !isSelf && (!isTargetOwner || isOwner) && (
                        <button
                          onClick={() => handleRemoveMember(member.user_id, member.email)}
                          className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition cursor-pointer"
                          title="从组织移除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Member Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">邀请新成员加入组织</h3>
              <button
                onClick={() => setIsInviteOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {inviteSuccessMsg ? (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                  <span>{inviteSuccessMsg}</span>
                </div>

                {generatedToken && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                      <span className="flex items-center gap-1">
                        <Key className="w-3.5 h-3.5 text-orange-500" />
                        本地开发模式邀请令牌 (Invite Token):
                      </span>
                      <button
                        onClick={copyTokenToClipboard}
                        className="text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedToken ? '已复制' : '复制'}
                      </button>
                    </div>
                    <p className="font-mono text-xs text-slate-700 break-all bg-white p-2 rounded border border-slate-200">
                      {generatedToken}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      提示：被邀请者登录后在左侧组织栏点击【接受邀请】粘贴此令牌，或从其待办邀请中一键加入。
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsInviteOpen(false);
                    setInviteSuccessMsg(null);
                    setGeneratedToken(null);
                  }}
                  className="w-full py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition cursor-pointer"
                >
                  完成
                </button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    成员电子邮箱 (Email)
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    分配角色权限 (Role)
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    {isOwner && <option value="OWNER">OWNER - 组织所有者（最高控制权）</option>}
                    <option value="ADMIN">ADMIN - 组织管理员（管理成员、文档及智能体）</option>
                    <option value="EDITOR">EDITOR - 知识库编辑者（上传与管理文档、创建会话）</option>
                    <option value="VIEWER">VIEWER - 只读访问者（检索知识库与体验问答）</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
                  >
                    {inviteLoading ? '发送中...' : '发送邀请'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
