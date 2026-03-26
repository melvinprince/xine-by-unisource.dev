"use client";

import { useEffect, useState } from "react";
import SiteSelector from "@/components/SiteSelector";
import EnableFeatureBanner from "@/components/EnableFeatureBanner";
import HelpTooltip from "@/components/HelpTooltip";
import { useDashboardContext } from "@/components/DashboardContext";
import { PlayCircle, Clock, Globe } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import gsap from "gsap";

interface ReplaySummary {
  sessionId: string;
  url: string;
  startTime: string;
  eventsCount: number;
}

export default function SessionReplayPage() {
  const { selectedSite: currentSite, sites, setSelectedSite } = useDashboardContext();
  const [replays, setReplays] = useState<ReplaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentSite) return;

    fetch(`/api/dashboard/replay?siteId=${currentSite}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.replays) {
          setReplays(data.replays);
        }
        setLoading(false);
        gsap.fromTo(
          ".replay-item",
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.4, stagger: 0.05 }
        );
      })
      .catch((err) => {
        console.error("Error fetching replays:", err);
        setLoading(false);
      });
  }, [currentSite]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">
            Session Replays
          </h1>
          <p className="text-slate-400 mt-2">
            Watch user behavior, clicks, and scrolling visually.
          </p>
        </div>
        <SiteSelector sites={sites} selected={currentSite} onChange={setSelectedSite} />
      </div>

      <div className="glass-card p-6 min-h-[500px]">
        {loading ? (
          <div className="flex items-center justify-center h-[300px]">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"/>
          </div>
        ) : replays.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] text-slate-400">
            <PlayCircle className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-lg">No replays recorded yet.</p>
            <p className="text-sm mt-2">Enable 'Session Replay' in Site Settings to start recording.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {replays.map((r, i) => (
              <div key={i} className="replay-item flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800/80 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-200 break-all">{r.url}</div>
                    <div className="flex items-center gap-3 text-sm text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDistanceToNow(new Date(r.startTime), { addSuffix: true })}
                      </span>
                      <span>•</span>
                      <span>{r.eventsCount} events</span>
                    </div>
                  </div>
                </div>
                <Link href={`/dashboard/replay/${r.sessionId}`} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors">
                  <PlayCircle className="w-4 h-4" />
                  Watch
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
