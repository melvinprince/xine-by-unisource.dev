'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Filter, Plus, Trash2, X, PlusCircle, ArrowDown } from 'lucide-react';
import { LoadingState, ErrorState } from '@/components/DataStates';
import HelpTooltip from '@/components/HelpTooltip';
import FeatureGuide from '@/components/FeatureGuide';
import { useDashboardContext } from '@/components/DashboardContext';
import FunnelChart from '@/components/charts/FunnelChart';

gsap.registerPlugin(useGSAP);

interface Goal {
  id: string;
  name: string;
  type: string;
}

interface FunnelStep {
  goalId: string;
  name: string;
}

interface Funnel {
  id: string;
  name: string;
  steps: FunnelStep[];
  analytics?: {
    stepIndex: number;
    name: string;
    count: number;
    dropoffFromPrevious: number;
  }[];
}

export default function FunnelsPage() {
  const { selectedSite, dateRange } = useDashboardContext();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSteps, setNewSteps] = useState<FunnelStep[]>([{ goalId: '', name: '' }]);
  const [saving, setSaving] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!loading && !error) {
      gsap.from('.funnel-card', { y: 20, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'power3.out' });
    }
  }, [loading, error, funnels.length]);

  const fetchData = async () => {
    if (selectedSite === 'all') return;
    setLoading(true);
    try {
      const [fRes, gRes] = await Promise.all([
        fetch(`/api/dashboard/funnels?siteId=${selectedSite}&from=${dateRange.from}&to=${dateRange.to}`),
        fetch(`/api/sites/${selectedSite}/goals`)
      ]);
      if (!fRes.ok || !gRes.ok) throw new Error('Failed to load data');
      const fData = await fRes.json();
      const gData = await gRes.json();
      setFunnels(fData);
      setGoals(gData);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSite, dateRange]);

  const openModal = () => {
    setShowAdd(true);
    requestAnimationFrame(() => {
      if (overlayRef.current) gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
      if (modalRef.current) gsap.fromTo(modalRef.current, { y: 20, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' });
    });
  };

  const closeModal = () => {
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2 });
    gsap.to(modalRef.current, {
      y: 20, opacity: 0, scale: 0.95, duration: 0.25, ease: 'power2.in',
      onComplete: () => {
        setShowAdd(false);
        setNewName('');
        setNewSteps([{ goalId: '', name: '' }]);
      },
    });
  };

  const addStep = () => setNewSteps([...newSteps, { goalId: '', name: '' }]);
  const updateStep = (index: number, field: keyof FunnelStep, value: string) => {
    const updated = [...newSteps];
    updated[index][field] = value;
    setNewSteps(updated);
  };
  const removeStep = (index: number) => {
    if (newSteps.length > 1) {
      setNewSteps(newSteps.filter((_, i) => i !== index));
    }
  };

  const handleCreate = async () => {
    if (!newName || newSteps.some(s => !s.goalId || !s.name)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${selectedSite}/funnels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, steps: newSteps }),
      });
      if (!res.ok) throw new Error('Failed to save funnel');
      await fetchData();
      closeModal();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (funnelId: string) => {
    const el = document.getElementById(`funnel-${funnelId}`);
    if (el) {
      gsap.to(el, {
        scale: 0.9, opacity: 0, height: 0, marginTop: 0, duration: 0.3, onComplete: () => {
          fetch(`/api/sites/${selectedSite}/funnels/${funnelId}`, { method: 'DELETE' }).then(() => fetchData());
        }
      });
    }
  };

  if (selectedSite === 'all') {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <Filter size={48} style={{ color: 'var(--color-accent)', opacity: 0.5, marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>Select a Site</h2>
        <p style={{ color: 'var(--color-text-secondary)', maxWidth: '400px', margin: '0.5rem auto 0' }}>Funnels are tracked per site. Select one from the top.</p>
      </div>
    );
  }

  return (
    <div ref={pageRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Conversion Funnels <HelpTooltip title="Conversion Funnels" content="Define multi-step user journeys using goals. Track how many users complete each step and where they drop off." usage="Create goals first, then build funnels by chaining them as steps." /></h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>Analyze multi-step user journeys and identify drop-off points.</p>
        </div>
        <button className="btn-primary" onClick={openModal} disabled={goals.length === 0}>
          <Plus size={18} /> Add Funnel
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading Funnels..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : funnels.length === 0 ? (
        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', border: '1px solid var(--color-border-subtle)' }}>
            <Filter size={28} style={{ color: 'var(--color-text-muted)' }} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.5rem' }}>No funnels built yet</h3>
          {goals.length === 0 ? (
            <>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', maxWidth: '500px', margin: '0 auto' }}>
                Funnels require Goals to be defined first. Goals represent each step in the user journey.
              </p>
              <FeatureGuide
                title="How to Build a Funnel"
                steps={[
                  {
                    title: 'Create Goals first',
                    description: 'Go to the Goals page and create goals for each step in your conversion path (e.g. viewed product, added to cart, completed checkout).',
                  },
                  {
                    title: 'Come back and create a Funnel',
                    description: 'After creating goals, return here to chain them into ordered funnel steps.',
                  },
                  {
                    title: 'Analyze drop-off points',
                    description: 'The funnel will show how many users completed each step and where they dropped off, helping you optimize your conversion flow.',
                  },
                ]}
              />
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', maxWidth: '500px', margin: '0 auto' }}>
                You have {goals.length} goals ready. Create a funnel to track multi-step conversions.
              </p>
              <FeatureGuide
                title="How to Create a Funnel"
                steps={[
                  {
                    title: 'Click "Add Funnel" above',
                    description: 'Give your funnel a name that describes the user journey (e.g. "Checkout Flow", "Onboarding Funnel").',
                  },
                  {
                    title: 'Add steps in order',
                    description: 'Each step maps to a goal. Order them in the sequence users should follow. Example:',
                    code: 'Step 1: Viewed Product (pageview goal)\nStep 2: Added to Cart (event goal)\nStep 3: Completed Checkout (pageview goal)',
                  },
                  {
                    title: 'View conversion data',
                    description: 'The funnel chart shows how many users completed each step and the drop-off between steps.',
                  },
                ]}
              />
              <button className="btn-primary" onClick={openModal} style={{ marginTop: '1rem' }}>
                <Plus size={18} /> Create First Funnel
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          {funnels.map((funnel) => {
            const chartData = (funnel.analytics || []).map(a => ({
              label: a.name,
              value: a.count,
              percentage: a.dropoffFromPrevious > 0 ? -a.dropoffFromPrevious : 0, 
            }));
            
            return (
              <div key={funnel.id} id={`funnel-${funnel.id}`} className="funnel-card glass-card hover-glow" style={{ padding: '1.5rem', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{funnel.name}</h4>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                      {funnel.steps.length} steps defined
                    </div>
                  </div>
                  <button className="btn-ghost" onClick={() => handleDelete(funnel.id)} style={{ padding: '0.375rem', color: 'var(--color-text-muted)' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
                
                {funnel.analytics && funnel.analytics.length > 0 && chartData.length > 0 ? (
                  <FunnelChart data={chartData} title="Step Conversions" />
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>No data available for this range.</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div ref={overlayRef} onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div ref={modalRef} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '520px', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Create New Funnel</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Funnel Name</label>
                <input type="text" placeholder="e.g. Checkout Flow" className="input-base" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>Funnel Steps (Goals)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {newSteps.map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: 600, flexShrink: 0 }}>
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <input type="text" placeholder="Step Label (e.g. View Cart)" className="input-base" value={step.name} onChange={(e) => updateStep(idx, 'name', e.target.value)} />
                          <select className="input-base" value={step.goalId} onChange={(e) => updateStep(idx, 'goalId', e.target.value)}>
                            <option value="" disabled>Select a Goal...</option>
                            {goals.map(g => <option key={g.id} value={g.id}>{g.name} ({g.type})</option>)}
                          </select>
                        </div>
                        {newSteps.length > 1 && (
                          <button onClick={() => removeStep(idx)} style={{ padding: '0.5rem', color: 'var(--color-text-muted)', background: 'none', border: '1px solid transparent', cursor: 'pointer', borderRadius: 'var(--radius-md)' }}>
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      {idx < newSteps.length - 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.25rem 0' }}>
                          <ArrowDown size={16} style={{ color: 'var(--color-text-muted)' }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                <button onClick={addStep} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 500, marginTop: '1rem', cursor: 'pointer', padding: 0 }}>
                  <PlusCircle size={16} /> Add another step
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--color-border-subtle)' }}>
                <button className="btn-primary" onClick={handleCreate} disabled={!newName || newSteps.some(s => !s.goalId || !s.name) || saving}>
                  {saving ? 'Saving...' : 'Create Funnel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
