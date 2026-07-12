'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';

interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const EXPIRY_OPTIONS = [
  { label: 'Never expires', value: '' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '1 year', value: '365' },
];

export default function ApiTokensSection() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const mcpUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : 'https://YOUR_XINE_DOMAIN/api/mcp';

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/tokens');
      if (res.ok) setTokens(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(expiry ? { expiresInDays: Number(expiry) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create token');
      setNewToken(data.token);
      setName('');
      setExpiry('');
      setShowForm(false);
      fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    try {
      await fetch(`/api/dashboard/tokens/${tokenId}`, { method: 'DELETE' });
    } finally {
      setConfirmRevoke(null);
      fetchTokens();
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const codeBlockStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    background: 'var(--color-bg-overlay)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-md)',
    padding: '0.625rem 0.75rem',
    wordBreak: 'break-all',
    color: 'var(--color-text-primary)',
    flex: 1,
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
          gap: '1rem',
        }}
      >
        <SectionHeader title="API Tokens (MCP)" />
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)} style={{ padding: '0.375rem 0.75rem' }}>
          <Plus size={16} />
          Generate Token
        </button>
      </div>

      <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Explainer + connect snippet */}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start',
            color: 'var(--color-text-muted)',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
          }}
        >
          <Bot size={18} style={{ flexShrink: 0, marginTop: '0.125rem', color: 'var(--color-accent)' }} />
          <div>
            Connect AI assistants (Claude Code, Claude Desktop, and other MCP clients) to your analytics. Tokens grant
            the same site access you have in the dashboard. Connect with:
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
              <code style={codeBlockStyle}>
                claude mcp add --transport http xine {mcpUrl} --header &quot;Authorization: Bearer YOUR_TOKEN&quot;
              </code>
              <button
                className="btn-ghost"
                style={{ padding: '0.375rem' }}
                onClick={() =>
                  copy(
                    `claude mcp add --transport http xine ${mcpUrl} --header "Authorization: Bearer YOUR_TOKEN"`,
                    'snippet'
                  )
                }
                title="Copy command"
              >
                {copied === 'snippet' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* One-time token reveal */}
        {newToken && (
          <div
            style={{
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Token created — copy it now, it will not be shown again.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <code style={codeBlockStyle}>{newToken}</code>
              <button
                className="btn-ghost"
                style={{ padding: '0.375rem' }}
                onClick={() => copy(newToken, 'token')}
                title="Copy token"
              >
                {copied === 'token' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <button
              className="btn-ghost"
              style={{ alignSelf: 'flex-start', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => setNewToken(null)}
            >
              I&apos;ve saved it
            </button>
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="input-base"
              placeholder='Token name, e.g. "Claude Code"'
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              style={{ flex: 1, minWidth: '200px' }}
            />
            <select className="input-base" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button className="btn-primary" onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </button>
            {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.75rem', width: '100%' }}>{error}</div>}
          </div>
        )}

        {/* Token list */}
        {loading ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Loading tokens…</div>
        ) : tokens.length === 0 ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
            No API tokens yet. Generate one to connect an AI assistant.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {tokens.map((token) => (
              <div
                key={token.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.625rem 0',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <KeyRound size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {token.name}
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 400,
                        fontSize: '0.75rem',
                        color: 'var(--color-text-muted)',
                        marginLeft: '0.5rem',
                      }}
                    >
                      {token.token_prefix}…
                    </span>
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                    Created {new Date(token.created_at).toLocaleDateString()}
                    {' · '}
                    {token.last_used_at
                      ? `Last used ${new Date(token.last_used_at).toLocaleString()}`
                      : 'Never used'}
                    {token.expires_at && ` · Expires ${new Date(token.expires_at).toLocaleDateString()}`}
                  </div>
                </div>
                {confirmRevoke === token.id ? (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      className="btn-danger"
                      onClick={() => handleRevoke(token.id)}
                      style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                    >
                      Confirm
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => setConfirmRevoke(null)}
                      style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-danger"
                    onClick={() => setConfirmRevoke(token.id)}
                    style={{ padding: '0.375rem 0.625rem' }}
                    title="Revoke token"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
