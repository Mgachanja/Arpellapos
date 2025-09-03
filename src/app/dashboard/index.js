// src/app/dashboard/index.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { MdPointOfSale, MdListAlt, MdBarChart, MdPerson, MdMenu, MdPrint } from 'react-icons/md';
import logo from '../../assets/logo.jpeg';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser, logout as logoutAction } from '../../redux/slices/userSlice';
/**
 * Dashboard layout with auto-logout on inactivity.
 *
 * How it works:
 * - Resets on user activity events (mousemove, keydown, touchstart, click, scroll)
 * - Uses localStorage key "arpella:lastActivity" so activity in another tab resets timers here too.
 * - Shows a warning modal `warningMs` before automatic logout; user can choose to stay signed in.
 * - On timeout dispatches logout() and navigates to "/login" (adjust if you use a different login route).
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
  console.log(selectUser)
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

  /* ----------------- AutoLogout component (embedded) ----------------- */
  function AutoLogout({ timeoutMs = 30 * 60 * 1000, warningMs =  60 * 1000 }) {
    // Configurable: timeoutMs = inactivity timeout, warningMs = how long before expiry to show modal
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [showWarning, setShowWarning] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(Math.ceil(warningMs / 1000));
    const warningTimerRef = useRef(null);
    const logoutTimerRef = useRef(null);
    const lastActivityKey = 'arpella:lastActivity';

    // helper: get now in ms
    const now = () => Date.now();

    // set last activity in localStorage (used for cross-tab)
    const setLastActivity = useCallback((ts = now()) => {
      try {
        localStorage.setItem(lastActivityKey, String(ts));
      } catch (e) {
        // ignore storage errors (private mode)
      }
    }, []);

    // read last activity
    const getLastActivity = useCallback(() => {
      try {
        const v = localStorage.getItem(lastActivityKey);
        return v ? Number(v) : null;
      } catch {
        return null;
      }
    }, []);

    // clear timers
    const clearAll = useCallback(() => {
      if (warningTimerRef.current) { clearInterval(warningTimerRef.current); warningTimerRef.current = null; }
      if (logoutTimerRef.current) { clearTimeout(logoutTimerRef.current); logoutTimerRef.current = null; }
      setShowWarning(false);
    }, []);

    // perform logout
    const performLogout = useCallback(() => {
      clearAll();
      dispatch(logoutAction());
      // navigate to login (adjust route if different). You may want /login or '/'
      navigate('/login', { replace: true });
    }, [dispatch, navigate, clearAll]);

    // start new timers based on lastActivity timestamp
    const scheduleTimers = useCallback((lastTs) => {
      clearAll();
      const elapsed = Math.max(0, now() - (lastTs || now()));
      const timeLeft = Math.max(0, timeoutMs - elapsed);

      if (timeLeft <= 0) {
        // already expired -> sign out immediately
        performLogout();
        return;
      }

      // If timeLeft longer than warningMs, schedule warning to appear at (timeLeft - warningMs)
      const showWarningIn = Math.max(0, timeLeft - warningMs);

      // schedule logout
      logoutTimerRef.current = setTimeout(() => {
        // showWarning may already be visible if logout fired after warning countdown
        clearAll();
        performLogout();
      }, timeLeft);

      // schedule the warning (if warningMs > 0)
      if (warningMs > 0) {
        // start a timeout to show warning then a countdown interval
        setTimeout(() => {
          setShowWarning(true);
          setSecondsLeft(Math.ceil(warningMs / 1000));
          // countdown interval
          warningTimerRef.current = setInterval(() => {
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

    // reset activity: update lastActivity and reschedule timers
    const resetActivity = useCallback((ts = now()) => {
      setLastActivity(ts);
      scheduleTimers(ts);
    }, [setLastActivity, scheduleTimers]);

    // activity events handler
    const activityHandler = useCallback(() => resetActivity(now()), [resetActivity]);

    // storage event handler (cross-tabs)
    const storageHandler = useCallback((ev) => {
      if (!ev.key) return;
      if (ev.key === lastActivityKey) {
        const last = getLastActivity();
        if (last) scheduleTimers(last);
      }
    }, [getLastActivity, scheduleTimers]);

    // mount/unmount
    useEffect(() => {
      if (!user) {
        // not logged in - do nothing
        return () => {};
      }
        console.log("test test",user)

      // initial set
      resetActivity(now());

      // attach events
      const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click', 'scroll', 'wheel'];
      events.forEach((name) => window.addEventListener(name, activityHandler, { passive: true }));

      // visibility change: if tab becomes visible, re-check lastActivity
      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          const last = getLastActivity();
          if (last) scheduleTimers(last);
          else resetActivity(now());
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      // storage for cross-tab
      window.addEventListener('storage', storageHandler);

      // cleanup
      return () => {
        events.forEach((name) => window.removeEventListener(name, activityHandler));
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('storage', storageHandler);
        clearAll();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, activityHandler, storageHandler, resetActivity, scheduleTimers, getLastActivity, clearAll]);

    // If user logs out elsewhere, hide modal
    useEffect(() => {
      if (!user) {
        clearAll();
      }
    }, [user, clearAll]);

    // Expose "stay signed in" to cancel timers and reset
    const staySignedIn = () => {
      setShowWarning(false);
      setSecondsLeft(Math.ceil(warningMs / 1000));
      resetActivity(now());
    };

    // render warning modal
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
                  No activity detected. You will be logged out in <strong>{secondsLeft}s</strong>.
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
                  {/* show the user name safely; if not available show 'Test Username' */}
                  {user[0]?.firstName ? `${user[0].firstName} ${user[0].lastName || ''}`.trim() : (user[0]?.userName || 'Arpella POS')}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-grow-1" style={{ overflow: 'auto', minHeight: 'calc(100vh - 70px)', backgroundColor: COLORS.bg, padding: 18 }}>
          {/* AutoLogout runs here so it's active while dashboard layout is mounted */}
          <AutoLogout timeoutMs={30 * 60 * 1000} warningMs={60 * 1000} />
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
