import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  BookOpen,
  MessageSquare,
  Users,
  Layers,
  LogOut,
  Building2,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  Plus,
  X,
  AlertCircle,
} from 'lucide-react';

export const Layout: React.FC = () => {
  const {
    user,
    organizations,
    currentOrg,
    workspaces,
    currentWorkspace,
    switchOrganization,
    switchWorkspace,
    createOrganization,
    createWorkspace,
    logout,
  } = useAuth();
  const navigate = useNavigate();

  const [showOrgModal, setShowOrgModal] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [orgError, setOrgError] = useState<string | null>(null);
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false);

  const [showWsModal, setShowWsModal] = useState(false);
  const [wsName, setWsName] = useState('');
  const [wsSlug, setWsSlug] = useState('');
  const [wsError, setWsError] = useState<string | null>(null);
  const [isSubmittingWs, setIsSubmittingWs] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !orgSlug.trim()) return;
    setOrgError(null);
    setIsSubmittingOrg(true);
    try {
      await createOrganization(orgName.trim(), orgSlug.trim());
      setShowOrgModal(false);
      setOrgName('');
      setOrgSlug('');
    } catch (err: any) {
      setOrgError(err.response?.data?.detail || '创建组织失败，请检查标识是否重复');
    } finally {
      setIsSubmittingOrg(false);
    }
  };

  const handleCreateWs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsName.trim() || !wsSlug.trim()) return;
    setWsError(null);
    setIsSubmittingWs(true);
    try {
      await createWorkspace(wsName.trim(), wsSlug.trim());
      setShowWsModal(false);
      setWsName('');
      setWsSlug('');
    } catch (err: any) {
      setWsError(err.response?.data?.detail || '创建工作区失败，请检查标识是否重复');
    } finally {
      setIsSubmittingWs(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between flex-shrink-0 border-r border-slate-800">
        <div>
          {/* Logo & Brand */}
          <div className="p-5 border-b border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold shadow-md shadow-orange-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-white text-base tracking-tight leading-none">Knowledge Hub</h1>
              <span className="text-[10px] text-orange-400 font-mono tracking-widest uppercase">Secure RAG &amp; Agent</span>
            </div>
          </div>

          {/* Org & Workspace Selector */}
          <div className="p-4 border-b border-slate-800/80 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  当前组织
                </label>
                <button
                  type="button"
                  onClick={() => setShowOrgModal(true)}
                  className="p-0.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                  title="新建组织"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="relative">
                <select
                  value={currentOrg?.id || ''}
                  onChange={(e) => {
                    const org = organizations.find((o) => o.id === e.target.value);
                    if (org) switchOrganization(org);
                  }}
                  className="w-full bg-slate-800/90 text-slate-200 text-xs rounded-md px-2.5 py-1.5 appearance-none border border-slate-700/60 focus:outline-none focus:border-orange-500"
                >
                  {organizations.length === 0 ? (
                    <option value="">暂无可用组织</option>
                  ) : (
                    organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-slate-400" />
                  工作区 (Workspace)
                </label>
                <button
                  type="button"
                  onClick={() => setShowWsModal(true)}
                  disabled={!currentOrg}
                  className="p-0.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition disabled:opacity-30 disabled:pointer-events-none"
                  title="新建工作区"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="relative">
                <select
                  value={currentWorkspace?.id || ''}
                  disabled={!currentOrg || workspaces.length === 0}
                  onChange={(e) => {
                    const ws = workspaces.find((w) => w.id === e.target.value);
                    if (ws) switchWorkspace(ws);
                  }}
                  className="w-full bg-slate-800/90 text-slate-200 text-xs rounded-md px-2.5 py-1.5 appearance-none border border-slate-700/60 focus:outline-none focus:border-orange-500 disabled:opacity-50"
                >
                  {workspaces.length === 0 ? (
                    <option value="">暂无工作区</option>
                  ) : (
                    workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <Layers className="w-4 h-4" />
              <span>工作台概览</span>
            </NavLink>

            <NavLink
              to="/knowledge-bases"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <BookOpen className="w-4 h-4" />
              <span>知识库与文档</span>
            </NavLink>

            <NavLink
              to="/chat"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <MessageSquare className="w-4 h-4" />
              <span>智能问答 &amp; Agent</span>
            </NavLink>

            <NavLink
              to="/members"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <Users className="w-4 h-4" />
              <span>成员与权限</span>
            </NavLink>

            <NavLink
              to="/audit"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <ShieldCheck className="w-4 h-4" />
              <span>安全审计日志</span>
            </NavLink>
          </nav>
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-800/80 flex items-center justify-between">
          <div className="truncate">
            <p className="text-xs font-semibold text-slate-200 truncate">{user?.email}</p>
            <p className="text-[10px] text-slate-500 font-mono">租户隔离运行中</p>
          </div>
          <button
            onClick={handleLogout}
            title="退出登录"
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-md transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Onboarding banners if empty */}
        {organizations.length === 0 ? (
          <div className="m-6 p-6 bg-orange-50 border border-orange-200 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
            <div>
              <h3 className="font-bold text-orange-900 text-base">欢迎加入 AI Knowledge Hub！</h3>
              <p className="text-sm text-orange-700 mt-1">您当前尚未加入或创建任何组织。请先创建一个组织以开始使用知识库管理与智能 Agent 对话。</p>
            </div>
            <button
              onClick={() => setShowOrgModal(true)}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              创建第一个组织
            </button>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="m-6 p-6 bg-blue-50 border border-blue-200 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
            <div>
              <h3 className="font-bold text-blue-900 text-base">组织【{currentOrg?.name}】尚未创建工作区</h3>
              <p className="text-sm text-blue-700 mt-1">知识库与对话会话均按工作区隔离。请先在当前组织下创建一个工作区。</p>
            </div>
            <button
              onClick={() => setShowWsModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              创建工作区
            </button>
          </div>
        ) : null}

        <Outlet />
      </main>

      {/* Modal: Create Organization */}
      {showOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">新建组织</h3>
              <button
                onClick={() => {
                  setShowOrgModal(false);
                  setOrgError(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {orgError && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{orgError}</span>
              </div>
            )}

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  组织名称
                </label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    if (!orgSlug) {
                      setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                    }
                  }}
                  placeholder="如：技术研发中心"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  组织唯一标识 (Slug)
                </label>
                <input
                  type="text"
                  required
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  placeholder="如：tech-rd"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOrgModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOrg || !orgName.trim() || !orgSlug.trim()}
                  className="px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition disabled:opacity-50"
                >
                  {isSubmittingOrg ? '创建中...' : '确认创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Workspace */}
      {showWsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                新建工作区 - {currentOrg?.name}
              </h3>
              <button
                onClick={() => {
                  setShowWsModal(false);
                  setWsError(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {wsError && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{wsError}</span>
              </div>
            )}

            <form onSubmit={handleCreateWs} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  工作区名称
                </label>
                <input
                  type="text"
                  required
                  value={wsName}
                  onChange={(e) => {
                    setWsName(e.target.value);
                    if (!wsSlug) {
                      setWsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                    }
                  }}
                  placeholder="如：智能客服专区"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  工作区唯一标识 (Slug)
                </label>
                <input
                  type="text"
                  required
                  value={wsSlug}
                  onChange={(e) => setWsSlug(e.target.value)}
                  placeholder="如：customer-support"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWsModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWs || !wsName.trim() || !wsSlug.trim()}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
                >
                  {isSubmittingWs ? '创建中...' : '确认创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
