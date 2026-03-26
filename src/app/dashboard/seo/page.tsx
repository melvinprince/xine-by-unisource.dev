"use client";

import { useState, useEffect } from "react";
import { Search, MapPin, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import StatCard from "@/components/StatCard";
import VisitorChart from "@/components/charts/VisitorChart";
import DataTable from "@/components/DataTable";
import HelpTooltip from "@/components/HelpTooltip";
import { LoadingState, EmptyState, ErrorState } from "@/components/DataStates";
import { useDashboardContext } from "@/components/DashboardContext";

export default function SEOOverviewPage() {
  const { selectedSite, dateRange } = useDashboardContext();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/seo?siteId=${selectedSite}&range=${new Date(dateRange.from).getTime()}-${new Date(dateRange.to).getTime()}`)
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
        setError("Failed to load SEO overview");
        setLoading(false);
      });
  }, [selectedSite, dateRange]);

  if (loading) return <LoadingState message="Analyzing search traffic..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  
  const hasData = data && (data.organicPageviews > 0 || data.organicVisitors > 0);
  
  if (!hasData) return (
    <EmptyState
      icon={<Search size={48} />}
      title="No Organic Traffic Detected"
      description="It looks like you haven't received traffic from known search engines in this date range. Try expanding the date filter."
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SEO Overview <HelpTooltip title="SEO Overview" content="Analyze organic traffic from search engines. Tracks visitors arriving from Google, Bing, Yahoo, DuckDuckGo and other search engines." /></h1>
          <p className="text-slate-400">Analyze organic traffic performance and discoverability.</p>
        </div>
      </div>

      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Organic Visitors" value={data.organicVisitors} icon={<Search size={20} />} delay={0.1} />
        <StatCard label="Organic Pageviews" value={data.organicPageviews} icon={<BarChart3 size={20} />} delay={0.2} />
      </div>

      {/* Visitor Trend Chart */}
      <VisitorChart data={data.timeseries} annotations={[]} />

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DataTable
          title="Top Search Engines" delay={0.4}
          columns={[
            { key: 'engine', label: 'Search Engine', render: (v) => <span className="font-medium">{String(v)}</span> },
            { key: 'visitors', label: 'Visitors', align: 'right' },
            { key: 'views', label: 'Pageviews', align: 'right' },
          ]}
          data={data.topEngines}
        />
        <DataTable
          title="Organic Landing Pages" delay={0.5}
          columns={[
            { key: 'url', label: 'Landing Page', render: (v) => <span className="text-emerald-400 font-medium">{String(v)}</span> },
            { key: 'visitors', label: 'Organic Entrances', align: 'right' },
          ]}
          data={data.topLandingPages}
        />
      </div>
    </div>
  );
}
