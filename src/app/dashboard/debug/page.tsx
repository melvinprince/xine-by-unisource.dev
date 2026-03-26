'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Bug,
    Database,
    Clock,
    Server,
    RefreshCw,
    CheckCircle,
    XCircle,
    Globe,
    Activity,
    Zap,
    ToggleLeft,
    ToggleRight,
} from 'lucide-react';

interface DiagnosticsData {
    timestamp: string;
    serverTimeUTC: string;
    serverTimeLocal: string;
    nodeVersion: string;
    nodeEnv: string;
    dbHost: string;
    dbName: string;
    dbConnected: boolean;
    dbConnectionTest?: string;
    dbConnectionError?: string;
    tableCounts?: {
        sites: number;
        pageviews: number;
        events: number;
    };
    dataDateRange?: {
        earliest: string | null;
        latest: string | null;
    };
    latestPageviews?: Array<{
        id: number;
        url: string;
        visitor_id: string;
        session_id: string;
        browser: string;
        country: string;
        device: string;
        duration: number;
        created_at: string;
    }>;
    latestEvents?: Array<{
        id: number;
        name: string;
        url: string | null;
        visitor_id: string;
        created_at: string;
    }>;
    sites?: Array<{
        id: string;
        name: string;
        domain: string;
        created_at: string;
    }>;
    pageviewsLast7Days?: Array<{
        date: string;
        count: number;
    }>;
    [key: string]: unknown;
}

function formatTimeAgo(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export default function DebugPage() {
    const [data, setData] = useState<DiagnosticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastFetched, setLastFetched] = useState<Date | null>(null);

    const fetchDiagnostics = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/debug');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setData(json);
            setLastFetched(new Date());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch diagnostics');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDiagnostics();
    }, [fetchDiagnostics]);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchDiagnostics, 10000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchDiagnostics]);

    // ---- Styles ----
    const cardStyle: React.CSSProperties = {
        background: 'var(--color-bg-raised)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.8125rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--color-text-muted)',
    };

    const valueStyle: React.CSSProperties = {
        fontSize: '1.75rem',
        fontWeight: 700,
        color: 'var(--color-text-primary)',
        fontVariantNumeric: 'tabular-nums',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '0.75rem',
        color: 'var(--color-text-muted)',
    };

    const rowStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 0',
        borderBottom: '1px solid var(--color-border-subtle)',
        fontSize: '0.8125rem',
    };

    const tableHeaderStyle: React.CSSProperties = {
        fontSize: '0.6875rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--color-text-muted)',
        padding: '0.5rem 0.75rem',
        textAlign: 'left',
    };

    const tableCellStyle: React.CSSProperties = {
        padding: '0.625rem 0.75rem',
        fontSize: '0.8125rem',
        color: 'var(--color-text-secondary)',
        borderTop: '1px solid var(--color-border-subtle)',
    };

    const badgeStyle = (color: string): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.2rem 0.6rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: color === 'green'
            ? 'rgba(34, 197, 94, 0.15)'
            : 'rgba(239, 68, 68, 0.15)',
        color: color === 'green' ? '#22c55e' : '#ef4444',
    });

    if (error && !data) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '1rem' }}>
                <XCircle size={48} color="#ef4444" />
                <h2 style={{ color: 'var(--color-text-primary)', margin: 0 }}>Failed to Load Diagnostics</h2>
                <p style={{ color: 'var(--color-text-muted)' }}>{error}</p>
                <button
                    onClick={fetchDiagnostics}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.625rem 1.25rem',
                        background: 'var(--color-accent)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-md, 8px)',
                        cursor: 'pointer',
                        fontWeight: 600,
                    }}
                >
                    <RefreshCw size={16} /> Retry
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '40px', height: '40px',
                        borderRadius: 'var(--radius-md, 8px)',
                        background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                    }}>
                        <Bug size={22} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            Server Diagnostics
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                            {lastFetched ? `Last fetched: ${lastFetched.toLocaleTimeString()}` : 'Loading...'}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {/* Auto-refresh toggle */}
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 0.875rem',
                            background: autoRefresh ? 'rgba(34, 197, 94, 0.15)' : 'var(--color-bg-raised)',
                            color: autoRefresh ? '#22c55e' : 'var(--color-text-secondary)',
                            border: `1px solid ${autoRefresh ? 'rgba(34, 197, 94, 0.3)' : 'var(--color-border-subtle)'}`,
                            borderRadius: 'var(--radius-md, 8px)',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {autoRefresh ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        Auto (10s)
                    </button>

                    {/* Manual refresh */}
                    <button
                        onClick={fetchDiagnostics}
                        disabled={loading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 1rem',
                            background: 'var(--color-accent)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 'var(--radius-md, 8px)',
                            cursor: loading ? 'wait' : 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            opacity: loading ? 0.7 : 1,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        {loading ? 'Loading...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {data && (
                <>
                    {/* Row 1: Connection + Server Info */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
                        {/* DB Connection */}
                        <div style={cardStyle}>
                            <div style={headerStyle}><Database size={14} /> Database</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={badgeStyle(data.dbConnected ? 'green' : 'red')}>
                                    {data.dbConnected
                                        ? <><CheckCircle size={12} /> Connected</>
                                        : <><XCircle size={12} /> Disconnected</>}
                                </span>
                            </div>
                            <div style={labelStyle}>Host: {data.dbHost}</div>
                            <div style={labelStyle}>Database: {data.dbName}</div>
                            {data.dbConnectionError && (
                                <div style={{
                                    padding: '0.5rem 0.75rem',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: 'var(--radius-md, 8px)',
                                    fontSize: '0.75rem',
                                    color: '#ef4444',
                                    wordBreak: 'break-all',
                                }}>
                                    {data.dbConnectionError}
                                </div>
                            )}
                        </div>

                        {/* Server Time */}
                        <div style={cardStyle}>
                            <div style={headerStyle}><Clock size={14} /> Server Time</div>
                            <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
                                {new Date(data.timestamp).toLocaleString()}
                            </div>
                            <div style={labelStyle}>UTC: {data.serverTimeUTC}</div>
                            <div style={labelStyle}>Local: {data.serverTimeLocal}</div>
                        </div>

                        {/* Environment */}
                        <div style={cardStyle}>
                            <div style={headerStyle}><Server size={14} /> Environment</div>
                            <div style={rowStyle}>
                                <span style={{ color: 'var(--color-text-muted)' }}>Node.js</span>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{data.nodeVersion}</span>
                            </div>
                            <div style={rowStyle}>
                                <span style={{ color: 'var(--color-text-muted)' }}>Environment</span>
                                <span style={badgeStyle(data.nodeEnv === 'production' ? 'green' : 'red')}>{data.nodeEnv}</span>
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Table Counts */}
                    {data.tableCounts && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem' }}>
                            <div style={cardStyle}>
                                <div style={headerStyle}><Globe size={14} /> Sites</div>
                                <div style={valueStyle}>{data.tableCounts.sites.toLocaleString()}</div>
                            </div>
                            <div style={cardStyle}>
                                <div style={headerStyle}><Activity size={14} /> Pageviews</div>
                                <div style={valueStyle}>{data.tableCounts.pageviews.toLocaleString()}</div>
                                {data.dataDateRange && (
                                    <div style={labelStyle}>
                                        {data.dataDateRange.earliest
                                            ? `${new Date(data.dataDateRange.earliest).toLocaleDateString()} → ${new Date(data.dataDateRange.latest!).toLocaleDateString()}`
                                            : 'No data'}
                                    </div>
                                )}
                            </div>
                            <div style={cardStyle}>
                                <div style={headerStyle}><Zap size={14} /> Events</div>
                                <div style={valueStyle}>{data.tableCounts.events.toLocaleString()}</div>
                            </div>
                        </div>
                    )}

                    {/* Row 3: Pageviews Last 7 Days */}
                    {data.pageviewsLast7Days && data.pageviewsLast7Days.length > 0 && (
                        <div style={cardStyle}>
                            <div style={headerStyle}><Activity size={14} /> Pageviews — Last 7 Days</div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.375rem', height: '120px', padding: '0.5rem 0' }}>
                                {data.pageviewsLast7Days.slice().reverse().map((day, i) => {
                                    const max = Math.max(...data.pageviewsLast7Days!.map((d) => d.count), 1);
                                    const height = Math.max((day.count / max) * 100, 4);
                                    return (
                                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                                {day.count}
                                            </span>
                                            <div style={{
                                                width: '100%',
                                                maxWidth: '48px',
                                                height: `${height}%`,
                                                background: 'linear-gradient(180deg, var(--color-accent), hsl(271 81% 65%))',
                                                borderRadius: '4px 4px 0 0',
                                                minHeight: '4px',
                                                transition: 'height 0.5s ease',
                                            }} />
                                            <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>
                                                {new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Row 4: Latest Pageviews Table */}
                    {data.latestPageviews && data.latestPageviews.length > 0 && (
                        <div style={cardStyle}>
                            <div style={headerStyle}><Activity size={14} /> Latest Pageviews</div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={tableHeaderStyle}>Time</th>
                                            <th style={tableHeaderStyle}>URL</th>
                                            <th style={tableHeaderStyle}>Browser</th>
                                            <th style={tableHeaderStyle}>Country</th>
                                            <th style={tableHeaderStyle}>Device</th>
                                            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Duration</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.latestPageviews.map((pv) => (
                                            <tr key={pv.id}>
                                                <td style={{ ...tableCellStyle, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                    {formatTimeAgo(pv.created_at)}
                                                    <br />
                                                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                                                        {new Date(pv.created_at).toLocaleString()}
                                                    </span>
                                                </td>
                                                <td style={{ ...tableCellStyle, color: 'var(--color-accent)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {pv.url}
                                                </td>
                                                <td style={tableCellStyle}>{pv.browser || '—'}</td>
                                                <td style={tableCellStyle}>{pv.country || '—'}</td>
                                                <td style={tableCellStyle}>{pv.device || '—'}</td>
                                                <td style={{ ...tableCellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pv.duration}s</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Row 5: Latest Events Table */}
                    {data.latestEvents && data.latestEvents.length > 0 && (
                        <div style={cardStyle}>
                            <div style={headerStyle}><Zap size={14} /> Latest Events</div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={tableHeaderStyle}>Time</th>
                                            <th style={tableHeaderStyle}>Event Name</th>
                                            <th style={tableHeaderStyle}>URL</th>
                                            <th style={tableHeaderStyle}>Visitor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.latestEvents.map((ev) => (
                                            <tr key={ev.id}>
                                                <td style={{ ...tableCellStyle, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                    {formatTimeAgo(ev.created_at)}
                                                    <br />
                                                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                                                        {new Date(ev.created_at).toLocaleString()}
                                                    </span>
                                                </td>
                                                <td style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--color-text-primary)' }}>{ev.name}</td>
                                                <td style={{ ...tableCellStyle, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.url || '—'}</td>
                                                <td style={{ ...tableCellStyle, fontFamily: 'monospace', fontSize: '0.75rem' }}>{ev.visitor_id.slice(0, 12)}...</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Row 6: Registered Sites */}
                    {data.sites && data.sites.length > 0 && (
                        <div style={cardStyle}>
                            <div style={headerStyle}><Globe size={14} /> Registered Sites</div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={tableHeaderStyle}>Name</th>
                                            <th style={tableHeaderStyle}>Domain</th>
                                            <th style={tableHeaderStyle}>ID</th>
                                            <th style={tableHeaderStyle}>Created</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.sites.map((site) => (
                                            <tr key={site.id}>
                                                <td style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--color-text-primary)' }}>{site.name}</td>
                                                <td style={{ ...tableCellStyle, color: 'var(--color-accent)' }}>{site.domain}</td>
                                                <td style={{ ...tableCellStyle, fontFamily: 'monospace', fontSize: '0.75rem' }}>{site.id}</td>
                                                <td style={{ ...tableCellStyle, whiteSpace: 'nowrap' }}>{new Date(site.created_at).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Raw JSON (collapsible) */}
                    <details style={cardStyle}>
                        <summary style={{
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: 'var(--color-text-muted)',
                            userSelect: 'none',
                        }}>
                            📋 Raw JSON Response
                        </summary>
                        <pre style={{
                            background: 'var(--color-bg-base)',
                            padding: '1rem',
                            borderRadius: 'var(--radius-md, 8px)',
                            overflow: 'auto',
                            fontSize: '0.75rem',
                            color: 'var(--color-text-secondary)',
                            maxHeight: '400px',
                            margin: '0.5rem 0 0',
                        }}>
                            {JSON.stringify(data, null, 2)}
                        </pre>
                    </details>
                </>
            )}

            {/* Spin animation for refresh button */}
            <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}
