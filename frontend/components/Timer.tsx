'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Timer as TimerIcon } from 'lucide-react';

interface Props {
    seconds: number;   // initial countdown value
    running: boolean;
    onExpire?: () => void;
    onTick?: (remaining: number) => void;
}

export default function Timer({ seconds, running, onExpire, onTick }: Props) {
    const [remaining, setRemaining] = useState(seconds);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Reset when seconds prop changes (new question)
    useEffect(() => {
        setRemaining(seconds);
    }, [seconds]);

    useEffect(() => {
        if (!running) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }
        intervalRef.current = setInterval(() => {
            setRemaining(prev => {
                const next = prev - 1;
                onTick?.(next);
                if (next <= 0) {
                    clearInterval(intervalRef.current!);
                    onExpire?.();
                    return 0;
                }
                return next;
            });
        }, 1000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running]);

    const pct = (remaining / seconds) * 100;
    const urgent = remaining <= 5;
    const r = 20;
    const circ = 2 * Math.PI * r;
    const dash = circ * (1 - pct / 100);

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative w-14 h-14">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 50 50">
                    <circle cx="25" cy="25" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
                    <circle
                        cx="25" cy="25" r={r} fill="none"
                        stroke={urgent ? '#ef4444' : '#6366f1'}
                        strokeWidth="3"
                        strokeDasharray={circ}
                        strokeDashoffset={dash}
                        strokeLinecap="round"
                        className="transition-all duration-900"
                    />
                </svg>
                <div className={`absolute inset-0 flex items-center justify-center text-base font-bold
                    ${urgent ? 'text-red-500' : 'text-gray-700'}`}>
                    {remaining}
                </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <TimerIcon size={10} />
                seconds
            </div>
        </div>
    );
}
