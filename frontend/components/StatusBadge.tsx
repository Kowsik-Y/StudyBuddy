import React from 'react';
import {
    Pause, Loader2, Ear, Activity, ScanText,
    BrainCircuit, Volume2, VolumeX, CheckCheck, AlertCircle, Radio,
} from 'lucide-react';
import { StatusKey, STATUS_LABEL, BADGE_STYLE } from './types';

const ICON: Record<StatusKey, React.ReactNode> = {
    idle: <Pause size={14} />,
    connecting: <Loader2 size={14} className="animate-spin" />,
    calibrating: <Radio size={14} className="animate-pulse" />,
    listening: <Ear size={14} />,
    speech_detected: <Activity size={14} />,
    processing: <ScanText size={14} />,
    thinking: <BrainCircuit size={14} />,
    speaking: <Volume2 size={14} />,
    no_speech: <VolumeX size={14} />,
    goodbye: <CheckCheck size={14} />,
    error: <AlertCircle size={14} />,
    scoring: <Ear size={14} />,
    waiting: <Loader2 size={14} className="animate-spin" />,
};

export default function StatusBadge({ status }: { status: StatusKey }) {
    const s = BADGE_STYLE[status];
    return (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${s.bg} ${s.text} border-current/10`}>
            {ICON[status]}
            {STATUS_LABEL[status]}
        </div>
    );
}
