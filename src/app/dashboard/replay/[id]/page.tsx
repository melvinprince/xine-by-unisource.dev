"use client";

import { useEffect, useState, useRef } from "react";
import { useDashboardContext } from "@/components/DashboardContext";
import { Play, Pause, RotateCcw, MousePointer2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function SessionReplayViewer() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const { selectedSite: currentSite } = useDashboardContext();
  
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeOffset, setCurrentTimeOffset] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const rAF = useRef<number | null>(null);
  const playStartTime = useRef<number>(0);
  const baseEventTime = useRef<number>(0);
  
  useEffect(() => {
    if (!currentSite) return;
    fetch(`/api/dashboard/replay/${sessionId}?siteId=${currentSite}`)
      .then(res => res.json())
      .then(data => {
        if (data.events && data.events.length > 0) {
          // Flatten chunks of events
          const allEvents = data.events.flatMap((r: any) => r.events).sort((a: any, b: any) => a.time - b.time);
          setEvents(allEvents);
          if (allEvents.length > 0) {
            const firstT = allEvents[0].time;
            const lastT = allEvents[allEvents.length - 1].time;
            setDuration(lastT - firstT);
            baseEventTime.current = firstT;

            // Load snapshot
            const snapshot = allEvents.find((e: any) => e.type === "snapshot");
            if (snapshot && iframeRef.current) {
               iframeRef.current.srcdoc = snapshot.html;
            }
          }
        }
        setLoading(false);
      });
  }, [currentSite, sessionId]);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (rAF.current) cancelAnimationFrame(rAF.current);
    } else {
      setIsPlaying(true);
      playStartTime.current = performance.now() - currentTimeOffset;
      tick();
    }
  };

  const restart = () => {
    setIsPlaying(false);
    if (rAF.current) cancelAnimationFrame(rAF.current);
    setCurrentTimeOffset(0);
    applyStateAtTime(0);
  };

  const tick = () => {
    const elapsed = performance.now() - playStartTime.current;
    if (elapsed >= duration) {
      setCurrentTimeOffset(duration);
      setIsPlaying(false);
      applyStateAtTime(duration);
      return;
    }
    setCurrentTimeOffset(elapsed);
    applyStateAtTime(elapsed);
    rAF.current = requestAnimationFrame(tick);
  };

  const applyStateAtTime = (offset: number) => {
    if (events.length === 0) return;
    const absTime = baseEventTime.current + offset;
    
    let lastMouse = null;
    let lastScroll = null;
    
    // Scan up to current time
    for (let i = 0; i < events.length; i++) {
      if (events[i].time > absTime) break;
      if (events[i].type === 'mouse' || events[i].type === 'click') lastMouse = events[i];
      if (events[i].type === 'scroll') lastScroll = events[i];
    }
    
    if (lastMouse && cursorRef.current) {
      cursorRef.current.style.transform = `translate(${lastMouse.x}px, ${lastMouse.y}px)`;
    }
    
    if (lastScroll && iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.scrollTo(lastScroll.x, lastScroll.y);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.back()} className="text-emerald-500 hover:text-emerald-400 text-sm font-medium mb-2 inline-flex items-center">
            &larr; Back to Replays
          </button>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">
            Playback
          </h1>
        </div>
      </div>

      <div className="glass-card overflow-hidden border-slate-700/50 flex flex-col">
        {loading ? (
           <div className="flex items-center justify-center h-[500px]">
             <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"/>
           </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-slate-400">
            No recording data found for this session.
          </div>
        ) : (
          <>
            <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center gap-4">
              <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition-colors">
                {isPlaying ? <Pause className="w-5 h-5"/> : <Play className="w-5 h-5"/>}
              </button>
              <button onClick={restart} className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors">
                <RotateCcw className="w-5 h-5"/>
              </button>
              <div className="flex-1 px-4">
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (currentTimeOffset / duration) * 100)}%` }} />
                </div>
              </div>
              <div className="text-sm text-slate-400 font-mono w-24 text-right">
                {(currentTimeOffset / 1000).toFixed(1)}s / {(duration / 1000).toFixed(1)}s
              </div>
            </div>

            <div className="relative bg-slate-950 w-full h-[600px] overflow-hidden">
              <iframe
                ref={iframeRef}
                className="w-full h-full border-0 pointer-events-none origin-top-left"
                sandbox="allow-same-origin"
              />
              <div 
                ref={cursorRef} 
                className="absolute top-0 left-0 w-6 h-6 z-50 pointer-events-none transition-transform duration-75 ease-linear text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                style={{ transform: "translate(-100px, -100px)" }}
              >
                <MousePointer2 className="w-6 h-6 fill-emerald-500/20" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
