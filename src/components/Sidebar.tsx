'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useDashboardContext } from './DashboardContext';
import ThemeToggle from './ThemeToggle';
import {
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Bug,
  Activity,
  Gauge,
  MousePointerClick,
  Megaphone,
  Radio,
  Target,
  Filter,
  Zap,
  Tag,
  Repeat,
  Bell,
  Search,
  Play,
} from 'lucide-react';

gsap.registerPlugin(useGSAP);

/* ── Navigation grouped by purpose ───────────────────────── */
const navGroups = [
  {
    label: 'Core Analytics',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/dashboard/realtime', label: 'Realtime', icon: Radio },
      { href: '/dashboard/analytics', label: 'Analytics', icon: Activity },
    ],
  },
  {
    label: 'User Insights',
    items: [
      { href: '/dashboard/behavior', label: 'Behavior', icon: MousePointerClick },
      { href: '/dashboard/retention', label: 'Retention', icon: Repeat },
      { href: '/dashboard/replay', label: 'Session Replay', icon: Play },
    ],
  },
  {
    label: 'Conversion',
    items: [
      { href: '/dashboard/goals', label: 'Goals', icon: Target },
      { href: '/dashboard/funnels', label: 'Funnels', icon: Filter },
      { href: '/dashboard/events', label: 'Events', icon: Zap },
    ],
  },
  {
    label: 'Performance & SEO',
    items: [
      { href: '/dashboard/performance', label: 'Web Vitals', icon: Gauge },
      { href: '/dashboard/seo', label: 'SEO', icon: Search },
      { href: '/dashboard/acquisition', label: 'Acquisition', icon: Megaphone },
      { href: '/dashboard/monitors', label: 'Monitors', icon: Bell },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { href: '/dashboard/annotations', label: 'Annotations', icon: Tag },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
      { href: '/dashboard/debug', label: 'Debug', icon: Bug },
    ],
  },
];

interface SidebarProps {
  sites?: { id: string; name: string }[];
  onCollapse?: (collapsed: boolean) => void;
}

export default function Sidebar({ onCollapse }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useDashboardContext();
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.fromTo(
        '.nav-item',
        { x: -16, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.35, stagger: 0.03, ease: 'power2.out', delay: 0.2 }
      );
    },
    { scope: sidebarRef }
  );

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (sidebarRef.current) {
      gsap.to(sidebarRef.current, {
        width: next ? 72 : 260,
        duration: 0.35,
        ease: 'power2.inOut',
      });
    }
    onCollapse?.(next);
  };

  const toggleMobile = () => {
    if (!mobileOpen) {
      setMobileOpen(true);
      gsap.fromTo(
        overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.3 }
      );
      gsap.fromTo(
        sidebarRef.current,
        { x: -280 },
        { x: 0, duration: 0.35, ease: 'power2.out' }
      );
    } else {
      gsap.to(overlayRef.current, { opacity: 0, duration: 0.25 });
      gsap.to(sidebarRef.current, {
        x: -280,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => setMobileOpen(false),
      });
    }
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={toggleMobile}
        className="sidebar-mobile-toggle"
        aria-label="Open sidebar"
        style={{
          position: 'fixed',
          top: '1rem',
          left: '1rem',
          zIndex: 60,
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          background: 'var(--color-bg-raised)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
        }}
      >
        <Menu size={20} />
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          ref={overlayRef}
          onClick={toggleMobile}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 40,
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className="sidebar-container"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: collapsed ? 72 : 260,
          background: 'var(--color-bg-base)',
          borderRight: '1px solid var(--color-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
          overflow: 'hidden',
          transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Logo Area */}
        <div
          style={{
            padding: collapsed ? '1.25rem 0.75rem' : '0 1.25rem 0 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            minHeight: '64px',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              flexShrink: 0,
              position: 'relative'
            }}
          >
            <img src="/xine-logo-black.png" alt="Xine Logo" className="theme-light-logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            <img src="/xine-logo-white.png" alt="Xine Logo" className="theme-dark-logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          {!collapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '36px' }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '1.125rem',
                  whiteSpace: 'nowrap',
                  background:
                    'linear-gradient(135deg, var(--color-text-primary), var(--color-accent))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  lineHeight: 1.1,
                  letterSpacing: '-0.01em'
                }}
              >
                Xine
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--color-text-muted)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                by Unisource
              </span>
            </div>
          )}

          {/* Mobile close button */}
          <button
            onClick={toggleMobile}
            className="sidebar-mobile-close"
            style={{
              marginLeft: 'auto',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {navGroups.map((group) => (
            <div key={group.label}>
              {/* Group Label */}
              {!collapsed && (
                <div className="nav-group-label">
                  {group.label}
                </div>
              )}
              {collapsed && (
                <div style={{ height: '1px', background: 'var(--color-border-subtle)', margin: '0.75rem 0.5rem 0.5rem' }} />
              )}

              {/* Group Items */}
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${active ? 'active' : ''}`}
                    style={{
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      padding: collapsed ? '0.5rem 0' : undefined,
                    }}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={18} style={{ flexShrink: 0 }} />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom Section */}
        <div
          style={{
            padding: '0.75rem',
            borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          <ThemeToggle collapsed={collapsed} />

          {/* Collapse Toggle (desktop) */}
          <button
            onClick={toggleCollapse}
            className="sidebar-collapse-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: '0.75rem',
              width: '100%',
              padding: '0.5rem 0.75rem',
              marginBottom: '0.25rem',
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              fontSize: '0.8125rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            {!collapsed && 'Collapse'}
          </button>

          {/* User Profile */}
          {user && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: '0.75rem',
                width: '100%',
                padding: '0.5rem 0.75rem',
                marginBottom: '0.25rem',
                background: 'var(--color-bg-raised)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                marginTop: '0.5rem'
              }}
              title={collapsed ? user.email : undefined}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'var(--color-accent)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  flexShrink: 0
                }}
              >
                {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
              </div>
              {!collapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {user.name || 'User'}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {user.email}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: '0.75rem',
              width: '100%',
              padding: '0.5rem 0.75rem',
              background: 'none',
              border: 'none',
              color: 'var(--color-danger)',
              fontSize: '0.8125rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <LogOut size={18} />
            {!collapsed && 'Logout'}
          </button>
        </div>
      </aside>
    </>
  );
}
