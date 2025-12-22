// src/app/dashboard/index.js
import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Offcanvas from 'react-bootstrap/Offcanvas';
import {
  MdPointOfSale,
  MdListAlt,
  MdBarChart,
  MdPerson,
  MdMenu,
  MdPrint
} from 'react-icons/md';
import logo from '../../assets/logo.jpeg';
import { useSelector } from 'react-redux';
import { selectUser } from '../../redux/slices/userSlice';
import { subscribe as subscribeToOrderPoller, clearNewFlag } from '../../services/orderPoller';

const COLORS = {
  tea: '#EAE2D4',
  orange: '#FF7F50',
  blue: '#4682B4',
  bg: '#F0EDE6',
  panel: '#FFFFFF'
};

export default function DashboardLayout() {
  const user = useSelector(selectUser);
  const location = useLocation();

  // determine initial desktop state safely (SSR-safe)
  const initialIsDesktop = typeof window !== 'undefined' ? window.innerWidth >= 992 : true;

  // default collapsed when on desktop
  const [isDesktop, setIsDesktop] = useState(initialIsDesktop);
  const [collapsed, setCollapsed] = useState(initialIsDesktop ? true : false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hasNewOrders, setHasNewOrders] = useState(false);
  const [newOrdersCount, setNewOrdersCount] = useState(0);

  const SIDEBAR_WIDTH = 260;
  const COLLAPSED_WIDTH = 76;

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 992);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // If the viewport becomes mobile, force expanded sidebar state off (use offcanvas)
  useEffect(() => {
    if (!isDesktop) setCollapsed(false);
    // when switching to desktop, we keep the previous collapsed state (default was collapsed)
  }, [isDesktop]);

  // Subscribe to order poller for new order notifications
  useEffect(() => {
    const unsubscribe = subscribeToOrderPoller((event) => {
      if (event.type === 'new') {
        setHasNewOrders(true);
        setNewOrdersCount(event.count || 1);
      } else if (event.type === 'state') {
        setHasNewOrders(event.hasNew);
        setNewOrdersCount(event.count || 0);
      } else if (event.type === 'cleared') {
        setHasNewOrders(false);
        setNewOrdersCount(0);
      }
    });

    return unsubscribe;
  }, []);

  // Clear new orders flag when navigating to orders page
  useEffect(() => {
    if (location.pathname.includes('/orders')) {
      if (hasNewOrders) {
        clearNewFlag();
        setHasNewOrders(false);
        setNewOrdersCount(0);
      }
    }
  }, [location.pathname, hasNewOrders]);

  function RenderNavLink({ to, Icon, label, badge }) {
    return (
      <NavLink
        to={to}
        className={({ isActive }) =>
          `d-flex align-items-center gap-3 nav-link-custom ${isActive ? 'active' : ''} ${badge ? 'nav-link-with-badge' : ''}`
        }
        title={label}
        style={({ isActive }) => ({
          textDecoration: 'none',
          color: isActive ? '#fff' : '#3d2b1f',
          position: 'relative'
        })}
      >
        <div className="nav-icon" aria-hidden>
          <Icon size={20} />
          {badge && badge > 0 && (
            <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>
          )}
        </div>
        <div className="nav-label">{label}</div>
      </NavLink>
    );
  }

  return (
    <div className="position-relative" style={{ minHeight: '100vh', backgroundColor: COLORS.bg }}>
      {/* Floating hamburger / collapse button */}
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
          <RenderNavLink to="/app/dashboard/pos" Icon={MdPointOfSale} label="Point of Sale" />
          <RenderNavLink 
            to="/app/dashboard/orders" 
            Icon={MdListAlt} 
            label="Orders" 
            badge={hasNewOrders ? newOrdersCount : 0}
          />
          <RenderNavLink to="/app/dashboard/reports" Icon={MdBarChart} label="Reports" />

          {/* Thermal settings link uses absolute path */}
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
            <NavLink to="/app/dashboard/pos" onClick={() => setSidebarOpen(false)} className="d-flex align-items-center gap-2 text-start btn btn-light" style={{ color: '#3d2b1f', borderRadius: 8 }}>
              <MdPointOfSale size={18} /> <span>Point of Sale</span>
            </NavLink>

            <NavLink to="/app/dashboard/orders" onClick={() => setSidebarOpen(false)} className="d-flex align-items-center gap-2 text-start btn btn-light position-relative" style={{ color: '#3d2b1f', borderRadius: 8 }}>
              <MdListAlt size={18} /> Orders
              {hasNewOrders && newOrdersCount > 0 && (
                <span 
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    backgroundColor: '#ff4444',
                    color: 'white',
                    borderRadius: '50%',
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 'bold'
                  }}
                >
                  {newOrdersCount > 99 ? '99+' : newOrdersCount}
                </span>
              )}
            </NavLink>

            <NavLink to="/app/dashboard/reports" onClick={() => setSidebarOpen(false)} className="d-flex align-items-center gap-2 text-start btn btn-light" style={{ color: '#3d2b1f', borderRadius: 8 }}>
              <MdBarChart size={18} /> Reports
            </NavLink>

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

      {/* Main content area */}
      <div className="d-flex flex-column" style={{ minHeight: '100vh', marginLeft: isDesktop ? (collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH) : 0 }}>
        <header className="sticky-top" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', backgroundColor: COLORS.panel, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 999 }}>
          <div className="d-flex align-items-center justify-content-between px-3 py-3" style={{ paddingLeft: isDesktop ? (collapsed ? 14 + COLLAPSED_WIDTH : 14 + SIDEBAR_WIDTH) : 14 }}>
            <div className="d-flex align-items-center gap-3">
              <h4 className="mb-0 fw-bold" style={{ color: '#3d2b1f', fontSize: '1.05rem' }}>Arpella</h4>
            </div>

            <div className="d-flex align-items-center gap-2">
              <div className="d-flex align-items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: 'rgba(214, 195, 164, 0.2)', border: '1px solid rgba(214, 195, 164, 0.3)'}}>
                <MdPerson size={20} style={{ color: '#3d2b1f' }} />
                <span style={{ fontWeight: 500, color: '#3d2b1f', fontSize: '0.95rem' }}>
                  {Array.isArray(user) ? (user[0]?.firstName ? `${user[0].firstName} ${user[0].lastName || ''}`.trim() : (user[0]?.userName || 'Arpella POS')) : (user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user?.userName || 'Arpella POS'))}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-grow-1" style={{ overflow: 'auto', minHeight: 'calc(100vh - 70px)', backgroundColor: COLORS.bg, padding: 18 }}>
          <Outlet />
        </main>
      </div>

      <style>{`
        .nav-link-custom {
          transition: all 200ms ease;
          padding: 8px 12px;
          align-items: center;
          position: relative;
          border-radius: 12px;
          margin: 2px 0;
        }

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
          position: relative;
        }

        .nav-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #ff4444;
          color: white;
          border-radius: 10px;
          min-width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: bold;
          padding: 0 5px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          z-index: 1;
        }

        .nav-link-with-badge {
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(255, 68, 68, 0);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(255, 68, 68, 0.2);
          }
        }

        .nav-label {
          font-weight: 600;
          transition: opacity 200ms ease, transform 200ms ease;
          font-size: 0.95rem;
        }

        .nav-link-custom.active {
          background: ${COLORS.blue} !important;
          color: #ffffff !important;
          box-shadow: 0 4px 12px rgba(70,130,180,0.3);
        }

        .nav-link-custom.active .nav-icon {
          background: rgba(255,255,255,0.15);
          color: #ffffff;
        }

        .nav-link-custom.active .nav-label {
          color: #ffffff !important;
        }

        .nav-link-custom.active .nav-badge {
          background: #ffffff;
          color: ${COLORS.blue};
        }

        aside[data-collapsed="true"] .nav-link-custom.active {
          background: transparent !important;
          box-shadow: none !important;
        }

        aside[data-collapsed="true"] .nav-link-custom.active .nav-icon {
          background: transparent !important;
          color: ${COLORS.orange} !important;
        }

        .nav-link-custom:hover:not(.active) {
          background: rgba(0,0,0,0.05);
          text-decoration: none;
        }

        .nav-link-custom:hover:not(.active) .nav-icon {
          background: rgba(0,0,0,0.08);
        }

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
      `}</style>
    </div>
  );
}
