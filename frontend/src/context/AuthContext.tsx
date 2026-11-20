import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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

type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AuthContextType {
  user: User | null;
  organizations: Organization[];
  currentOrg: Organization | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  token: string | null;
  isLoading: boolean;
  initializationFailed: boolean;
  retryInitialization: () => void;
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
  workspaceStatus: WorkspaceStatus;
  membershipError: boolean;
  reloadOrganizationContext: () => void;
  refreshOrganizations: () => Promise<void>;
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
  const [workspaceList, setWorkspaceList] = useState<Workspace[] | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [membership, setMembership] = useState<MyMembershipResponse | null>(null);
  const [workspaceError, setWorkspaceError] = useState(false);
  const [membershipError, setMembershipError] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);
  const organizationId = currentOrg?.id ?? null;
  const selectedOrgId = useRef<string | null>(null);
  const contextRequest = useRef<AbortController | null>(null);
  const accountVersion = useRef(0);
  const workspaces = workspaceList ?? [];
  const currentRole = membership?.role ?? null;
  const currentPermissions = membership?.permissions ?? [];
  const workspaceStatus: WorkspaceStatus = !organizationId ? 'idle'
    : workspaceError ? 'error' : workspaceList === null ? 'loading' : 'ready';
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(!!token);
  const [initializationFailed, setInitializationFailed] = useState(false);
  const [initializationAttempt, setInitializationAttempt] = useState(0);

  const resetOrganizationContext = useCallback(() => {
    contextRequest.current?.abort();
    setWorkspaceList(null);
    setCurrentWorkspace(null);
    setMembership(null);
    setWorkspaceError(false);
    setMembershipError(false);
  }, []);

  const selectOrganization = useCallback((org: Organization | null) => {
    const id = org?.id ?? null;
    if (id !== selectedOrgId.current) {
      selectedOrgId.current = id;
      resetOrganizationContext();
      setContextVersion((version) => version + 1);
    }
    setCurrentOrg(org);
    if (id) localStorage.setItem('current_org_id', id);
    else localStorage.removeItem('current_org_id');
  }, [resetOrganizationContext]);

  const logout = useCallback(() => {
    accountVersion.current++;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_workspace_id');
    const keysToRemove = Object.keys(localStorage).filter((key) => key.startsWith('current_workspace_id_'));
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    selectOrganization(null);
    setToken(null);
    setUser(null);
    setOrganizations([]);
    setPendingInvitations([]);
    setInitializationFailed(false);
    setIsLoading(false);
  }, [selectOrganization]);

  const refreshPendingInvitations = useCallback(async () => {
    const version = accountVersion.current;
    try {
      const res = await apiClient.get<PendingInvitation[]>('/invitations/pending');
      if (version === accountVersion.current) setPendingInvitations(res.data);
    } catch (err) {
      if (version === accountVersion.current) console.warn('Failed to fetch pending invitations', err);
    }
  }, []);

  const fetchProfileAndOrgs = useCallback(async (signal?: AbortSignal) => {
    const version = accountVersion.current;
    const isCurrent = () => version === accountVersion.current && !signal?.aborted;
    try {
      const profileRes = await apiClient.get<User>('/users/me', { signal });
      if (!isCurrent()) return;

      const orgsRes = await apiClient.get<Organization[]>('/organizations', { signal });
      if (!isCurrent()) return;
      const orgs = orgsRes.data;
      const savedOrgId = selectedOrgId.current ?? localStorage.getItem('current_org_id');
      setUser(profileRes.data);
      setOrganizations(orgs);
      selectOrganization(orgs.find((org) => org.id === savedOrgId) ?? orgs[0] ?? null);
      if (!orgs.length) localStorage.removeItem('current_workspace_id');
      void refreshPendingInvitations();
    } catch (error) {
      if (!isCurrent()) return;
      if (!localStorage.getItem('access_token')) {
        logout();
      } else if (signal) {
        setInitializationFailed(true);
      } else {
        throw error;
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [logout, refreshPendingInvitations, selectOrganization]);

  const retryInitialization = () => {
    setInitializationFailed(false);
    setIsLoading(true);
    setInitializationAttempt((attempt) => attempt + 1);
  };

  const reloadOrganizationContext = () => {
    resetOrganizationContext();
    setContextVersion((version) => version + 1);
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
    if (!token) return;
    const controller = new AbortController();
    void fetchProfileAndOrgs(controller.signal);
    return () => controller.abort();
  }, [token, fetchProfileAndOrgs, initializationAttempt]);

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    contextRequest.current = controller;
    const { signal } = controller;
    const base = `/organizations/${organizationId}`;

    apiClient.get<Workspace[]>(`${base}/workspaces`, { signal })
      .then(({ data }) => {
        if (signal.aborted) return;
        const available = data.filter((workspace) => workspace.organization_id === organizationId);
        const storedId = localStorage.getItem(`current_workspace_id_${organizationId}`)
          || localStorage.getItem('current_workspace_id');
        setWorkspaceList(available);
        setCurrentWorkspace(available.find((workspace) => workspace.id === storedId) ?? available[0] ?? null);
        if (!available.length) localStorage.removeItem(`current_workspace_id_${organizationId}`);
      })
      .catch((err) => {
        if (signal.aborted) return;
        console.error('Failed to load workspaces', err);
        setWorkspaceError(true);
      });

    apiClient.get<MyMembershipResponse>(`${base}/my-membership`, { signal })
      .then(({ data }) => {
        if (signal.aborted) return;
        if (data.organization_id !== organizationId) {
          setMembershipError(true);
          return;
        }
        setMembership(data);
      })
      .catch((err) => {
        if (signal.aborted) return;
        console.warn('Failed to fetch my-membership', err);
        setMembershipError(true);
      });

    return () => controller.abort();
  }, [organizationId, contextVersion]);

  useEffect(() => {
    if (currentWorkspace) {
      localStorage.setItem('current_workspace_id', currentWorkspace.id);
      localStorage.setItem(`current_workspace_id_${currentWorkspace.organization_id}`, currentWorkspace.id);
    }
  }, [currentWorkspace]);

  const login = (newToken: string, refreshToken?: string, newUser?: User | null) => {
    if (newToken !== token) {
      accountVersion.current++;
      setInitializationFailed(false);
      setIsLoading(true);
    }
    localStorage.setItem('access_token', newToken);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    setToken(newToken);
    if (newUser) setUser(newUser);
  };

  const switchOrganization = (org: Organization) => selectOrganization(org);

  const switchWorkspace = (workspace: Workspace) => {
    if (workspace.organization_id === selectedOrgId.current) setCurrentWorkspace(workspace);
  };

  const createOrganization = async (name: string, slug: string): Promise<Organization> => {
    const version = accountVersion.current;
    const res = await apiClient.post<Organization>('/organizations', { name, slug });
    const newOrg = res.data;
    if (version === accountVersion.current) {
      setOrganizations((prev) => [...prev, newOrg]);
      selectOrganization(newOrg);
    }
    return newOrg;
  };

  const createWorkspace = async (name: string, slug: string): Promise<Workspace> => {
    if (!currentOrg) throw new Error('No organization selected');
    const version = accountVersion.current;
    const res = await apiClient.post<Workspace>(`/organizations/${currentOrg.id}/workspaces`, { name, slug });
    const newWs = res.data;
    if (version === accountVersion.current && newWs.organization_id === selectedOrgId.current) {
      setWorkspaceList((prev) => [...(prev ?? []), newWs]);
      setCurrentWorkspace(newWs);
    }
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
        initializationFailed,
        retryInitialization,
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
        workspaceStatus,
        membershipError,
        reloadOrganizationContext,
        refreshOrganizations: fetchProfileAndOrgs,
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
