import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export interface User {
  id: string;
  email: string;
  full_name?: string | null;
  name?: string;
  is_active: boolean;
  created_at?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  organization_id: string;
}

export interface PendingInvitation {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: string;
  invited_by?: string | null;
  created_at: string;
  expires_at: string;
}

interface MyMembershipResponse {
  organization_id: string;
  role: string;
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  organizations: Organization[];
  currentOrg: Organization | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  token: string | null;
  isLoading: boolean;
  currentRole: string | null;
  currentPermissions: string[];
  isOwnerOrAdmin: boolean;
  pendingInvitations: PendingInvitation[];
  pendingInvitationsCount: number;
  hasPermission: (permission: string) => boolean;
  login: (token: string, refreshToken?: string, user?: User | null) => void;
  logout: () => void;
  switchOrganization: (org: Organization) => void;
  switchWorkspace: (ws: Workspace) => void;
  refreshWorkspaces: (targetOrg?: Organization | null) => Promise<void>;
  refreshOrganizations: () => Promise<void>;
  refreshMembership: () => Promise<void>;
  refreshPendingInvitations: () => Promise<void>;
  updateUserProfile: (fullName: string) => Promise<void>;
  createOrganization: (name: string, slug: string) => Promise<Organization>;
  createWorkspace: (name: string, slug: string) => Promise<Workspace>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchProfileAndOrgs = async () => {
    try {
      const profileRes = await apiClient.get<User>('/users/me');
      setUser(profileRes.data);

      const orgsRes = await apiClient.get<Organization[]>('/organizations');
      setOrganizations(orgsRes.data);
      if (orgsRes.data.length > 0) {
        const savedOrgId = localStorage.getItem('current_org_id');
        const defaultOrg = orgsRes.data.find((o) => o.id === savedOrgId) || orgsRes.data[0];
        setCurrentOrg(defaultOrg);
      } else {
        setCurrentOrg(null);
        setWorkspaces([]);
        setCurrentWorkspace(null);
        setCurrentRole(null);
        setCurrentPermissions([]);
        localStorage.removeItem('current_org_id');
        localStorage.removeItem('current_workspace_id');
      }

      refreshPendingInvitations();
    } catch {
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  const refreshPendingInvitations = async () => {
    try {
      const res = await apiClient.get<PendingInvitation[]>('/invitations/pending');
      setPendingInvitations(res.data);
    } catch (err) {
      console.warn('Failed to fetch pending invitations', err);
    }
  };

  const refreshMembership = async () => {
    if (!currentOrg) {
      setCurrentRole(null);
      setCurrentPermissions([]);
      return;
    }
    try {
      const res = await apiClient.get<MyMembershipResponse>(`/organizations/${currentOrg.id}/my-membership`);
      setCurrentRole(res.data.role);
      setCurrentPermissions(res.data.permissions || []);
    } catch (err) {
      console.warn('Failed to fetch my-membership', err);
      setCurrentRole(null);
      setCurrentPermissions([]);
    }
  };

  const refreshWorkspaces = async (targetOrg?: Organization | null) => {
    const org = targetOrg !== undefined ? targetOrg : currentOrg;
    if (!org) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      return;
    }
    try {
      const wsRes = await apiClient.get<Workspace[]>(`/organizations/${org.id}/workspaces`);
      setWorkspaces(wsRes.data);
      if (wsRes.data.length > 0) {
        const savedWsId =
          localStorage.getItem(`current_workspace_id_${org.id}`) ||
          localStorage.getItem('current_workspace_id');
        const defaultWs = wsRes.data.find((w) => w.id === savedWsId) || wsRes.data[0];
        setCurrentWorkspace(defaultWs);
      } else {
        setCurrentWorkspace(null);
        localStorage.removeItem(`current_workspace_id_${org.id}`);
      }
    } catch (err) {
      console.error('Failed to load workspaces', err);
    }
  };

  const updateUserProfile = async (fullName: string) => {
    const res = await apiClient.patch<User>('/users/me', { full_name: fullName });
    setUser(res.data);
  };

  const hasPermission = (permission: string): boolean => {
    if (!currentRole) return false;
    if (currentRole.toUpperCase() === 'OWNER' || currentRole.toUpperCase() === 'ADMIN') return true;
    return currentPermissions.includes(permission);
  };

  const isOwnerOrAdmin = currentRole?.toUpperCase() === 'OWNER' || currentRole?.toUpperCase() === 'ADMIN';

  useEffect(() => {
    if (token) {
      fetchProfileAndOrgs();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (currentOrg) {
      localStorage.setItem('current_org_id', currentOrg.id);
      refreshWorkspaces(currentOrg);
      refreshMembership();
    } else {
      setCurrentRole(null);
      setCurrentPermissions([]);
    }
  }, [currentOrg]);

  useEffect(() => {
    if (currentWorkspace) {
      localStorage.setItem('current_workspace_id', currentWorkspace.id);
      localStorage.setItem(`current_workspace_id_${currentWorkspace.organization_id}`, currentWorkspace.id);
    }
  }, [currentWorkspace]);

  const login = (newToken: string, refreshToken?: string, newUser?: User | null) => {
    localStorage.setItem('access_token', newToken);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    setToken(newToken);
    if (newUser) {
      setUser(newUser);
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_org_id');
    localStorage.removeItem('current_workspace_id');
    const keysToRemove = Object.keys(localStorage).filter((k) => k.startsWith('current_workspace_id_'));
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    setToken(null);
    setUser(null);
    setOrganizations([]);
    setCurrentOrg(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    setCurrentRole(null);
    setCurrentPermissions([]);
    setPendingInvitations([]);
  };

  const switchOrganization = (org: Organization) => {
    setCurrentOrg(org);
    setCurrentWorkspace(null);
  };

  const switchWorkspace = (ws: Workspace) => {
    setCurrentWorkspace(ws);
  };

  const createOrganization = async (name: string, slug: string): Promise<Organization> => {
    const res = await apiClient.post<Organization>('/organizations', { name, slug });
    const newOrg = res.data;
    setOrganizations((prev) => [...prev, newOrg]);
    setCurrentOrg(newOrg);
    setCurrentWorkspace(null);
    return newOrg;
  };

  const createWorkspace = async (name: string, slug: string): Promise<Workspace> => {
    if (!currentOrg) throw new Error('No organization selected');
    const res = await apiClient.post<Workspace>(`/organizations/${currentOrg.id}/workspaces`, { name, slug });
    const newWs = res.data;
    setWorkspaces((prev) => [...prev, newWs]);
    setCurrentWorkspace(newWs);
    return newWs;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        currentOrg,
        workspaces,
        currentWorkspace,
        token,
        isLoading,
        currentRole,
        currentPermissions,
        isOwnerOrAdmin,
        pendingInvitations,
        pendingInvitationsCount: pendingInvitations.length,
        hasPermission,
        login,
        logout,
        switchOrganization,
        switchWorkspace,
        refreshWorkspaces,
        refreshOrganizations: fetchProfileAndOrgs,
        refreshMembership,
        refreshPendingInvitations,
        updateUserProfile,
        createOrganization,
        createWorkspace,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
