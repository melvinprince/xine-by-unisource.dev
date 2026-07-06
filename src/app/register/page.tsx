'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Lock, ArrowRight, Eye, EyeOff, User, Mail } from 'lucide-react';

gsap.registerPlugin(useGSAP);

function RegisterForm() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.from('.login-bg-orb', {
        scale: 0,
        opacity: 0,
        duration: 1.2,
        stagger: 0.2,
      })
        .from(
          '.login-logo',
          { y: 30, opacity: 0, duration: 0.6 },
          '-=0.6'
        )
        .from(
          '.login-title',
          { y: 20, opacity: 0, duration: 0.5 },
          '-=0.3'
        )
        .from(
          '.login-subtitle',
          { y: 20, opacity: 0, duration: 0.5 },
          '-=0.3'
        )
        .from(
          '.login-card',
          {
            y: 40,
            opacity: 0,
            scale: 0.95,
            duration: 0.6,
          },
          '-=0.2'
        )
        .from(
          '.login-field',
          { y: 20, opacity: 0, duration: 0.4, stagger: 0.1 },
          '-=0.3'
        );

      tl.eventCallback('onComplete', () => {
        gsap.set('.login-bg-orb, .login-logo, .login-title, .login-subtitle, .login-card, .login-field', {
          clearProps: 'opacity,transform',
        });
      });
    },
    { scope: containerRef }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, token }),
      });

      const data = await res.json();

      if (res.ok) {
        gsap.to('.login-card', {
          y: -20,
          opacity: 0,
          scale: 0.95,
          duration: 0.4,
          ease: 'power2.in',
          onComplete: () => router.push('/dashboard'),
        });
      } else {
        setError(data.error || 'Failed to register. Please try again.');
        gsap.fromTo(
          '.login-card',
          { x: -10 },
          { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }
        );
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
          position: 'absolute',
          top: '15%',
          left: '10%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(217 91% 60% / 0.12), transparent 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />
      <div
        className="login-bg-orb"
        style={{
          position: 'absolute',
          bottom: '10%',
          right: '10%',
          width: '350px',
          height: '350px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(271 81% 65% / 0.10), transparent 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          className="login-logo"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            marginBottom: '1.5rem',
            position: 'relative'
          }}
        >
          <img src="/xine-logo-black.png" alt="Xine Logo" className="theme-light-logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          <img src="/xine-logo-white.png" alt="Xine Logo" className="theme-dark-logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        <h1
          className="login-title"
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            marginBottom: '0',
            background: 'linear-gradient(135deg, var(--color-text-primary), var(--color-accent))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.02em',
            lineHeight: 1.2
          }}
        >
          Xine
        </h1>
        <h2 
          className="login-title" 
          style={{ 
            fontSize: '0.9rem', 
            color: 'var(--color-text-muted)', 
            fontWeight: 600, 
            marginBottom: '1.5rem', 
            letterSpacing: '0.08em', 
            textTransform: 'uppercase' 
          }}
        >
          by Unisource
        </h2>

        <p
          className="login-subtitle"
          style={{
            color: 'var(--color-text-secondary)',
            marginBottom: '2rem',
            fontSize: '0.9375rem',
          }}
        >
          Create your account to accept the invitation
        </p>

        <form onSubmit={handleSubmit}>
          <div
            className="login-card glass-card"
            style={{ padding: '2rem', overflow: 'visible' }}
          >
            {/* Name Field */}
            <div className="login-field" style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="name"
                style={{
                  display: 'block',
                  textAlign: 'left',
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <User
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-muted)',
                  }}
                />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  className="input-base"
                  style={{ paddingLeft: '2.5rem' }}
                  required
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="login-field" style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  textAlign: 'left',
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-muted)',
                  }}
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="input-base"
                  style={{ paddingLeft: '2.5rem' }}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="login-field" style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  textAlign: 'left',
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-muted)',
                  }}
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  className="input-base"
                  style={{ paddingLeft: '2.5rem', paddingRight: '2.75rem' }}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    display: 'flex',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                className="login-field"
                style={{
                  color: 'var(--color-danger)',
                  fontSize: '0.8125rem',
                  marginBottom: '1rem',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--color-danger-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'left',
                }}
              >
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="login-field btn-primary"
              disabled={loading || !password || !name || !email}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              {loading ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: '18px',
                    height: '18px',
                    border: '2px solid transparent',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                  }}
                />
              ) : (
                <>
                  Create Account
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </form>

        <p
          className="login-field"
          style={{
            marginTop: '1.5rem',
            color: 'var(--color-text-muted)',
            fontSize: '0.75rem',
          }}
        >
          Already have an account?{' '}
          <a href="/login" style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>
            Log in
          </a>
        </p>
      </div>

      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
