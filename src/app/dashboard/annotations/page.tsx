'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Tag, Plus, Trash2, X } from 'lucide-react';
import { LoadingState, ErrorState } from '@/components/DataStates';
import HelpTooltip from '@/components/HelpTooltip';
import FeatureGuide from '@/components/FeatureGuide';
import { useDashboardContext } from '@/components/DashboardContext';

gsap.registerPlugin(useGSAP);

interface Annotation {
  id: string;
  text: string;
  date: string;
  category: string;
}

export default function AnnotationsPage() {
  const { selectedSite } = useDashboardContext();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newCategory, setNewCategory] = useState('note');
  const [saving, setSaving] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!loading && !error) {
      gsap.from('.annotation-card', { y: 20, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'power3.out' });
    }
  }, [loading, error, annotations.length]);

  const fetchData = async () => {
    if (selectedSite === 'all') return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${selectedSite}/annotations`);
      if (!res.ok) throw new Error('Failed to load annotations');
      const data = await res.json();
      setAnnotations(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSite]);

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
        setNewText('');
        setNewDate(new Date().toISOString().slice(0, 10));
        setNewCategory('note');
      },
    });
  };

  const handleCreate = async () => {
    if (!newText || !newDate) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${selectedSite}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText, date: newDate, category: newCategory }),
      });
      if (!res.ok) throw new Error('Failed to save annotation');
      await fetchData();
      closeModal();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const el = document.getElementById(`annotation-${id}`);
    if (el) {
      gsap.to(el, {
        scale: 0.9, opacity: 0, height: 0, marginTop: 0, duration: 0.3, onComplete: () => {
          fetch(`/api/sites/${selectedSite}/annotations/${id}`, { method: 'DELETE' }).then(() => fetchData());
        }
      });
    }
  };

  if (selectedSite === 'all') {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <Tag size={48} style={{ color: 'var(--color-accent)', opacity: 0.5, marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>Select a Site</h2>
        <p style={{ color: 'var(--color-text-secondary)', maxWidth: '400px', margin: '0.5rem auto 0' }}>Annotations apply to specific sites. Select one from the top.</p>
      </div>
    );
  }

  return (
    <div ref={pageRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Chart Annotations <HelpTooltip title="Annotations" content="Timeline markers for significant events. Annotations help you correlate traffic changes with real-world events like deployments, campaigns, or outages." />
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>Document deployments, marketing campaigns, or site outages to trace metric impacts.</p>
        </div>
        <button className="btn-primary" onClick={openModal}>
          <Plus size={18} /> Add Annotation
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading Annotations..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : annotations.length === 0 ? (
        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', border: '1px solid var(--color-border-subtle)' }}>
            <Tag size={28} style={{ color: 'var(--color-text-muted)' }} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.5rem' }}>No annotations</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', maxWidth: '500px', margin: '0 auto' }}>
            Mark important dates on your analytics timeline to correlate traffic changes with real-world events.
          </p>
          <FeatureGuide
            title="When to Use Annotations"
            steps={[
              {
                title: 'Deployments & Releases',
                description: 'Mark when you pushed new code or launched a new feature. Helps you see if changes improved or hurt traffic.',
                code: 'Category: Deploy / Release\nExample: "Launched v2.0 redesign"',
              },
              {
                title: 'Marketing Campaigns',
                description: 'Record when you started or stopped ad campaigns, email blasts, or social media pushes.',
                code: 'Category: Marketing Campaign\nExample: "Started Google Ads — $500/day"',
              },
              {
                title: 'Site Outages & Issues',
                description: 'Document any downtime, server migrations, or DNS changes that could affect metrics.',
                code: 'Category: Site Outage\nExample: "Server migration — 2hr downtime"',
              },
              {
                title: 'General Notes',
                description: 'Anything else worth remembering — blog posts published, partnerships announced, seasonal events.',
                code: 'Category: Note\nExample: "Published viral blog post"',
              },
            ]}
          />
          <button className="btn-primary" onClick={openModal} style={{ marginTop: '1.5rem' }}>
            <Plus size={18} /> Create Annotation
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {annotations.map((ann) => (
            <div key={ann.id} id={`annotation-${ann.id}`} className="annotation-card glass-card hover-glow" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border-subtle)' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {new Date(ann.date).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>{ann.text}</h4>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-accent)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    {ann.category}
                  </div>
                </div>
              </div>
              <button className="btn-ghost" onClick={() => handleDelete(ann.id)} style={{ padding: '0.5rem', color: 'var(--color-text-muted)' }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div ref={overlayRef} onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div ref={modalRef} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Add Annotation</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Description</label>
                <input type="text" placeholder="e.g. Launched v2.0" className="input-base" value={newText} onChange={(e) => setNewText(e.target.value)} autoFocus />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Date</label>
                <input type="date" className="input-base" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Category</label>
                <select className="input-base" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                  <option value="note">Note</option>
                  <option value="deploy">Deploy / Release</option>
                  <option value="campaign">Marketing Campaign</option>
                  <option value="outage">Site Outage</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
                <button className="btn-primary" onClick={handleCreate} disabled={!newText || !newDate || saving}>
                  {saving ? 'Saving...' : 'Save Annotation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
