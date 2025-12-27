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

const COLORS = {
  tea: '#EAE2D4',
  bg: '#F0EDE6',
  panel: '#FFFFFF',
  text: '#3d2b1f',
};

export default function DashboardLayout() {
  const user = useSelector(selectUser);
  const location = useLocation();

  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 992);
  const [collapsed, setCollapsed] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const SIDEBAR_WIDTH = 260;
  const COLLAPSED_WIDTH = 64;

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 992);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg }}>
      {/* DESKTOP SIDEBAR */}
      <aside
        className="d-none d-lg-flex flex-column position-fixed top-0 start-0"
        style={{
          width: collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH,
          height: '100vh',
          background: COLORS.tea,
          transition: 'width 200ms ease',
          borderRight: '1px solid rgba(0,0,0,.08)',
          zIndex: 1000
        }}
      >
        {/* MENU OPENER — CENTERED */}
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center', // 👈 CENTERED LEFT ↔ RIGHT
            borderBottom: '1px solid rgba(0,0,0,.05)'
          }}
        >
          <button
            onClick={() => setCollapsed(c => !c)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: 'none',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(0,0,0,.12)'
            }}
            title="Toggle menu"
          >
            <MdMenu size={22} color={COLORS.text} />
          </button>
        </div>

        {/* NAV */}
        <nav className="d-flex flex-column p-2 gap-2">
          <NavItem to="/app/dashboard/pos" icon={MdPointOfSale} label="POS" collapsed={collapsed} />
          <NavItem to="/app/dashboard/orders" icon={MdListAlt} label="Orders" collapsed={collapsed} />
          <NavItem to="/app/dashboard/reports" icon={MdBarChart} label="Reports" collapsed={collapsed} />
          <NavItem to="/app/dashboard/thermal-settings" icon={MdPrint} label="Thermal" collapsed={collapsed} />
        </nav>

        {/* FOOTER */}
        <div style={{ marginTop: 'auto', padding: 12, textAlign: 'center' }}>
          <img src={logo} alt="logo" style={{ width: collapsed ? 36 : 56 }} />
          {!collapsed && (
            <div style={{ fontSize: 12, marginTop: 6, color: COLORS.text }}>
              Arpella POS
            </div>
          )}
        </div>
      </aside>

      {/* MOBILE OFFCANVAS */}
      <Offcanvas show={sidebarOpen} onHide={() => setSidebarOpen(false)}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Menu</Offcanvas.Title>
        </Offcanvas.Header>
      </Offcanvas>

      {/* MAIN */}
      <div
        style={{
          marginLeft: isDesktop ? (collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH) : 0,
          transition: 'margin-left 200ms ease'
        }}
      >
        <header
          style={{
            background: COLORS.panel,
            padding: 16,
            borderBottom: '1px solid rgba(0,0,0,.06)'
          }}
        >
          <div className="d-flex justify-content-between align-items-center">
            <strong>Arpella</strong>
            <div className="d-flex align-items-center gap-2">
              <MdPerson />
              <span>{user?.userName || 'User'}</span>
            </div>
          </div>
        </header>

        <main style={{ padding: 16 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, collapsed }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 10,
        textDecoration: 'none',
        color: '#3d2b1f',
        background: isActive ? 'rgba(0,0,0,.08)' : 'transparent',
        justifyContent: collapsed ? 'center' : 'flex-start'
      })}
    >
      <Icon size={20} />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}
