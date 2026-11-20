import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { generateSlug } from '../utils/slug';
import { ProfileModal } from './ProfileModal';
import { AcceptInviteModal } from './AcceptInviteModal';
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
  Settings,
  Mail,
  Menu,
} from 'lucide-react';

export const Layout: React.FC = () => {
  const {
    user,
    organizations,
    currentOrg,
    workspaces,
    currentWorkspace,
    currentRole,
    workspaceStatus,
    membershipError,
    reloadOrganizationContext,
    hasPermission,
    pendingInvitationsCount,
    switchOrganization,
    switchWorkspace,
    createOrganization,
    createWorkspace,
    logout,
  } = useAuth();
  const navigate = useNavigate();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [chatNavigation, setChatNavigation] = useState<HTMLDivElement | null>(null);

  const [showOrgModal, setShowOrgModal] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [isOrgSlugTouched, setIsOrgSlugTouched] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false);

  const [showWsModal, setShowWsModal] = useState(false);
  const [wsName, setWsName] = useState('');
  const [wsSlug, setWsSlug] = useState('');
  const [isWsSlugTouched, setIsWsSlugTouched] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [isSubmittingWs, setIsSubmittingWs] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAcceptInviteModal, setShowAcceptInviteModal] = useState(false);

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
      setIsOrgSlugTouched(false);
    } catch (err: any) {
      setOrgError(
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        '创建组织失败，请检查标识是否重复'
      );
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
      setIsWsSlugTouched(false);
    } catch (err: any) {
      setWsError(
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        '创建工作区失败，请检查标识是否重复'
      );
    } finally {
      setIsSubmittingWs(false);
    }
  };

  const getRoleText = (role?: string | null) => {
    switch (role?.toUpperCase()) {
      case 'OWNER':
        return '所有者';
      case 'ADMIN':
        return '管理员';
      case 'EDITOR':
        return '编辑者';
      case 'VIEWER':
        return '只读成员';
      default:
        return '租户成员';
    }
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-white font-sans text-neutral-900">
      {navigationOpen && (
        <button type="button" aria-label="关闭导航" onClick={() => setNavigationOpen(false)}
          className="fixed inset-0 z-30 bg-black/25 md:hidden" />
      )}
      {/* Sidebar */}
      <aside id="workspace-navigation" className={`inset-y-0 left-0 z-40 w-60 shrink-0 flex-col justify-between border-r border-neutral-200 bg-white md:static md:flex ${navigationOpen ? 'fixed flex' : 'hidden'}`}>
        <div className="min-h-0 overflow-y-auto">
          {/* Logo & Brand */}
          <div className="p-5 border-b border-neutral-200 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-neutral-900 flex items-center justify-center text-white font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-neutral-950 text-base tracking-tight leading-none">Knowledge Hub</h1>
            </div>
          </div>

          {/* Org & Workspace Selector */}
          <div className="p-4 border-b border-neutral-200 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="active-organization" className="text-[10px] uppercase font-mono tracking-wider text-neutral-600 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-neutral-600" />
                  当前组织
                </label>
                <div className="flex items-center gap-1">
                  {/* Accept invite button with badge */}
                  <button
                    type="button"
                    onClick={() => setShowAcceptInviteModal(true)}
                    className="relative p-1 text-neutral-600 hover:text-indigo-700 hover:bg-neutral-100 rounded transition cursor-pointer"
                    title="接受组织邀请 / 待办"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {pendingInvitationsCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-orange-600 text-white font-bold text-[9px] rounded-full flex items-center justify-center animate-pulse">
                        {pendingInvitationsCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrgName('');
                      setOrgSlug('');
                      setIsOrgSlugTouched(false);
                      setOrgError(null);
                      setShowOrgModal(true);
                    }}
                    className="p-1 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 rounded transition cursor-pointer"
                    title="新建组织"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="relative">
                <select
                  id="active-organization"
                  value={currentOrg?.id || ''}
                  onChange={(e) => {
                    const org = organizations.find((o) => o.id === e.target.value);
                    if (org) switchOrganization(org);
                  }}
                  className="w-full bg-neutral-50 text-neutral-800 text-xs rounded-md px-2.5 py-1.5 appearance-none border border-neutral-200 focus:outline-none focus:border-indigo-500"
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
                <ChevronDown className="w-3.5 h-3.5 text-neutral-600 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="active-workspace" className="text-[10px] uppercase font-mono tracking-wider text-neutral-600 flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-neutral-600" />
                  工作区 (Workspace)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setWsName('');
                    setWsSlug('');
                    setIsWsSlugTouched(false);
                    setWsError(null);
                    setShowWsModal(true);
                  }}
                  disabled={workspaceStatus !== 'ready' || !hasPermission('workspace:create')}
                  className="p-1 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 rounded transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title={hasPermission('workspace:create') ? '新建工作区' : '当前角色无工作区创建权限'}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="relative">
                <select
                  id="active-workspace"
                  value={currentWorkspace?.id || ''}
                  disabled={!currentOrg || workspaces.length === 0}
                  onChange={(e) => {
                    const ws = workspaces.find((w) => w.id === e.target.value);
                    if (ws) switchWorkspace(ws);
                  }}
                  className="w-full bg-neutral-50 text-neutral-800 text-xs rounded-md px-2.5 py-1.5 appearance-none border border-neutral-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  {workspaces.length === 0 ? (
                    <option value="">{workspaceStatus === 'loading' ? '正在加载…'
                      : workspaceStatus === 'error' ? '加载失败' : '暂无工作区'}</option>
                  ) : (
                    workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-600 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Navigation Links - Filtered by Menu Permissions */}
          <nav className="p-3 space-y-1">
            <NavLink
              to="/chat"
              onClick={() => setNavigationOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-800'
                    : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100'
                }`
              }
            >
              <MessageSquare className="w-4 h-4" />
              <span>AI 问答</span>
            </NavLink>

            <NavLink
              to="/overview"
              onClick={() => setNavigationOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-800'
                    : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100'
                }`
              }
            >
              <Layers className="w-4 h-4" />
              <span>工作台概览</span>
            </NavLink>

            <NavLink
              to="/knowledge-bases"
              onClick={() => setNavigationOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-800'
                    : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100'
                }`
              }
            >
              <BookOpen className="w-4 h-4" />
              <span>知识库与文档</span>
            </NavLink>

            <NavLink
              to="/members"
              onClick={() => setNavigationOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-800'
                    : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100'
                }`
              }
            >
              <Users className="w-4 h-4" />
              <span>成员与权限</span>
            </NavLink>

            {/* Menu Permission: Audit Log visible only to members with audit:read (Owner & Admin) */}
            {hasPermission('audit:read') && (
              <NavLink
                to="/audit"
                  onClick={() => setNavigationOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-800'
                      : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100'
                  }`
                }
              >
                <ShieldCheck className="w-4 h-4" />
                <span>安全审计日志</span>
              </NavLink>
            )}
          </nav>
          <div ref={setChatNavigation} />
        </div>

        {/* User Footer with Personal Settings */}
        <div className="p-4 border-t border-neutral-200 flex items-center justify-between">
          <div className="truncate flex-1 pr-2">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-neutral-800 truncate">
                {user?.full_name || user?.email}
              </p>
              {currentRole && (
                <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-neutral-100 text-indigo-700 border border-neutral-200">
                  {getRoleText(currentRole)}
                </span>
              )}
            </div>
            <p className="text-[10px] text-neutral-600 font-mono truncate">{user?.email}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowProfileModal(true)}
              title="个人信息维护与设置"
              className="p-1.5 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 rounded-md transition cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              title="退出登录"
              className="p-1.5 text-neutral-600 hover:text-red-400 hover:bg-neutral-100 rounded-md transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-2 md:hidden">
          <button type="button" aria-label="打开导航" aria-controls="workspace-navigation" aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen(true)} className="rounded-lg p-2 hover:bg-neutral-100">
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold">Knowledge Hub</span>
        </div>
        {/* Banner if there are pending invitations */}
        {pendingInvitationsCount > 0 && (
          <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white px-6 py-2.5 flex items-center justify-between text-xs font-medium shadow-sm">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 animate-bounce" />
              <span>您有 {pendingInvitationsCount} 个待处理的组织邀请，加入后可协同管理知识库及 Agent。</span>
            </div>
            <button
              onClick={() => setShowAcceptInviteModal(true)}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md font-semibold transition cursor-pointer"
            >
              查看并接受
            </button>
          </div>
        )}

        {/* Onboarding banners if empty */}
        {organizations.length === 0 ? (
          <div className="m-6 p-6 bg-orange-50 border border-orange-200 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
            <div>
              <h3 className="font-bold text-orange-900 text-base">欢迎加入 AI Knowledge Hub！</h3>
              <p className="text-sm text-orange-700 mt-1">您当前尚未加入或创建任何组织。您可以创建一个新组织，或者接受团队发来的邀请码快速加入。</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAcceptInviteModal(true)}
                className="px-4 py-2 bg-white border border-orange-300 hover:bg-orange-100 text-orange-800 text-sm font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition whitespace-nowrap cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                接受邀请
              </button>
              <button
                onClick={() => {
                  setOrgName('');
                  setOrgSlug('');
                  setIsOrgSlugTouched(false);
                  setOrgError(null);
                  setShowOrgModal(true);
                }}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                创建第一个组织
              </button>
            </div>
          </div>
        ) : workspaceStatus === 'loading' ? (
          <p role="status" className="m-6 text-sm text-neutral-600">正在加载当前组织的工作区…</p>
        ) : workspaceStatus === 'error' || membershipError ? (
          <div className="m-6 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <p role="alert">{workspaceStatus === 'error' ? '无法加载工作区。' : '无法加载组织权限。'}</p>
            <button type="button" onClick={reloadOrganizationContext} className="font-medium text-indigo-700 hover:underline">
              重试加载
            </button>
          </div>
        ) : workspaceStatus === 'ready' && workspaces.length === 0 && currentRole ? (
          <div className="m-6 p-6 bg-blue-50 border border-blue-200 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
            <div>
              <h3 className="font-bold text-blue-900 text-base">组织【{currentOrg?.name}】尚未创建工作区</h3>
              <p className="text-sm text-blue-700 mt-1">知识库与对话会话均按工作区隔离。请先在当前组织下创建一个工作区。</p>
            </div>
            {hasPermission('workspace:create') ? (
              <button
                onClick={() => {
                  setWsName('');
                  setWsSlug('');
                  setIsWsSlugTouched(false);
                  setWsError(null);
                  setShowWsModal(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                创建工作区
              </button>
            ) : (
              <span className="text-xs text-blue-600 bg-blue-100 px-3 py-1.5 rounded-lg">
                您当前为{getRoleText(currentRole)}，请联系组织管理员创建工作区
              </span>
            )}
          </div>
        ) : null}

        {workspaceStatus !== 'loading' && (
          <Outlet
            key={`${currentOrg?.id ?? ''}/${currentWorkspace?.id ?? ''}`}
            context={{ chatNavigation, closeNavigation: () => setNavigationOpen(false) }}
          />
        )}
      </main>

      {/* Profile Maintenance Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      {/* Accept Invitation Modal */}
      <AcceptInviteModal
        isOpen={showAcceptInviteModal}
        onClose={() => setShowAcceptInviteModal(false)}
      />

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
                    const val = e.target.value;
                    setOrgName(val);
                    if (!isOrgSlugTouched) {
                      setOrgSlug(generateSlug(val));
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setOrgSlug(val);
                    setIsOrgSlugTouched(val.length > 0);
                  }}
                  placeholder="如：tech-rd 或 研发中心"
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
                    const val = e.target.value;
                    setWsName(val);
                    if (!isWsSlugTouched) {
                      setWsSlug(generateSlug(val));
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setWsSlug(val);
                    setIsOrgSlugTouched(val.length > 0);
                  }}
                  placeholder="如：customer-support 或 客服专区"
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
