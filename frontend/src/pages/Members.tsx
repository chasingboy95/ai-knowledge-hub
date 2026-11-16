import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { Users, UserPlus, Trash2, Shield, Mail, CheckCircle2, AlertCircle, Copy, Key } from 'lucide-react';

interface Member {
  id: string;
  user_id: string;
  organization_id: string;
  email: string;
  full_name?: string;
  role: string;
}

export const Members: React.FC = () => {
  const { currentOrg, user: currentUser } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite Modal State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

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
      loadMembers();
    } catch (err: any) {
      alert(err.response?.data?.detail || '移除成员失败');
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
    switch (role.toLowerCase()) {
      case 'owner':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">所有者 (Owner)</span>;
      case 'admin':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">管理员 (Admin)</span>;
      case 'member':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">成员 (Member)</span>;
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
          </div>
          <p className="text-sm text-slate-500 mt-1">管理当前企业租户下的成员身份、角色访问控制 (RBAC) 以及邀请协作。</p>
        </div>
        <button
          onClick={() => {
            setIsInviteOpen(true);
            setInviteSuccessMsg(null);
            setGeneratedToken(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg shadow-sm transition"
        >
          <UserPlus className="w-4 h-4" />
          邀请新成员
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
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
                <th className="px-6 py-3 text-left">租户角色</th>
                <th className="px-6 py-3 text-left">租户安全边界</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {members.map((member) => {
                const isSelf = member.user_id === currentUser?.id;
                const isOwner = member.role.toLowerCase() === 'owner';

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
                    <td className="px-6 py-4 whitespace-nowrap">{getRoleBadge(member.role)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-600" />
                        <span>org:{currentOrg?.slug}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {!isSelf && !isOwner && (
                        <button
                          onClick={() => handleRemoveMember(member.user_id, member.email)}
                          className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition"
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
                        className="text-orange-600 hover:text-orange-700 flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedToken ? '已复制' : '复制'}
                      </button>
                    </div>
                    <p className="font-mono text-xs text-slate-700 break-all bg-white p-2 rounded border border-slate-200">
                      {generatedToken}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      提示：被邀请者可通过接口 <code>/api/v1/invitations/{'{token}'}/accept</code> 快速加入。
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
                  className="w-full py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition"
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
                    <option value="admin">Admin - 组织管理员（管理成员、文档及智能体）</option>
                    <option value="member">Member - 普通成员（上传文档、创建对话会话）</option>
                    <option value="viewer">Viewer - 只读访问（检索知识库与体验问答）</option>
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
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg shadow-sm transition disabled:opacity-50"
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
