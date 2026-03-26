'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Target,
  Plus,
  Trash2,
  X,
  Activity,
  Clock,
  MousePointer2,
} from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '@/components/DataStates';
import HelpTooltip from '@/components/HelpTooltip';
import FeatureGuide from '@/components/FeatureGuide';
import { useDashboardContext } from '@/components/DashboardContext';

gsap.registerPlugin(useGSAP);

interface Goal {
  id: string;
  name: string;
  type: string;
  condition: string;
  target: string;
  conversions: number;
  rate: string;
}

export default function GoalsPage() {
  const { selectedSite, dateRange } = useDashboardContext();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('pageview');
  const [newCondition, setNewCondition] = useState('equals');
  const [newTarget, setNewTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!loading && !error) {
      gsap.from('.goal-card', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power3.out',
      });
    }
  }, [loading, error, goals.length]);

  const fetchGoals = async () => {
    if (selectedSite === 'all') return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/goals?siteId=${selectedSite}&from=${dateRange.from}&to=${dateRange.to}`
      );
      if (!res.ok) throw new Error('Failed to load goals');
      const data = await res.json();
      setGoals(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, [selectedSite, dateRange]);

  const openModal = () => {
    setShowAdd(true);
    requestAnimationFrame(() => {
      if (overlayRef.current) {
        gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
      }
      if (modalRef.current) {
        gsap.fromTo(
          modalRef.current,
          { y: 20, opacity: 0, scale: 0.95 },
          { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' }
        );
      }
    });
  };

  const closeModal = () => {
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2 });
    gsap.to(modalRef.current, {
      y: 20, opacity: 0, scale: 0.95, duration: 0.25, ease: 'power2.in',
      onComplete: () => {
        setShowAdd(false);
        setNewName('');
        setNewType('pageview');
        setNewCondition('equals');
        setNewTarget('');
      },
    });
  };

  const handleAddGoal = async () => {
    if (!newName || !newTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${selectedSite}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          type: newType,
          condition: newCondition,
          target: newTarget,
        }),
      });
      if (!res.ok) throw new Error('Failed to save goal');
      await fetchGoals();
      closeModal();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (goalId: string) => {
    const el = document.getElementById(`goal-${goalId}`);
    if (el) {
      gsap.to(el, {
        scale: 0.9, opacity: 0, height: 0, marginTop: 0, duration: 0.3, onComplete: () => {
          fetch(`/api/sites/${selectedSite}/goals/${goalId}`, { method: 'DELETE' })
            .then(() => fetchGoals());
        }
      });
    }
  };

  if (selectedSite === 'all') {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <Target size={48} style={{ color: 'var(--color-accent)', opacity: 0.5, marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>Select a Site</h2>
        <p style={{ color: 'var(--color-text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
          Goals are tracked on a per-site basis. Please select a specific site from the top dropdown to view or manage its goals.
        </p>
      </div>
    );
  }

  return (
    <div ref={pageRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Goals & Conversions
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
            Track destination page views, custom events, and duration milestones.
          </p>
        </div>
        <button className="btn-primary" onClick={openModal}>
          <Plus size={18} /> Add Goal
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading Goals..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchGoals} />
      ) : goals.length === 0 ? (
        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', border: '1px solid var(--color-border-subtle)' }}>
            <Target size={28} style={{ color: 'var(--color-text-muted)' }} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.5rem' }}>No goals defined</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', maxWidth: '500px', margin: '0 auto 0', lineHeight: 1.6 }}>
            Goals let you track specific user actions as conversions.
          </p>
          <FeatureGuide
            title="How to Set Up Goals"
            steps={[
              {
                title: 'Page Destination Goal',
                description: 'Tracks when a visitor reaches a specific URL. Use for thank-you pages, signup confirmations, or checkout success pages.',
                code: 'Type: pageview\nCondition: contains\nTarget: /thank-you',
              },
              {
                title: 'Custom Event Goal',
                description: 'Tracks when your code fires a specific event via wa.track(). First, add event tracking to your code, then create a goal matching the event name.',
                code: "Type: event\nCondition: equals\nTarget: purchase_completed\n\n// In your site's JS:\nwa.track('purchase_completed')",
              },
              {
                title: 'Duration Goal',
                description: 'Tracks sessions lasting longer than a threshold (in seconds). Useful for measuring deep engagement.',
                code: 'Type: duration\nCondition: greater_than\nTarget: 120  (2 minutes)',
              },
              {
                title: 'Click Goal',
                description: 'Tracks clicks on specific elements. Target should match the CSS selector or element ID you want to track.',
                code: 'Type: click\nCondition: equals\nTarget: #signup-button',
              },
            ]}
          />
          <button className="btn-primary" onClick={openModal} style={{ marginTop: '1.5rem' }}>
            <Plus size={18} /> Create First Goal
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {goals.map((goal) => {
            const Icon = goal.type === 'pageview' ? MousePointer2 : goal.type === 'duration' ? Clock : Activity;
            return (
              <div
                key={goal.id}
                id={`goal-${goal.id}`}
                className="goal-card glass-card hover-glow"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '1.5rem',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{goal.name}</h4>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.125rem' }}>
                        {goal.type}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn-ghost"
                    onClick={() => handleDelete(goal.id)}
                    style={{ padding: '0.375rem', color: 'var(--color-text-muted)', marginTop: '-0.25rem', marginRight: '-0.25rem' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div style={{ background: 'var(--color-bg-base)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--color-border-subtle)' }}>
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{goal.condition.replace('_', ' ')}</span>
                  <code style={{ background: 'var(--color-bg-raised)', padding: '0.125rem 0.375rem', borderRadius: '4px', color: 'var(--color-chart-1)' }}>{goal.target}</code>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '1.25rem', marginTop: 'auto' }}>
                  <div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Conversions</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1 }}>{goal.conversions.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Rate</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1 }}>{goal.rate}%</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal Overlay ──────────────────────────────── */}
      {showAdd && (
        <div
          ref={overlayRef}
          onClick={closeModal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div
            ref={modalRef}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '480px', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Create New Goal</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Goal Name</label>
                <input type="text" placeholder="e.g. Completed Checkout" className="input-base" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Tracking Type</label>
                  <select className="input-base" value={newType} onChange={(e) => { setNewType(e.target.value); setNewCondition(e.target.value === 'duration' ? 'greater_than' : 'equals'); }}>
                    <option value="pageview">Pageview (URL destination)</option>
                    <option value="event">Custom Event (wa.track)</option>
                    <option value="duration">Session Duration</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Condition</label>
                  <select className="input-base" value={newCondition} onChange={(e) => setNewCondition(e.target.value)}>
                    {newType === 'duration' ? (
                      <option value="greater_than">Greater than (seconds)</option>
                    ) : (
                      <>
                        <option value="equals">Equals exactly</option>
                        <option value="starts_with">Starts with</option>
                        <option value="contains">Contains block</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                  Target {newType === 'duration' ? '(Seconds)' : newType === 'pageview' ? '(Pathname)' : '(Event Name)'}
                </label>
                <input 
                  type={newType === 'duration' ? 'number' : 'text'} 
                  placeholder={newType === 'duration' ? '120' : newType === 'pageview' ? '/checkout/success' : 'Signed Up'} 
                  className="input-base" 
                  value={newTarget} 
                  onChange={(e) => setNewTarget(e.target.value)} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--color-border-subtle)', marginTop: '0.5rem' }}>
                <button className="btn-primary" onClick={handleAddGoal} disabled={!newName || !newTarget || saving}>
                  {saving ? 'Saving...' : 'Create Goal'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
