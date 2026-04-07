import React from 'react';
import { LatencyInfo } from './types';
import { Zap } from 'lucide-react';

function chip(label: string, ms: number) {
    const color =
        ms < 500 ? 'bg-green-50 text-green-700 border-green-200' :
            ms < 1500 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                'bg-red-50  text-red-700  border-red-200';
    return (
        <span key={label} className={`text-[11px] font-medium px-2 py-0.5 rounded border ${color}`}>
            {label} {ms.toFixed(0)}ms
        </span>
    );
}

export default function LatencyBadge({ lat }: { lat: LatencyInfo }) {
    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            <Zap size={12} className="text-gray-400" />
            {chip('STT', lat.stt_ms)}
            {chip('LLM', lat.llm_ms)}
            {chip('TTS', lat.tts_ms)}
            <span className="text-[11px] text-gray-400">
                total {(lat.stt_ms + lat.llm_ms + lat.tts_ms).toFixed(0)}ms
            </span>
        </div>
    );
}
