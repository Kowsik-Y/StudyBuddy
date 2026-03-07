import { Mic, Square } from "lucide-react";
import SoundBar from "./SoundBar";
import StatusBadge from "./StatusBadge";
import LatencyBadge from "./LatencyBadge";
import { LatencyInfo, StatusKey } from "./types";

export default function ControlCard({ status, isActive, latency, sessionId, isLive, stopLive, startLive }: { status: StatusKey; isActive: boolean; latency: LatencyInfo | null; sessionId: string; isLive: boolean; stopLive: () => void; startLive: () => void }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-4 flex flex-col items-center gap-5">
            <StatusBadge status={status} />
            {isActive && <SoundBar />}
            <button
                onClick={isLive ? stopLive : startLive}
                className={`flex items-center gap-2.5 px-7 py-3 rounded-xl font-medium text-sm
                            transition-all duration-150 shadow-sm active:scale-95
                            ${isLive ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
            >
                {isLive ? <><Square size={14} fill="currentColor" /> Stop</> : <><Mic size={14} /> Start Explaining</>}
            </button>
            {latency && <LatencyBadge lat={latency} />}
            <p className="text-gray-400 text-xs">
                Press <kbd className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-[10px] font-mono">Space</kbd> to toggle · Session: {sessionId.slice(0, 8) || '—'}
            </p>
        </div>
    );
}