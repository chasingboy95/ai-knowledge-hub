import React from 'react';
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
    logout,
  } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
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
          <div className="p-4 border-b border-slate-800/80 space-y-2">
            <div>
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
                <Building2 className="w-3 h-3 text-slate-400" />
                当前组织
              </label>
              <div className="relative">
                <select
                  value={currentOrg?.id || ''}
                  onChange={(e) => {
                    const org = organizations.find((o) => o.id === e.target.value);
                    if (org) switchOrganization(org);
                  }}
                  className="w-full bg-slate-800/90 text-slate-200 text-xs rounded-md px-2.5 py-1.5 appearance-none border border-slate-700/60 focus:outline-none focus:border-orange-500"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
                <Layers className="w-3 h-3 text-slate-400" />
                工作区 (Workspace)
              </label>
              <div className="relative">
                <select
                  value={currentWorkspace?.id || ''}
                  onChange={(e) => {
                    const ws = workspaces.find((w) => w.id === e.target.value);
                    if (ws) switchWorkspace(ws);
                  }}
                  className="w-full bg-slate-800/90 text-slate-200 text-xs rounded-md px-2.5 py-1.5 appearance-none border border-slate-700/60 focus:outline-none focus:border-orange-500"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
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
        <Outlet />
      </main>
    </div>
  );
};
