import React, { useState, useEffect, useMemo } from 'react';
import { LayoutGrid, History, LogOut, Shield } from 'lucide-react';

import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ModuleView from './components/ModuleView';
import RecruitmentHub from './components/RecruitmentHub';
import LoansHub from './components/LoansHub';
import AuditView from './components/AuditView';
import AccessControl from './components/AccessControl';

import {
  C,
  FONT_HEAD,
  FONT_BODY,
  MODULES,
  MODULE_MAP,
  ROLES,
} from './config';

const RECRUITMENT_GROUP = ['recruitment', 'hiring', 'separation'];
const LOANS_GROUP = ['loans', 'loanSummary'];

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
  // LOANS GROUP
  // ==================================================

  const canSeeLoansGroup = useMemo(() => {
    return LOANS_GROUP.some((key) =>
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

      ...MODULES.filter((m) => {
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

        // Loan Summary is inside LoansHub
        if (m.key === 'loanSummary') {
          return false;
        }

        // Loans group
        if (m.key === 'loans') {
          return canSeeLoansGroup;
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
    canSeeLoansGroup,
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
      storedActive === 'dashboard' ||
      storedActive === 'audit' ||
      storedActive === 'roles' ||
      navItems.some(
        (item) => item.key === storedActive
      );

    if (isValid) {
      if (active !== storedActive) {
        setActive(storedActive);
      }
    } else {
      localStorage.setItem(
        'automat_active',
        'dashboard'
      );

      if (active !== 'dashboard') {
        setActive('dashboard');
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

  // ==================================================
  // ACTIVE PAGE TITLE
  // ==================================================

  const activeLabel =
    active === 'dashboard'
      ? 'Human Resource Dashboard'
      : active === 'audit'
        ? 'Audit Trail'
        : active === 'roles'
          ? 'Access Control'
          : active === 'recruitment'
          ? 'Recruitment'
          : active === 'loans'
            ? 'Loans'
            : MODULE_MAP[active]?.label ||
              'Human Resource Dashboard';

  // ==================================================
  // IMPORTANT:
  // ALL HOOKS ARE ABOVE THIS POINT.
  // ==================================================

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // ==================================================
  // MAIN APP
  // ==================================================

  return (
    <div
      style={{
        fontFamily: FONT_BODY,
        background: C.paper,
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
          background: C.panel,
          borderRight: `1px solid ${C.line}`,
          height: '100vh',
        }}
        className="shrink-0 flex flex-col w-16 md:w-56"
      >

        {/* BRAND */}

        <div
          className="flex items-center gap-2 px-3 py-4 border-b"
          style={{
            borderColor: C.line,
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
                color: C.ink,
                fontSize: 17,
                letterSpacing: 0.3,
              }}
            >
              AUTOMAT
            </div>

            <div
              style={{
                color: C.ink2,
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
                onClick={() =>
                  handleNavigation(item.key)
                }
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#EAF0F4]"
                style={{
                  background: isActive
                    ? C.steelTint
                    : undefined,

                  borderLeft: isActive
                    ? `3px solid ${C.steel}`
                    : '3px solid transparent',

                  color: isActive
                    ? C.steel
                    : C.ink2,
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
            borderColor: C.line,
          }}
        >
          <div
            style={{
              color: C.ink,
              fontSize: 13,
            }}
          >
            {user.name}
          </div>

          <div
            style={{
              color: C.steel,
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
              color: C.ink2,
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
            background: C.card,
            borderBottom: `1px solid ${C.line}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
          className="px-5 py-3"
        >
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontSize: 20,
              color: C.ink,
            }}
          >
            {activeLabel}
          </div>

          <div
            style={{
              fontSize: 12,
              color: C.ink2,
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
        </header>

        {/* PAGE CONTENT */}

        <div className="p-5">

          {active === 'dashboard' && (
            <Dashboard />
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
            />
          )}

          {active === 'loans' && (
            <LoansHub
              visibleModuleKeys={
                visibleModuleKeys
              }
              canEditModule={
                canEditModule
              }
            />
          )}

          {active !== 'dashboard' &&
            active !== 'audit' &&
            active !== 'roles' &&
            active !== 'recruitment' &&
            active !== 'loans' &&
            MODULE_MAP[active] && (
              <ModuleView
                config={MODULE_MAP[active]}
                editable={
                  canEditModule(active)
                }
              />
            )}

        </div>
      </main>
    </div>
  );
}