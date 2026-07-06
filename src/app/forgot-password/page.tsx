'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowRight, Mail, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

gsap.registerPlugin(useGSAP);

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.from('.login-bg-orb', { scale: 0, opacity: 0, duration: 1.2, stagger: 0.2 })
        .from('.login-logo', { y: 30, opacity: 0, duration: 0.6 }, '-=0.6')
        .from('.login-title', { y: 20, opacity: 0, duration: 0.5 }, '-=0.3')
        .from('.login-subtitle', { y: 20, opacity: 0, duration: 0.5 }, '-=0.3')
        .from('.login-card', { y: 40, opacity: 0, scale: 0.95, duration: 0.6 }, '-=0.2')
        .from('.login-field', { y: 20, opacity: 0, duration: 0.4, stagger: 0.1 }, '-=0.3');
    },
    { scope: containerRef }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to send reset email.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        padding: '1rem',
      }}
    >
      <div
        className="login-bg-orb"
        style={{
          position: 'absolute', top: '15%', left: '10%', width: '400px', height: '400px',
          borderRadius: '50%', background: 'radial-gradient(circle, hsl(217 91% 60% / 0.12), transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }}
      />
      <div
        className="login-bg-orb"
        style={{
          position: 'absolute', bottom: '10%', right: '10%', width: '350px', height: '350px',
          borderRadius: '50%', background: 'radial-gradient(circle, hsl(271 81% 65% / 0.10), transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }}
      />

      <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div className="login-logo" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', marginBottom: '1.5rem', position: 'relative' }}>
          <img src="/xine-logo-black.png" alt="Xine Logo" className="theme-light-logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          <img src="/xine-logo-white.png" alt="Xine Logo" className="theme-dark-logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        <h1 className="login-title" style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0', background: 'linear-gradient(135deg, var(--color-text-primary), var(--color-accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          Xine
        </h1>
        <h2 className="login-title" style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '1.5rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          by Unisource
        </h2>

        <p className="login-subtitle" style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', fontSize: '0.9375rem' }}>
          Reset your password
        </p>

        <div className="login-card glass-card" style={{ padding: '2rem', overflow: 'visible' }}>
          {success ? (
            <div className="login-field" style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'hsl(142 71% 45% / 0.1)', marginBottom: '1rem' }}>
                <CheckCircle2 size={32} style={{ color: 'hsl(142 71% 45%)' }} />
              </div>
              <h3 style={{ color: 'var(--color-text-primary)', fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Check your email
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                We've sent password reset instructions to <strong>{email}</strong>
              </p>
              <Link href="/login" className="btn-primary" style={{ width: '100%', display: 'inline-flex', justifyContent: 'center', textDecoration: 'none' }}>
                Back to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="login-field" style={{ marginBottom: '1rem' }}>
                <label htmlFor="email" style={{ display: 'block', textAlign: 'left', color: 'var(--color-text-secondary)', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                  <Mail size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.375rem' }} />
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="input-base"
                  autoFocus
                  required
                />
              </div>

              {error && (
                <div className="login-field" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginBottom: '1rem', padding: '0.5rem 0.75rem', background: 'var(--color-danger-subtle)', borderRadius: 'var(--radius-sm)', textAlign: 'left' }}>
                  {error}
                </div>
              )}

              <button type="submit" className="login-field btn-primary" disabled={loading || !email} style={{ width: '100%', marginBottom: '1rem' }}>
                {loading ? (
                  <span style={{ display: 'inline-block', width: '18px', height: '18px', border: '2px solid transparent', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                ) : (
                  <>Send Reset Instructions <ArrowRight size={18} /></>
                )}
              </button>

              <div className="login-field">
                <Link href="/login" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
      <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
