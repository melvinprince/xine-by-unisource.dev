'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import ThemeToggle from './ThemeToggle';
import {
  LayoutDashboard,
  Globe,
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
  PlaySquare,
  Repeat,
  Bell,
  Search,
} from 'lucide-react';

gsap.registerPlugin(useGSAP);

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/realtime", label: "Realtime", icon: Radio },
  { href: "/dashboard/analytics", label: "Analytics", icon: Activity },
  { href: "/dashboard/performance", label: "Performance", icon: Gauge },
  { href: "/dashboard/behavior", label: "Behavior", icon: MousePointerClick },
  { href: "/dashboard/acquisition", label: "Acquisition", icon: Megaphone },
  { href: "/dashboard/seo", label: "SEO", icon: Search },
  { href: "/dashboard/goals", label: "Goals", icon: Target },
  { href: "/dashboard/retention", label: "Retention", icon: Repeat },
  { href: "/dashboard/funnels", label: "Funnels", icon: Filter },
  { href: "/dashboard/events", label: "Events", icon: Zap },
  { href: "/dashboard/annotations", label: "Annotations", icon: Tag },
  { href: "/dashboard/replay", label: "Session Replay", icon: PlaySquare },
  { href: "/dashboard/monitors", label: "Monitors", icon: Bell },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: '/dashboard/debug', label: 'Debug', icon: Bug },
];

interface SidebarProps {
  sites?: { id: string; name: string }[];
  onCollapse?: (collapsed: boolean) => void;
}

export default function Sidebar({ sites = [], onCollapse }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.fromTo(
        '.sidebar-nav-item',
        { x: -20, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.4, stagger: 0.06, ease: 'power2.out', delay: 0.3 }
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

  const isSiteActive = (siteId: string) =>
    pathname === `/dashboard/${siteId}`;

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
          // borderRight: '1px solid var(--color-border-subtle)',
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
            // borderBottom: '1px solid var(--color-border-subtle)',
            minHeight: '64px',
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

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            padding: '0.75rem',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          <div
            style={{
              marginBottom: '0.5rem',
              padding: collapsed
                ? '0.25rem 0'
                : '0.25rem 0.75rem',
            }}
          >
            {!collapsed && (
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-muted)',
                }}
              >
                Navigation
              </span>
            )}
          </div>

          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="sidebar-nav-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: collapsed
                    ? '0.625rem 0'
                    : '0.625rem 0.75rem',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  marginBottom: '0.25rem',
                  borderRadius: 'var(--radius-md)',
                  color: active
                    ? 'var(--color-accent)'
                    : 'var(--color-text-secondary)',
                  background: active
                    ? 'var(--color-accent-subtle)'
                    : 'transparent',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: active ? 600 : 400,
                  transition:
                    'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                  whiteSpace: 'nowrap',
                }}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={20} style={{ flexShrink: 0 }} />
                {!collapsed && item.label}
              </Link>
            );
          })}

          {/* Sites Section */}
          {sites.length > 0 && (
            <>
              <div
                style={{
                  marginTop: '1.25rem',
                  marginBottom: '0.5rem',
                  padding: collapsed
                    ? '0.25rem 0'
                    : '0.25rem 0.75rem',
                }}
              >
                {!collapsed && (
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    Sites
                  </span>
                )}
              </div>
              {sites.map((site) => {
                const active = isSiteActive(site.id);
                return (
                  <Link
                    key={site.id}
                    href={`/dashboard/${site.id}`}
                    className="sidebar-nav-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: collapsed
                        ? '0.625rem 0'
                        : '0.625rem 0.75rem',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      marginBottom: '0.25rem',
                      borderRadius: 'var(--radius-md)',
                      color: active
                        ? 'var(--color-accent)'
                        : 'var(--color-text-secondary)',
                      background: active
                        ? 'var(--color-accent-subtle)'
                        : 'transparent',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: active ? 600 : 400,
                      transition:
                        'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                      whiteSpace: 'nowrap',
                    }}
                    title={collapsed ? site.name : undefined}
                  >
                    <Globe size={18} style={{ flexShrink: 0 }} />
                    {!collapsed && site.name}
                  </Link>
                );
              })}
            </>
          )}
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
              padding: '0.625rem 0.75rem',
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

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: '0.75rem',
              width: '100%',
              padding: '0.625rem 0.75rem',
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

      <style jsx global>{`
        @media (max-width: 768px) {
          .sidebar-mobile-toggle {
            display: flex !important;
          }
          .sidebar-container {
            transform: translateX(-280px);
          }
          .sidebar-collapse-btn {
            display: none !important;
          }
          .sidebar-mobile-close {
            display: flex !important;
          }
        }
      `}</style>
    </>
  );
}
