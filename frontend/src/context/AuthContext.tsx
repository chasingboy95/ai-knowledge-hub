import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export interface User {
  id: string;
  email: string;
  name?: string;
  is_active: boolean;
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

interface AuthContextType {
  user: User | null;
  organizations: Organization[];
  currentOrg: Organization | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, refreshToken?: string, user?: User | null) => void;
  logout: () => void;
  switchOrganization: (org: Organization) => void;
  switchWorkspace: (ws: Workspace) => void;
  refreshWorkspaces: (targetOrg?: Organization | null) => Promise<void>;
  refreshOrganizations: () => Promise<void>;
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
        localStorage.removeItem('current_org_id');
        localStorage.removeItem('current_workspace_id');
      }
    } catch {
      logout();
    } finally {
      setIsLoading(false);
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
        login,
        logout,
        switchOrganization,
        switchWorkspace,
        refreshWorkspaces,
        refreshOrganizations: fetchProfileAndOrgs,
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
