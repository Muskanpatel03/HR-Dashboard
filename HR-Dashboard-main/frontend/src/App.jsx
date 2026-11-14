import React, { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { BarChart3, LayoutGrid, History, LogOut, Shield } from 'lucide-react';

import Login from './components/Login';
import api from './api';

const loadDashboard = () => import('./components/Dashboard');
const loadModuleView = () => import('./components/ModuleView');
const loadManpowerHub = () => import('./components/ManpowerHub');
const loadRecruitmentHub = () => import('./components/RecruitmentHub');
const loadTrainingHub = () => import('./components/TrainingHub');
const loadAuditView = () => import('./components/AuditView');
const loadAccessControl = () => import('./components/AccessControl');
const loadCompanySelector = () => import('./components/CompanySelector');

const Dashboard = lazy(loadDashboard);
const DashboardSummary = lazy(() => loadDashboard().then((module) => ({ default: module.DashboardSummary })));
const ModuleView = lazy(loadModuleView);
const ManpowerHub = lazy(loadManpowerHub);
const RecruitmentHub = lazy(loadRecruitmentHub);
const TrainingHub = lazy(loadTrainingHub);
const AuditView = lazy(loadAuditView);
const AccessControl = lazy(loadAccessControl);
const CompanySelector = lazy(loadCompanySelector);

function preloadPage(key) {
  if (key === 'dashboard' || key === 'summary') return loadDashboard();
  if (key === 'manpower') return loadManpowerHub();
  if (key === 'recruitment') return loadRecruitmentHub();
  if (key === 'training') return loadTrainingHub();
  if (key === 'audit') return loadAuditView();
  if (key === 'roles') return loadAccessControl();
  if (MODULES.some((module) => module.key === key)) {
    return Promise.all([loadModuleView(), loadCompanySelector()]);
  }
  return Promise.resolve();
}

function warmPage(key) {
  preloadPage(key).catch((error) => {
    console.error(`Failed to preload ${key} page`, error);
  });
}

import {
  C,
  FONT_HEAD,
  FONT_BODY,
  MODULES,
  MODULE_MAP,
  COMPANY_OPTIONS,
  ROLES,
} from './config';

const RECRUITMENT_GROUP = ['recruitment', 'hiring', 'separation'];

export default function App() {
  // ==================================================
  // USER STATE
  // ==================================================

  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('automat_user');
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Invalid automat_user in localStorage:', error);
      localStorage.removeItem('automat_user');
      return null;
    }
  });

  // ==================================================
  // ACTIVE MODULE
  // ==================================================

  const [active, setActive] = useState(() => {
    return localStorage.getItem('automat_active') || 'dashboard';
  });
  const [manpowerInitialTab, setManpowerInitialTab] = useState('total');
  const [recruitmentInitialTab, setRecruitmentInitialTab] = useState('recruitment');

  const [companyId, setCompanyId] = useState(() =>
    localStorage.getItem('automat_company') || COMPANY_OPTIONS[0].id
  );

  const [theme] = useState('light');

  useEffect(() => {
    api.get('/health').catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('automat_theme', 'light');
  }, []);

  useEffect(() => {
    if (!user || !localStorage.getItem('automat_token')) return undefined;
    let cancelled = false;
    api.get('/auth/me')
      .then(({ data }) => {
        if (cancelled) return;
        setUser(data.user);
        localStorage.setItem('automat_user', JSON.stringify(data.user));
      })
      .catch((error) => {
        if (error.response?.status === 401 && !cancelled) setUser(null);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleCompanyChange = (nextCompanyId) => {
    setCompanyId(nextCompanyId);
    localStorage.setItem('automat_company', nextCompanyId);
  };

  // ==================================================
  // PERMISSIONS
  // IMPORTANT: calculated even when user is null
  // so hooks always run in the same order.
  // ==================================================

  const perms = useMemo(() => {
    if (!user) return null;

    // Prefer the live, admin-editable permissions the server computed for
    // this user's role (see backend/src/config/roles.js). Falls back to the
    // bundled static copy only if the server didn't send one (e.g. an old
    // cached localStorage user from before this feature existed).
    return user.roleAccess || ROLES[user.role] || ROLES.Management;
  }, [user]);

  const allowedCompanyIds = useMemo(
    () => perms?.companies || COMPANY_OPTIONS.map((company) => company.id),
    [perms]
  );
  const allowedCompanies = useMemo(
    () => COMPANY_OPTIONS.filter((company) => allowedCompanyIds.includes(company.id)),
    [allowedCompanyIds]
  );

  useEffect(() => {
    const canSelectAll = allowedCompanyIds.length === COMPANY_OPTIONS.length;
    if (companyId === 'all' && canSelectAll) return;
    if (companyId !== 'all' && allowedCompanyIds.includes(companyId)) return;

    const fallback = allowedCompanyIds[0] || '';
    setCompanyId(fallback);
    if (fallback) localStorage.setItem('automat_company', fallback);
    else localStorage.removeItem('automat_company');
  }, [companyId, allowedCompanyIds]);

  // ==================================================
  // VISIBLE MODULES
  // ==================================================

  const visibleModuleKeys = useMemo(() => {
    if (!perms) return [];

    if (perms.modules === 'all') {
      return MODULES.map((m) => m.key);
    }

    return perms.modules.filter((k) => k !== 'dashboard');
  }, [perms]);

  // ==================================================
  // DASHBOARD PERMISSION
  // ==================================================

  const canSeeDashboard = useMemo(() => {
    if (!perms) return false;

    return (
      perms.modules === 'all' ||
      perms.modules.includes('dashboard')
    );
  }, [perms]);

  // ==================================================
  // RECRUITMENT GROUP
  // ==================================================

  const canSeeRecruitmentGroup = useMemo(() => {
    return RECRUITMENT_GROUP.some((key) =>
      visibleModuleKeys.includes(key)
    );
  }, [visibleModuleKeys]);

  // ==================================================
  // NAVIGATION ITEMS
  // ==================================================

  const navItems = useMemo(() => {
    if (!perms) return [];

    return [
      canSeeDashboard
        ? {
            key: 'dashboard',
            label: 'Dashboard',
            icon: LayoutGrid,
          }
        : null,

      canSeeDashboard
        ? {
            key: 'summary',
            label: 'Summary',
            icon: BarChart3,
          }
        : null,

      ...MODULES.filter((m) => {
        // Operation Matrix is accessed through the company tabs on Dashboard.
        if (m.key === 'operationMatrix') {
          return false;
        }

        // Hiring and Separation are inside RecruitmentHub
        if (
          m.key === 'hiring' ||
          m.key === 'separation'
        ) {
          return false;
        }

        // Recruitment group
        if (m.key === 'recruitment') {
          return canSeeRecruitmentGroup;
        }

        return visibleModuleKeys.includes(m.key);
      }),

      perms.modules === 'all'
        ? {
            key: 'audit',
            label: 'Audit Trail',
            icon: History,
          }
        : null,

      // Access Control — lets an Administrator manage every role's
      // view/edit permissions from the UI. Gated on the role itself
      // (not just perms.modules === 'all'), since Management also has
      // modules: 'all' but should not be able to change access rules.
      user.role === 'Administrator'
        ? {
            key: 'roles',
            label: 'Access Control',
            icon: Shield,
          }
        : null,
    ].filter(Boolean);
  }, [
    perms,
    user,
    canSeeDashboard,
    canSeeRecruitmentGroup,
    visibleModuleKeys,
  ]);

  // ==================================================
  // VALIDATE ACTIVE PAGE
  //
  // This effect does NOT depend on active.
  // It checks the saved localStorage value instead.
  // ==================================================

  useEffect(() => {
    if (!user) {
      localStorage.removeItem('automat_active');

      if (active !== 'dashboard') {
        setActive('dashboard');
      }

      return;
    }

    const storedActive =
      localStorage.getItem('automat_active') || 'dashboard';

    const isValid =
      (storedActive !== 'dashboard' || canSeeDashboard) &&
      (storedActive !== 'audit' || perms?.modules === 'all') &&
      (storedActive !== 'roles' || user.role === 'Administrator') &&
      (['dashboard', 'audit', 'roles'].includes(storedActive) ||
        navItems.some((item) => item.key === storedActive));

    if (isValid) {
      if (active !== storedActive) {
        setActive(storedActive);
      }
    } else {
      const fallbackActive = navItems[0]?.key || 'dashboard';
      localStorage.setItem('automat_active', fallbackActive);

      if (active !== fallbackActive) {
        setActive(fallbackActive);
      }
    }
  }, [user, navItems]);

  // ==================================================
  // LOGIN
  // ==================================================

  const handleLogin = (loggedInUser) => {
    console.log(
      'AUTOMAT LOGIN SUCCESS:',
      loggedInUser
    );

    // Save user
    localStorage.setItem(
      'automat_user',
      JSON.stringify(loggedInUser)
    );

    // Always start on dashboard after login
    localStorage.setItem(
      'automat_active',
      'dashboard'
    );

    // Update React immediately
    setActive('dashboard');
    setUser(loggedInUser);
  };

  // ==================================================
  // LOGOUT
  // ==================================================

  const logout = () => {
    console.log('AUTOMAT LOGOUT');

    localStorage.removeItem('automat_token');
    localStorage.removeItem('automat_user');
    localStorage.removeItem('automat_active');

    setActive('dashboard');
    setUser(null);
  };

  // ==================================================
  // NAVIGATION
  // ==================================================

  const handleNavigation = (key) => {
    setActive(key);
    localStorage.setItem(
      'automat_active',
      key
    );
  };

  // ==================================================
  // EDIT PERMISSION
  // ==================================================

  const canEditModule = (key) => {
    if (!perms) return false;

    return (
      perms.edit === 'all' ||
      (
        Array.isArray(perms.edit) &&
        perms.edit.includes(key)
      )
    );
  };

  const canCreateModule = (key) => {
    if (!perms) return false;

    return (
      perms.create === 'all' ||
      (
        Array.isArray(perms.create) &&
        perms.create.includes(key)
      )
    );
  };

  const canViewModule = (key) => {
    if (!perms) return false;

    return (
      perms.modules === 'all' ||
      (Array.isArray(perms.modules) && perms.modules.includes(key))
    );
  };

  // ==================================================
  // ACTIVE PAGE TITLE
  // ==================================================

  const activeLabel =
    active === 'dashboard'
      ? 'Human Resource Dashboard'
      : active === 'summary'
        ? 'HR Summary'
      : active === 'audit'
        ? 'Audit Trail'
        : active === 'roles'
          ? 'Access Control'
          : active === 'recruitment'
          ? 'Recruitment'
          : MODULE_MAP[active]?.label ||
              'Human Resource Dashboard';

  // ==================================================
  // IMPORTANT:
  // ALL HOOKS ARE ABOVE THIS POINT.
  // ==================================================

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const palette = theme === 'dark'
    ? {
        appBg: '#16101f',
        panel: '#21182d',
        panelAlt: '#38294b',
        border: '#49375e',
        text: '#f0e9f7',
        textMuted: '#b7a8c7',
        header: '#21182d',
        sidebar: '#120d1a',
        sidebarHover: '#30243d',
        sidebarActive: '#4c2b83',
        sidebarText: '#f0e9f7',
        sidebarMuted: '#b7a8c7',
        accent: '#83b98a',
        accentSoft: '#233629',
      }
    : {
        appBg: '#f7f4fa',
        panel: '#ffffff',
        panelAlt: '#eee8f5',
        border: '#d9cfe5',
        text: '#38264d',
        textMuted: '#746b7d',
        header: '#eee8f5',
        sidebar: '#3e216f',
        sidebarHover: '#563a7c',
        sidebarActive: '#684aa0',
        sidebarText: '#f4eff8',
        sidebarMuted: '#d0c2e0',
        accent: '#347b43',
        accentSoft: '#eef5ef',
      };

  // ==================================================
  // MAIN APP
  // ==================================================

  return (
    <div
      style={{
        fontFamily: FONT_BODY,
        background: palette.appBg,
        color: palette.text,
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
      }}
      className="w-full"
    >
      {/* ==============================================
          SIDEBAR
      ============================================== */}

      <aside
        style={{
          background: palette.sidebar,
          borderRight: `1px solid ${palette.border}`,
          '--sidebar-hover': palette.sidebarHover,
          height: '100vh',
        }}
        className="shrink-0 flex flex-col w-16 md:w-56"
      >

        {/* BRAND */}

        <div
          className="flex items-center gap-2 px-3 py-4 border-b"
          style={{
            borderColor: palette.border,
          }}
        >
          <img
            src="/automat.png"
            alt="Automat"
            style={{
              width: 30,
              height: 30,
              borderRadius: 4,
              objectFit: 'contain',
            }}
            className="shrink-0"
          />

          <div className="hidden md:block leading-tight">
            <div
              style={{
                fontFamily: FONT_HEAD,
                color: '#FFFFFF',
                fontSize: 17,
                letterSpacing: 0.3,
              }}
            >
              AUTOMAT
            </div>

            <div
              style={{
                color: palette.sidebarMuted,
                fontSize: 10.5,
              }}
            >
              HR MIS · Workforce Platform
            </div>
          </div>
        </div>

        {/* NAVIGATION */}

        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              active === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onMouseEnter={() => warmPage(item.key)}
                onFocus={() => warmPage(item.key)}
                onClick={() =>
                  handleNavigation(item.key)
                }
                className="sidebar-nav-item w-full flex items-center gap-3 px-3 py-2.5 text-left"
                style={{
                  background: isActive
                    ? palette.sidebarActive
                    : undefined,

                  borderLeft: isActive
                    ? `3px solid ${palette.accent}`
                    : '3px solid transparent',

                  color: isActive
                    ? '#FFFFFF'
                    : palette.sidebarText,
                }}
              >
                <Icon
                  size={17}
                  strokeWidth={1.8}
                />

                <span className="hidden md:inline text-sm">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* USER / LOGOUT */}

        <div
          className="px-3 py-3 border-t hidden md:block"
          style={{
            borderColor: C.navyBorder,
          }}
        >
          <div
            style={{
              color: '#FFFFFF',
              fontSize: 13,
            }}
          >
            {user.name}
          </div>

          <div
            style={{
              color: palette.accent,
              fontSize: 11,
            }}
          >
            {user.role}
          </div>

          <button
            type="button"
            onClick={logout}
            className="mt-2 flex items-center gap-1.5 text-xs"
            style={{
              color: palette.sidebarMuted,
              cursor: 'pointer',
            }}
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ==============================================
          MAIN CONTENT
      ============================================== */}

      <main
        className="flex-1 min-w-0"
        style={{
          height: '100vh',
          overflowY: 'auto',
        }}
      >

        {/* HEADER */}

        <header
          style={{
            background: palette.header,
            borderBottom: `1px solid ${palette.border}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
          className="px-5 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div
                style={{
                  fontFamily: FONT_HEAD,
                  fontSize: 20,
                  color: palette.text,
                }}
              >
                {activeLabel}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: palette.textMuted,
                }}
              >
                {new Date().toLocaleDateString(
                  'en-IN',
                  {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }
                )}
              </div>
            </div>

          </div>
        </header>

        {/* PAGE CONTENT */}

        <Suspense fallback={
          <div role="status" aria-live="polite" className="p-5">
            <div className="h-5 w-48 rounded bg-slate-200 animate-pulse" />
            <div className="mt-4 h-24 rounded bg-slate-100 animate-pulse" />
          </div>
        }>
        <div className="p-5 w-full" style={{ maxWidth: 1500, margin: '0 auto' }}>

          {active === 'dashboard' && canSeeDashboard && (
            <Dashboard
              editable={canEditModule('operationMatrix')}
              creatable={canCreateModule('operationMatrix')}
              canDelete={user?.role === 'Administrator'}
              canViewMatrix={canViewModule('operationMatrix') || canSeeDashboard}
              companyId={companyId}
              onCompanyChange={handleCompanyChange}
              allowedCompanies={allowedCompanies}
            />
          )}

          {active === 'dashboard' && !canSeeDashboard && (
            <div role="alert" className="dashboard-access-denied">
              You do not have permission to view the Dashboard. Contact an Administrator to request access.
            </div>
          )}

          {active === 'summary' && canSeeDashboard && (
            <DashboardSummary
              allowedCompanies={allowedCompanies}
              onOpenSection={(sectionKey, targetCompanyId) => {
                if (targetCompanyId === 'all') {
                  handleCompanyChange(allowedCompanyIds.length === COMPANY_OPTIONS.length ? 'all' : allowedCompanyIds[0] || '');
                } else if (targetCompanyId) {
                  handleCompanyChange(targetCompanyId);
                }
                if (sectionKey === 'dailyManpower') setManpowerInitialTab('daily');
                if (sectionKey === 'manpower') setManpowerInitialTab('total');
                if (['recruitment', 'hiring', 'separation'].includes(sectionKey)) {
                  setRecruitmentInitialTab(sectionKey);
                  handleNavigation('recruitment');
                  return;
                }
                handleNavigation(sectionKey === 'operationMatrix' ? 'dashboard' : sectionKey === 'dailyManpower' ? 'manpower' : sectionKey);
              }}
            />
          )}

          {active === 'audit' && (
            <AuditView />
          )}

          {active === 'roles' && (
            <AccessControl />
          )}

          {active === 'recruitment' && (
            <RecruitmentHub
              visibleModuleKeys={
                visibleModuleKeys
              }
              canEditModule={
                canEditModule
              }
              canCreateModule={canCreateModule}
              canDelete={user?.role === 'Administrator'}
              companyId={companyId}
              onCompanyChange={handleCompanyChange}
              allowedCompanies={allowedCompanies}
              initialTab={recruitmentInitialTab}
            />
          )}

          {active === 'training' && (
            <TrainingHub canEditModule={canEditModule} canCreateModule={canCreateModule} canDelete={user?.role === 'Administrator'} companyId={companyId} onCompanyChange={handleCompanyChange} allowedCompanies={allowedCompanies} />
          )}

          {active === 'manpower' && (
            <ManpowerHub
              visibleModuleKeys={visibleModuleKeys}
              canEditModule={canEditModule}
              canCreateModule={canCreateModule}
              canDelete={user?.role === 'Administrator'}
              companyId={companyId}
              onCompanyChange={handleCompanyChange}
              allowedCompanies={allowedCompanies}
              initialTab={manpowerInitialTab}
            />
          )}

          {active !== 'dashboard' &&
            active !== 'audit' &&
            active !== 'roles' &&
            active !== 'recruitment' &&
            active !== 'training' &&
            active !== 'manpower' &&
            MODULE_MAP[active] && (
              <>
                {active !== 'usersmgmt' && (
                  <div className="mb-4">
                    <CompanySelector value={companyId} onChange={handleCompanyChange} companies={allowedCompanies} />
                  </div>
                )}
                <ModuleView
                  config={MODULE_MAP[active]}
                  editable={canEditModule(active)}
                  creatable={canCreateModule(active)}
                  canDelete={user?.role === 'Administrator'}
                  companyId={companyId}
                />
              </>
            )}

        </div>
        </Suspense>
      </main>
    </div>
  );
}
