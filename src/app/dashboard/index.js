// src/app/dashboard/index.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { MdPointOfSale, MdListAlt, MdBarChart, MdPerson, MdMenu, MdPrint } from 'react-icons/md';
import logo from '../../assets/logo.jpeg';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser, logout as logoutAction } from '../../redux/slices/userSlice';

/**
 * Dashboard layout with optional auto-logout on inactivity.
 *
 * The auto-logout feature is implemented below but **not activated** by default.
 * To re-enable it, uncomment the <AutoLogout ... /> line in the JSX where indicated.
 */

const COLORS = {
  tea: '#EAE2D4',
  orange: '#FF7F50',
  blue: '#4682B4',
  bg: '#F0EDE6',
  panel: '#FFFFFF'
};

export default function DashboardLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectUser);

  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile offcanvas
  const [collapsed, setCollapsed] = useState(false); // desktop collapsed
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 992 : true);

  const SIDEBAR_WIDTH = 260;
  const COLLAPSED_WIDTH = 76;

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 992);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isDesktop) setCollapsed(false);
  }, [isDesktop]);

  function RenderNavLink({ to, Icon, label }) {
    return (
      <NavLink
        to={to}
        className={({ isActive }) =>
          `d-flex align-items-center gap-3 nav-link-custom ${isActive ? 'active' : ''}`
        }
        title={label}
        style={({ isActive }) => ({
          textDecoration: 'none',
          color: isActive ? '#fff' : '#3d2b1f',
        })}
      >
        <div className="nav-icon" aria-hidden>
          <Icon size={20} />
        </div>
        <div className="nav-label">{label}</div>
      </NavLink>
    );
  }

  /* ----------------- AutoLogout component (embedded but optional) ----------------- */
  function AutoLogout({ timeoutMs = 30 * 60 * 1000, warningMs = 60 * 1000 }) {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [showWarning, setShowWarning] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const warningTimerRef = useRef(null);
    const logoutTimerRef = useRef(null);
    const countdownTimerRef = useRef(null);
    const lastActivityKey = 'arpella:lastActivity';

    const now = () => Date.now();

    const setLastActivity = useCallback((ts = now()) => {
      try {
        localStorage.setItem(lastActivityKey, String(ts));
      } catch (e) {
        // ignore storage errors
      }
    }, []);

    const getLastActivity = useCallback(() => {
      try {
        const v = localStorage.getItem(lastActivityKey);
        return v ? Number(v) : null;
      } catch {
        return null;
      }
    }, []);

    const clearAll = useCallback(() => {
      if (warningTimerRef.current) { clearTimeout(warningTimerRef.current); warningTimerRef.current = null; }
      if (logoutTimerRef.current) { clearTimeout(logoutTimerRef.current); logoutTimerRef.current = null; }
      if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
      setShowWarning(false);
      setSecondsLeft(0);
    }, []);

    const performLogout = useCallback(() => {
      clearAll();
      dispatch(logoutAction());
      navigate('/login', { replace: true });
    }, [dispatch, navigate, clearAll]);

    const scheduleTimers = useCallback((lastTs) => {
      clearAll();
      const elapsed = Math.max(0, now() - (lastTs || now()));
      const timeLeft = Math.max(0, timeoutMs - elapsed);

      if (timeLeft <= 0) {
        performLogout();
        return;
      }

      const showWarningIn = Math.max(0, timeLeft - warningMs);

      logoutTimerRef.current = setTimeout(() => {
        clearAll();
        performLogout();
      }, timeLeft);

      if (warningMs > 0 && timeLeft <= warningMs) {
        setShowWarning(true);
        const actualSecondsLeft = Math.ceil(timeLeft / 1000);
        setSecondsLeft(actualSecondsLeft);

        countdownTimerRef.current = setInterval(() => {
          setSecondsLeft((s) => {
            if (s <= 1) {
              clearAll();
              performLogout();
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      } else if (warningMs > 0) {
        warningTimerRef.current = setTimeout(() => {
          setShowWarning(true);
          const actualSecondsLeft = Math.ceil(warningMs / 1000);
          setSecondsLeft(actualSecondsLeft);

          countdownTimerRef.current = setInterval(() => {
            setSecondsLeft((s) => {
              if (s <= 1) {
                clearAll();
                performLogout();
                return 0;
              }
              return s - 1;
            });
          }, 1000);
        }, showWarningIn);
      }
    }, [clearAll, performLogout, timeoutMs, warningMs]);

    const resetActivity = useCallback((ts = now()) => {
      setLastActivity(ts);
      scheduleTimers(ts);
    }, [setLastActivity, scheduleTimers]);

    const activityHandler = useCallback(() => resetActivity(now()), [resetActivity]);

    const storageHandler = useCallback((ev) => {
      if (!ev.key) return;
      if (ev.key === lastActivityKey) {
        const last = getLastActivity();
        if (last) scheduleTimers(last);
      }
    }, [getLastActivity, scheduleTimers]);

    useEffect(() => {
      if (!user) {
        return () => {};
      }

      resetActivity(now());

      const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click', 'scroll', 'wheel'];
      events.forEach((name) => window.addEventListener(name, activityHandler, { passive: true }));

      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          const last = getLastActivity();
          if (last) scheduleTimers(last);
          else resetActivity(now());
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      window.addEventListener('storage', storageHandler);

      return () => {
        events.forEach((name) => window.removeEventListener(name, activityHandler));
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('storage', storageHandler);
        clearAll();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, activityHandler, storageHandler, resetActivity, scheduleTimers, getLastActivity, clearAll]);

    useEffect(() => {
      if (!user) {
        clearAll();
      }
    }, [user, clearAll]);

    const staySignedIn = () => {
      clearAll();
      resetActivity(now());
    };

    return (
      <>
        {showWarning && user && (
          <div aria-live="polite" aria-atomic="true">
            <div className="auto-logout-modal-backdrop" style={{
              position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.35)'
            }}>
              <div style={{
                width: 420,
                maxWidth: '92%',
                background: '#fff',
                borderRadius: 8,
                padding: 18,
                boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>Session expiring</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{user[0]?.firstName || user?.userName || ''}</div>
                </div>

                <div style={{ color: '#333', marginBottom: 14 }}>
                  No activity detected. You will be logged out in <strong>{secondsLeft} second{secondsLeft !== 1 ? 's' : ''}</strong>.
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline-secondary" onClick={performLogout}>Log out now</button>
                  <button className="btn" style={{ background: COLORS.orange, color: '#fff' }} onClick={staySignedIn}>Stay signed in</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  } // end AutoLogout

  /* ----------------- render layout ----------------- */

  return (
    <div className="position-relative" style={{ minHeight: '100vh', backgroundColor: COLORS.bg }}>
      {/* Floating hamburger (desktop toggles collapse, mobile opens offcanvas) */}
      <button
        aria-label="Toggle sidebar"
        onClick={() => {
          if (isDesktop) setCollapsed((c) => !c);
          else setSidebarOpen(true);
        }}
        style={{
          position: 'fixed',
          top: 14,
          left: 14,
          zIndex: 1101,
          width: 44,
          height: 44,
          borderRadius: 10,
          border: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
          cursor: 'pointer'
        }}
      >
        <MdMenu size={20} color="#3d2b1f" />
      </button>

      {/* Desktop sidebar - Fixed position */}
      <aside
        className="d-none d-lg-flex flex-column p-3 position-fixed top-0 start-0"
        data-collapsed={collapsed ? 'true' : 'false'}
        style={{
          width: collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH,
          height: '100vh',
          backgroundColor: COLORS.tea,
          borderRight: '1px solid rgba(0,0,0,0.06)',
          gap: 12,
          zIndex: 1000,
          transition: 'width 180ms ease, padding 180ms ease'
        }}
      >
        {!collapsed && (
          <div
            className="d-flex align-items-center justify-content-end gap-2 mb-3"
            style={{ padding: '4px 6px' }}
          >
            <div style={{ lineHeight: 1, textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: '#3d2b1f', fontSize: '0.9rem' }}>Arpella POS</div>
              <div style={{ fontSize: 11, color: '#5a4b3d' }}>Point of Sale</div>
            </div>
          </div>
        )}

        {collapsed && <div style={{ height: '60px' }}></div>}

        <nav className="d-flex flex-column" style={{ gap: 10, paddingTop: 6 }}>
          <RenderNavLink to="pos" Icon={MdPointOfSale} label="Point of Sale" />
          <RenderNavLink to="orders" Icon={MdListAlt} label="Orders" />
          <RenderNavLink to="reports" Icon={MdBarChart} label="Reports" />

          {/* Thermal settings link under Reports - use absolute path so routing resolves correctly */}
          <NavLink
            to="/app/dashboard/thermal-settings"
            className="d-flex align-items-center gap-3 nav-link-custom"
            title="Thermal Settings"
            style={{ textDecoration: 'none', color: '#3d2b1f' }}
          >
            <div className="nav-icon" aria-hidden>
              <MdPrint size={20} />
            </div>
            <div className="nav-label">Thermal Settings</div>
          </NavLink>
        </nav>

        {/* Branding image moved to bottom */}
        <div style={{ marginTop: 'auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 10,
              padding: collapsed ? '8px 0' : '8px',
            }}
          >
            <img
              src={logo}
              alt="Arpella logo"
              style={{
                width: collapsed ? 40 : 56,
                height: 'auto',
                borderRadius: 6,
                objectFit: 'contain',
                flexShrink: 0
              }}
            />
            {!collapsed && (
              <div style={{ color: '#3d2b1f' }}>
                <div style={{ fontWeight: 700 }}>Arpella</div>
                <div style={{ fontSize: 12, color: '#6b5b4a' }}>v1.0</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile sidebar (offcanvas) */}
      <Offcanvas show={sidebarOpen} onHide={() => setSidebarOpen(false)} placement="start">
        <Offcanvas.Header closeButton style={{ backgroundColor: COLORS.tea }}>
          <Offcanvas.Title style={{ color: '#3d2b1f' }}>
            <div className="d-flex align-items-center gap-2">
              <img src={logo} alt="Arpella logo" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />
              Arpella POS
            </div>
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body style={{ backgroundColor: COLORS.tea }}>
          <div className="d-flex flex-column gap-2">
            <NavLink to="pos" onClick={() => setSidebarOpen(false)} className="d-flex align-items-center gap-2 text-start btn btn-light" style={{ color: '#3d2b1f', borderRadius: 8 }}>
              <MdPointOfSale size={18} /> <span>Point of Sale</span>
            </NavLink>
            <NavLink to="orders" onClick={() => setSidebarOpen(false)} className="d-flex align-items-center gap-2 text-start btn btn-light" style={{ color: '#3d2b1f', borderRadius: 8 }}>
              <MdListAlt size={18} /> Orders
            </NavLink>
            <NavLink to="reports" onClick={() => setSidebarOpen(false)} className="d-flex align-items-center gap-2 text-start btn btn-light" style={{ color: '#3d2b1f', borderRadius: 8 }}>
              <MdBarChart size={18} /> Reports
            </NavLink>

            {/* Thermal settings link in mobile offcanvas - absolute path */}
            <NavLink to="/app/dashboard/thermal-settings" onClick={() => setSidebarOpen(false)} className="d-flex align-items-center gap-2 text-start btn btn-light" style={{ color: '#3d2b1f', borderRadius: 8 }}>
              <MdPrint size={18} /> Thermal Settings
            </NavLink>

            <div style={{ marginTop: 12, borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: 12 }}>
              <div className="d-flex align-items-center gap-2">
                <img src={logo} alt="Arpella logo" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />
                <div>
                  <div style={{ fontWeight: 700, color: '#3d2b1f' }}>Arpella</div>
                  <div style={{ fontSize: 12, color: '#6b5b4a' }}>v1.0</div>
                </div>
              </div>
            </div>
          </div>
        </Offcanvas.Body>
      </Offcanvas>

      {/* Main content area - With left margin to account for fixed sidebar */}
      <div className="d-flex flex-column" style={{ minHeight: '100vh', marginLeft: isDesktop ? (collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH) : 0 }}>
        {/* Top Header */}
        <header className="sticky-top" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', backgroundColor: COLORS.panel, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 999 }}>
          {/* Add left padding so floating hamburger doesn't overlap the title */}
          <div className="d-flex align-items-center justify-content-between px-3 py-3" style={{ paddingLeft: 70 }}>
            <div className="d-flex align-items-center gap-3">
              <h4 className="mb-0 fw-bold" style={{ color: '#3d2b1f', fontSize: '1.05rem' }}>Arpella</h4>
            </div>

            <div className="d-flex align-items-center gap-2">
              <div className="d-flex align-items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: 'rgba(214, 195, 164, 0.2)', border: '1px solid rgba(214, 195, 164, 0.3)'}}>
                <MdPerson size={20} style={{ color: '#3d2b1f' }} />
                <span style={{ fontWeight: 500, color: '#3d2b1f', fontSize: '0.95rem' }}>
                  {user[0]?.firstName ? `${user[0].firstName} ${user[0].lastName || ''}`.trim() : (user[0]?.userName || 'Arpella POS')}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-grow-1" style={{ overflow: 'auto', minHeight: 'calc(100vh - 70px)', backgroundColor: COLORS.bg, padding: 18 }}>
          {/* AutoLogout is implemented but currently disabled.
              To enable the inactivity auto-logout, uncomment the line below. */}
          { /* <AutoLogout timeoutMs={30 * 60 * 1000} warningMs={60 * 1000} /> */ }
          <Outlet />
        </main>
      </div>

      {/* Styles for nav appearance; kept inline to avoid touching other files */}
      <style jsx>{`
        /* base nav link */
        .nav-link-custom {
          transition: all 200ms ease;
          padding: 8px 12px;
          align-items: center;
          position: relative;
          border-radius: 12px;
          margin: 2px 0;
        }

        /* icon container */
        .nav-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          flex-shrink: 0;
          transition: all 200ms ease;
        }

        /* label text */
        .nav-label {
          font-weight: 600;
          transition: opacity 200ms ease, transform 200ms ease;
          font-size: 0.95rem;
        }

        /* CLEAN ACTIVE STATE - Clear blue background with white text */
        .nav-link-custom.active {
          background: ${COLORS.blue} !important;
          color: #ffffff !important;
          box-shadow: 0 4px 12px rgba(70,130,180,0.3);
        }

        /* active icon - white icon on blue background */
        .nav-link-custom.active .nav-icon {
          background: rgba(255,255,255,0.15);
          color: #ffffff;
        }

        /* active label - white text */
        .nav-link-custom.active .nav-label {
          color: #ffffff !important;
        }

        /* COLLAPSED ACTIVE STATE - No background, orange icon only */
        aside[data-collapsed="true"] .nav-link-custom.active {
          background: transparent !important;
          box-shadow: none !important;
        }

        aside[data-collapsed="true"] .nav-link-custom.active .nav-icon {
          background: transparent !important;
          color: ${COLORS.orange} !important;
        }

        /* hover state - subtle gray background */
        .nav-link-custom:hover:not(.active) {
          background: rgba(0,0,0,0.05);
          text-decoration: none;
        }

        .nav-link-custom:hover:not(.active) .nav-icon {
          background: rgba(0,0,0,0.08);
        }

        /* Remove hover effects when collapsed */
        aside[data-collapsed="true"] .nav-link-custom:hover:not(.active) {
          background: transparent;
        }

        aside[data-collapsed="true"] .nav-link-custom:hover:not(.active) .nav-icon {
          background: transparent;
        }

        /* collapsed (desktop) - hide labels and center icons */
        aside[data-collapsed="true"] .nav-label {
          opacity: 0;
          transform: translateX(-6px);
          width: 0;
          display: inline-block;
          pointer-events: none;
        }
        aside[data-collapsed="true"] .nav-link-custom {
          justify-content: center;
          padding: 8px 4px;
          margin: 2px 4px;
          width: calc(100% - 8px);
        }
        aside[data-collapsed="true"] .nav-icon {
          margin: 0;
        }

        /* small responsive tweaks */
        @media (max-width: 991px) {
          .nav-label { display: inline-block !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
    </div>
  );
}
