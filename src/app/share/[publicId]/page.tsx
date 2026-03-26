"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Users, Eye, Clock, ArrowDownUp, BarChart3, Globe } from "lucide-react";
import StatCard from "@/components/StatCard";
import VisitorChart from "@/components/charts/VisitorChart";
import DonutChart from "@/components/charts/DonutChart";
import BarChart from "@/components/charts/BarChart";
import DataTable from "@/components/DataTable";
import { LoadingState, EmptyState, ErrorState } from "@/components/DataStates";
import { formatDuration } from "@/lib/utils";

export default function PublicSharePage() {
  const params = useParams();
  const siteId = params.publicId as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("30d");

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    fetch(`/api/public/overview?siteId=\${siteId}&range=\${range}`)
      .then((res) => res.json())
      .then((resData) => {
        if (resData.error) {
          setError(resData.error);
        } else {
          setData(resData);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load public dashboard");
        setLoading(false);
      });
  }, [siteId, range]);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col pt-20 items-center">
      <LoadingState message="Loading public analytics..." />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex flex-col pt-20 items-center">
      <ErrorState message={error} onRetry={() => window.location.reload()} />
    </div>
  );

  const stats = data?.stats;
  if (!stats) return <EmptyState icon={<BarChart3 size={48} />} />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-slate-100 leading-none">{data.site.name}</h1>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Globe className="w-3 h-3"/> {data.site.domain}
              </div>
            </div>
          </div>
          <select 
            className="bg-slate-800 border-none text-sm text-slate-300 rounded-md py-1.5 px-3 focus:ring-1 focus:ring-emerald-500 outline-none"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Stat Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Visitors" value={stats.visitors} change={stats.visitorsChange} icon={<Users size={20} />} delay={0.1} />
          <StatCard label="Pageviews" value={stats.pageviews} change={stats.pageviewsChange} icon={<Eye size={20} />} delay={0.15} />
          <StatCard label="Avg. Duration" value={stats.avgDuration} change={stats.durationChange} format="duration" icon={<Clock size={20} />} delay={0.2} />
          <StatCard label="Bounce Rate" value={stats.bounceRate} change={stats.bounceRateChange} format="percent" icon={<ArrowDownUp size={20} />} delay={0.25} />
        </div>

        {/* Visitor Trend Chart */}
        <VisitorChart data={data.timeseries} annotations={data.annotations} />

        {/* Two-Column: Top Pages + Top Sources */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DataTable
            title="Top Pages" delay={0.5}
            columns={[
              { key: 'url', label: 'Page', render: (v) => <span className="text-emerald-400 font-medium">{String(v)}</span> },
              { key: 'views', label: 'Views', align: 'right' },
              { key: 'uniqueVisitors', label: 'Unique', align: 'right' },
              { key: 'avgDuration', label: 'Duration', align: 'right', render: (v) => formatDuration(Number(v)) },
            ]}
            data={data.topPages}
          />
          <DataTable
            title="Top Sources" delay={0.55}
            columns={[
              { key: 'referrer', label: 'Source', render: (v) => <span className="font-medium">{String(v)}</span> },
              { key: 'visitors', label: 'Visitors', align: 'right' },
            ]}
            data={data.topSources}
          />
        </div>

        {/* Three-Column: Devices, Browsers, Countries */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DonutChart data={data.deviceBreakdown} />
          <BarChart data={data.browserStats} />
          <DataTable
            title="Top Countries" delay={0.75}
            columns={[
              { key: 'flag', label: '', sortable: false, width: '30px' },
              { key: 'country', label: 'Country' },
              { key: 'visitors', label: 'Visitors', align: 'right' },
            ]}
            data={data.locations.slice(0, 5)}
          />
        </div>
      </main>
    </div>
  );
}
