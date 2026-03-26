'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Plus,
  Trash2,
  X,
  Globe,
  Settings,
  Calendar,
  ExternalLink,
  CheckCircle2,
  ShieldAlert,
  ShieldOff,
} from 'lucide-react';
import IntegrationSnippet from '@/components/IntegrationSnippet';
import { LoadingState } from '@/components/DataStates';
import { useDashboardContext } from '@/components/DashboardContext';
import type { Site } from '@/lib/types';

gsap.registerPlugin(useGSAP);

export default function SettingsPage() {
  const { sites, sitesLoading, refetchSites } = useDashboardContext();
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState<Site | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteDomain, setNewSiteDomain] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [activeTab, setActiveTab] = useState<'integration' | 'features'>('integration');
  
  const pageRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from('.settings-section', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power3.out',
      });
    },
    { scope: pageRef }
  );

  const openModal = (type: 'add' | 'detail', site?: Site) => {
    if (type === 'add') setShowAdd(true);
    if (type === 'detail' && site) {
      setShowDetail(site);
      setActiveTab('integration');
    }
    requestAnimationFrame(() => {
      if (overlayRef.current) {
        gsap.fromTo(
          overlayRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 0.25 }
        );
      }
      if (modalRef.current) {
        gsap.fromTo(
          modalRef.current,
          { y: 20, opacity: 0, scale: 0.95 },
          {
            y: 0,
            opacity: 1,
            scale: 1,
            duration: 0.35,
            ease: 'power2.out',
          }
        );
      }
    });
  };

  const closeModal = () => {
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2 });
    gsap.to(modalRef.current, {
      y: 20,
      opacity: 0,
      scale: 0.95,
      duration: 0.25,
      ease: 'power2.in',
      onComplete: () => {
        setShowAdd(false);
        setShowDetail(null);
        setNewSiteName('');
        setNewSiteDomain('');
        setAddError('');
      },
    });
  };

  const handleAddSite = async () => {
    if (!newSiteName || !newSiteDomain) return;
    setAddLoading(true);
    setAddError('');
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSiteName, domain: newSiteDomain }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create site');
      }
      refetchSites();
      closeModal();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (siteId: string) => {
    try {
      const res = await fetch(`/api/sites/${siteId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        throw new Error('Failed to delete site');
      }
      const el = document.getElementById(`site-row-${siteId}`);
      if (el) {
        gsap.to(el, {
          x: -30,
          opacity: 0,
          height: 0,
          padding: 0,
          margin: 0,
          duration: 0.35,
          ease: 'power2.in',
          onComplete: () => {
            refetchSites();
            setShowDeleteConfirm(null);
          },
        });
      } else {
        refetchSites();
        setShowDeleteConfirm(null);
      }
    } catch {
      refetchSites();
      setShowDeleteConfirm(null);
    }
  };

  if (sitesLoading) return <LoadingState message="Loading sites..." />;

  return (
    <div ref={pageRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div
        className="settings-section"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              margin: 0,
            }}
          >
            Site Management
          </h2>
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--color-text-secondary)',
              margin: '0.25rem 0 0',
            }}
          >
            Add, remove, and manage tracked websites
          </p>
        </div>
        <button className="btn-primary" onClick={() => openModal('add')}>
          <Plus size={18} />
          Add Site
        </button>
      </div>

      {/* Sites List */}
      <div className="settings-section glass-card" style={{ overflow: 'hidden' }}>
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <h3
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              margin: 0,
            }}
          >
            Tracked Sites ({sites.length})
          </h3>
        </div>

        {sites.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
            }}
          >
            <Globe size={40} style={{ marginBottom: '1rem', opacity: 0.3 }} />
            <p>No sites added yet. Click &quot;Add Site&quot; to get started.</p>
          </div>
        ) : (
          <div>
            {sites.map((site) => (
              <div
                key={site.id}
                id={`site-row-${site.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '1rem 1.5rem',
                  gap: '1rem',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--color-bg-overlay)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                {/* Site Icon */}
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-accent-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-accent)',
                    flexShrink: 0,
                  }}
                >
                  <Globe size={20} />
                </div>

                {/* Site Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.9375rem',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {site.name}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginTop: '0.125rem',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <ExternalLink size={11} />
                      {site.domain}
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <Calendar size={11} />
                      {new Date(site.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn-ghost"
                    onClick={() => openModal('detail', site)}
                    style={{ padding: '0.375rem 0.75rem' }}
                  >
                    <Settings size={14} />
                    <span className="hide-mobile">Settings</span>
                  </button>
                  {showDeleteConfirm === site.id ? (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        className="btn-danger"
                        onClick={() => handleDelete(site.id)}
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                      >
                        Confirm
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => setShowDeleteConfirm(null)}
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-danger"
                      onClick={() => setShowDeleteConfirm(site.id)}
                      style={{ padding: '0.375rem 0.625rem' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Banned Logins Manager ── */}
      <BannedLoginsManager />

      {/* ── Modal Overlay ──────────────────────────────── */}
      {(showAdd || showDetail) && (
        <div
          ref={overlayRef}
          onClick={closeModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            ref={modalRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '560px',
              background: 'var(--color-bg-raised)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                }}
              >
                {showAdd ? 'Add New Site' : showDetail?.name}
              </h3>
              <button
                onClick={closeModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ overflowY: 'auto', padding: '1.5rem', flex: 1 }}>
              {showAdd ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        color: 'var(--color-text-secondary)',
                        marginBottom: '0.375rem',
                      }}
                    >
                      Site Name
                    </label>
                    <input
                      type="text"
                      placeholder="My Website"
                      className="input-base"
                      value={newSiteName}
                      onChange={(e) => setNewSiteName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        color: 'var(--color-text-secondary)',
                        marginBottom: '0.375rem',
                      }}
                    >
                      Domain
                    </label>
                    <input
                      type="text"
                      placeholder="example.com"
                      className="input-base"
                      value={newSiteDomain}
                      onChange={(e) => setNewSiteDomain(e.target.value)}
                    />
                  </div>
                  {addError && (
                    <p style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', margin: 0 }}>
                      {addError}
                    </p>
                  )}
                  <button
                    className="btn-primary"
                    onClick={handleAddSite}
                    disabled={!newSiteName || !newSiteDomain || addLoading}
                    style={{ marginTop: '0.5rem' }}
                  >
                    <Plus size={18} />
                    {addLoading ? 'Adding...' : 'Add Site'}
                  </button>
                </div>
              ) : showDetail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Tabs */}
                  <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <button
                      onClick={() => setActiveTab('integration')}
                      style={{
                        padding: '0.5rem 0.25rem',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'integration' ? '2px solid var(--color-accent)' : '2px solid transparent',
                        color: activeTab === 'integration' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        fontWeight: activeTab === 'integration' ? 600 : 500,
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      Integration
                    </button>
                    <button
                      onClick={() => setActiveTab('features')}
                      style={{
                        padding: '0.5rem 0.25rem',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'features' ? '2px solid var(--color-accent)' : '2px solid transparent',
                        color: activeTab === 'features' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        fontWeight: activeTab === 'features' ? 600 : 500,
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      Feature Toggles
                    </button>
                  </div>

                  {activeTab === 'integration' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--color-text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            marginBottom: '0.375rem',
                          }}
                        >
                          API Key
                        </label>
                        <code
                          style={{
                            display: 'block',
                            padding: '0.625rem 0.875rem',
                            background: 'var(--color-bg-base)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border-subtle)',
                            color: 'var(--color-chart-2)',
                            fontSize: '0.8125rem',
                            fontFamily: 'monospace',
                            wordBreak: 'break-all',
                          }}
                        >
                          {showDetail.api_key}
                        </code>
                      </div>
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--color-text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            marginBottom: '0.5rem',
                          }}
                        >
                          Integration Code
                        </label>
                        <IntegrationSnippet apiKey={showDetail.api_key} />
                      </div>
                      <div
                        style={{
                          padding: '0.75rem 1rem',
                          background: 'var(--color-accent-subtle)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '0.8125rem',
                          color: 'var(--color-text-secondary)',
                          lineHeight: 1.5,
                        }}
                      >
                        <strong style={{ color: 'var(--color-accent)' }}>
                          Tip:
                        </strong>{' '}
                        Paste the snippet above into your HTML{' '}
                        <code
                          style={{
                            padding: '0.125rem 0.375rem',
                            background: 'var(--color-bg-base)',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                          }}
                        >
                          {'<head>'}
                        </code>{' '}
                        tag. For Next.js, add it to your{' '}
                        <code
                          style={{
                            padding: '0.125rem 0.375rem',
                            background: 'var(--color-bg-base)',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                          }}
                        >
                          layout.tsx
                        </code>
                        .
                      </div>
                      
                      <hr style={{ borderColor: 'var(--color-border-subtle)', margin: '1rem 0' }} />
                      
                      {/* Advanced Settings */}
                      <div>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '1rem' }}>Data Portability & Sharing</h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--color-bg-raised)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)' }}>
                          
                          {/* Public Dashboard */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>Public Dashboard</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Allow anyone with the link to view analytics (read-only)</div>
                              {showDetail.is_public && (
                                <a href={`/share/${showDetail.id}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--color-accent)', display: 'block', marginTop: '0.25rem' }}>View Public Link &rarr;</a>
                              )}
                            </div>
                            <button 
                              onClick={async () => {
                                await fetch(`/api/sites/${showDetail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_public: !showDetail.is_public }) });
                                setShowDetail({...showDetail, is_public: !showDetail.is_public});
                                refetchSites();
                              }}
                              style={{ width: '36px', height: '20px', borderRadius: '10px', background: showDetail.is_public ? 'var(--color-accent)' : 'var(--color-border-subtle)', position: 'relative', transition: 'background 0.2s' }}
                            >
                               <div style={{ position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transform: showDetail.is_public ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                            </button>
                          </div>
                          
                          <div style={{ height: '1px', background: 'var(--color-border-subtle)' }} />

                          {/* REST API Enable */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>API Data Export Access</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Generate a secret token for retrieving stats via REST API</div>
                              {showDetail.api_access_enabled && (
                                <div style={{ marginTop: '0.5rem' }}>
                                  <label style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', display: 'block' }}>Server API Key (Keep Secret)</label>
                                  <code style={{ fontSize: '0.75rem', padding: '0.5rem', background: 'var(--color-bg-base)', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', display: 'block', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                                    {showDetail.server_api_key}
                                  </code>
                                </div>
                              )}
                            </div>
                            <button 
                              onClick={async () => {
                                await fetch(`/api/sites/${showDetail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_access_enabled: !showDetail.api_access_enabled }) });
                                setShowDetail({...showDetail, api_access_enabled: !showDetail.api_access_enabled});
                                refetchSites();
                              }}
                              style={{ width: '36px', height: '20px', borderRadius: '10px', background: showDetail.api_access_enabled ? 'var(--color-accent)' : 'var(--color-border-subtle)', position: 'relative', transition: 'background 0.2s' }}
                            >
                               <div style={{ position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transform: showDetail.api_access_enabled ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                            </button>
                          </div>

                          {/* API Usage Documentation */}
                          {showDetail.api_access_enabled && (
                            <>
                              <div style={{ height: '1px', background: 'var(--color-border-subtle)' }} />
                              <div style={{ padding: '0 0.25rem' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>API Usage</label>
                                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 0.5rem', lineHeight: 1.5 }}>
                                  Fetch your analytics data programmatically. Send a GET request with your server API key as a Bearer token:
                                </p>
                                <pre style={{ padding: '0.75rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', fontSize: '0.7rem', fontFamily: "'Fira Code', monospace", color: 'var(--color-chart-3)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, lineHeight: 1.6 }}>
{`curl -H "Authorization: Bearer ${showDetail.server_api_key}" \
  "${typeof window !== 'undefined' ? window.location.origin : 'https://your-analytics-domain.com'}/api/v1/stats?siteId=${showDetail.id}&from=2025-01-01&to=2025-12-31"`}
                                </pre>
                                <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: '0.5rem 0 0', lineHeight: 1.4 }}>
                                  Returns: visitors, pageviews, bounce rate, timeseries, top pages, sources, devices, browsers, and locations.
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <SiteFeaturesForm siteId={showDetail.id} />
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media (max-width: 640px) {
          .hide-mobile {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

// Separate component for the features form to manage its own loading/saving state
function SiteFeaturesForm({ siteId }: { siteId: string }) {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/sites/${siteId}/settings`)
      .then(res => res.json())
      .then(data => {
        setFeatures(data);
        setLoading(false);
      });
  }, [siteId]);

  const toggleFeature = (key: string) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/sites/${siteId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features)
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading settings...</div>;
  }

  const featureGroups = [
    {
      title: "Core Enhancements",
      items: [
        { key: "web_vitals", label: "Web Vitals Tracking", description: "Record LCP, FCP, CLS, and INP metrics.", size: "~0.5KB" },
        { key: "js_errors", label: "JavaScript Error Tracking", description: "Capture unhandled runtime exceptions.", size: "~0.2KB" },
        { key: "scroll_depth", label: "Scroll Depth Logging", description: "Track 25%, 50%, 75%, 100% scroll milestones.", size: "~0.2KB" },
      ]
    },
    {
      title: "Advanced Interactions",
      items: [
        { key: "outbound_clicks", label: "Outbound Links", description: "Automatically detect clicks to external domains.", size: "~0.1KB" },
        { key: "click_tracking", label: "Click Tracking", description: "Track clicks on prominent interactive elements.", size: "~0.2KB" },
        { key: "rage_clicks", label: "Rage Click Detection", description: "Detect frustrated rapid-clicks.", size: "~0.2KB" },
      ]
    },
    {
      title: "Premium Features",
      items: [
        { key: "custom_events", label: "Custom Events API", description: "Allow tracking via window.wa.track()", size: "0KB" },
        { key: "file_downloads", label: "File Downloads", description: "Auto track clicks on document/media URLs.", size: "~0.1KB" },
        { key: "form_abandonment", label: "Form Abandonment", description: "Capture form inputs when unsubmitted.", size: "~0.1KB" },
        { key: "session_replay", label: "Session Replay", description: "Record and playback user interactions.", size: "~2.0KB" },
      ]
    }
  ];

  // Calculate estimated script sizes
  const BASE_RAW_KB = 1.2;
  const GZIP_RATIO = 0.58; // typical gzip ratio for JS
  const featureSizes: Record<string, number> = {
    web_vitals: 0.5, js_errors: 0.2, scroll_depth: 0.2,
    outbound_clicks: 0.1, click_tracking: 0.2, rage_clicks: 0.2,
    custom_events: 0, file_downloads: 0.1, form_abandonment: 0.1,
    session_replay: 2.0,
  };

  const enabledRaw = Object.entries(features)
    .filter(([, v]) => v)
    .reduce((sum, [k]) => sum + (featureSizes[k] || 0), 0);
  const totalRawKB = BASE_RAW_KB + enabledRaw;
  const totalGzipKB = +(totalRawKB * GZIP_RATIO).toFixed(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Script size display */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Estimated script size</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-accent)' }}>{totalGzipKB}KB</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>gzipped</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-border-subtle)' }}>|</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{totalRawKB.toFixed(1)}KB</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>raw</span>
          </div>
        </div>
        <div style={{ fontSize: '0.6875rem', color: totalGzipKB > 3 ? 'var(--color-warning)' : 'var(--color-success)', fontWeight: 600, padding: '0.25rem 0.625rem', borderRadius: '1rem', background: totalGzipKB > 3 ? 'rgba(255,171,0,0.1)' : 'rgba(0,200,83,0.1)' }}>
          {totalGzipKB > 3 ? '⚠ Heavy' : '✓ Lightweight'}
        </div>
      </div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: 0 }}>
        Enable or disable tracking modules. The base script is ~1.2KB raw (~0.7KB gzipped). Additional modules are loaded from the config endpoint.
      </p>

      {featureGroups.map((group, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {group.title}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--color-border-subtle)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {group.items.map(item => (
              <div 
                key={item.key} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem', 
                  background: 'var(--color-bg-raised)',
                  cursor: 'pointer'
                }}
                onClick={() => toggleFeature(item.key)}
              >
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                    {item.description}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.65rem', padding: '0.125rem 0.375rem', background: 'var(--color-bg-base)', borderRadius: '1rem', color: 'var(--color-text-muted)' }}>
                    {item.size}
                  </span>
                  
                  {/* Toggle Switch */}
                  <div 
                    style={{ 
                      width: '36px', height: '20px', borderRadius: '10px', 
                      background: features[item.key] ? 'var(--color-accent)' : 'var(--color-border-subtle)',
                      position: 'relative', transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ 
                      position: 'absolute', top: '2px', left: '2px', 
                      width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                      transform: features[item.key] ? 'translateX(16px)' : 'translateX(0)',
                      transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--color-border-subtle)' }}>
        <button 
          className="btn-primary" 
          onClick={handleSave} 
          disabled={saving}
          style={{ width: '100px', justifyContent: 'center' }}
        >
          {saving ? 'Saving...' : saved ? <><CheckCircle2 size={16}/> Saved</> : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ── Banned Logins Manager ──
interface BannedLogin {
  id: string;
  ip: string;
  user_agent: string;
  reason: string;
  banned_at: string;
}

function BannedLoginsManager() {
  const [bans, setBans] = useState<BannedLogin[]>([]);
  const [loading, setLoading] = useState(true);
  const [unbanConfirm, setUnbanConfirm] = useState<string | null>(null);
  const [unbanning, setUnbanning] = useState<string | null>(null);

  const fetchBans = async () => {
    try {
      const res = await fetch('/api/dashboard/banned-logins');
      if (res.ok) {
        const data = await res.json();
        setBans(data);
      }
    } catch (err) {
      console.error('Failed to fetch bans:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBans();
  }, []);

  const handleUnban = async (id: string) => {
    setUnbanning(id);
    try {
      const res = await fetch(`/api/dashboard/banned-logins?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setBans(prev => prev.filter(b => b.id !== id));
      }
    } catch (err) {
      console.error('Failed to unban:', err);
    } finally {
      setUnbanning(null);
      setUnbanConfirm(null);
    }
  };

  // Parse browser from user-agent string
  const parseBrowser = (ua: string) => {
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    return 'Unknown';
  };

  const parseOS = (ua: string) => {
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return 'Unknown';
  };

  return (
    <div className="settings-section glass-card" style={{ overflow: 'hidden' }}>
      <div
        style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldAlert size={18} style={{ color: 'var(--color-danger)' }} />
          <h3
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              margin: 0,
            }}
          >
            Banned IPs & Devices ({bans.length})
          </h3>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Login lockdown · 3 failed attempts = permanent ban
        </span>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading banned entries...
        </div>
      ) : bans.length === 0 ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <ShieldOff size={36} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
          <p style={{ margin: 0 }}>No banned IPs or devices. All clear!</p>
        </div>
      ) : (
        <div>
          {bans.map((ban) => (
            <div
              key={ban.id}
              id={`ban-row-${ban.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '1rem 1.5rem',
                gap: '1rem',
                borderBottom: '1px solid var(--color-border-subtle)',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-overlay)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Ban Icon */}
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-danger-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-danger)',
                  flexShrink: 0,
                }}
              >
                <ShieldAlert size={20} />
              </div>

              {/* Ban Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
                  {ban.ip}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginTop: '0.125rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>{parseBrowser(ban.user_agent)} · {parseOS(ban.user_agent)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Calendar size={11} />
                    {new Date(ban.banned_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', opacity: 0.7 }}>
                  {ban.reason}
                </div>
              </div>

              {/* Unban Action */}
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {unbanConfirm === ban.id ? (
                  <>
                    <button
                      className="btn-primary"
                      onClick={() => handleUnban(ban.id)}
                      disabled={unbanning === ban.id}
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                    >
                      {unbanning === ban.id ? 'Removing...' : 'Confirm'}
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => setUnbanConfirm(null)}
                      style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-ghost"
                    onClick={() => setUnbanConfirm(ban.id)}
                    style={{ padding: '0.375rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <ShieldOff size={14} />
                    <span className="hide-mobile">Unban</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
