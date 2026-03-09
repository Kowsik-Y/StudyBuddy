'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    BarChart2, ArrowLeft, RefreshCw, Trash2,
    BookOpen, GraduationCap, HelpCircle,
} from 'lucide-react';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
    CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL;

const MODE_ICON: Record<string, React.ReactNode> = {
    explain: <BookOpen size={13} className="text-indigo-500" />,
    viva: <GraduationCap size={13} className="text-violet-500" />,
    quiz: <HelpCircle size={13} className="text-emerald-500" />,
};
const MODE_COLOR: Record<string, string> = {
    explain: '#6366f1',
    viva: '#7c3aed',
    quiz: '#10b981',
};

interface Session {
    id: string; mode: string; topic: string; language: string;
    started_at: string; avg_score: number | null; avg_wer: number | null; turn_count: number;
}
interface TopicStat {
    topic: string; mode: string; avg_score: number; avg_wer: number; session_count: number;
}
interface LatAvg { session_id: string; stt_ms: number; llm_ms: number; tts_ms: number; total_ms: number; tat_ms: number; inverse_rtf: number | null; }
interface Summary { topic_stats: TopicStat[]; trend: Session[]; latency: LatAvg[]; }

export default function AnalyticsPage() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
    const [detailId, setDetailId] = useState('');
    const [loading, setLoading] = useState(false);
    const [resetDone, setResetDone] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [sumRes, sessRes] = await Promise.all([
                fetch(`${API}/analytics/summary`),
                fetch(`${API}/analytics/sessions`),
            ]);
            setSummary(await sumRes.json());
            setSessions(await sessRes.json());
        } catch {
            // backend might be offline
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    async function openDetail(id: string) {
        if (detailId === id) { setDetail(null); setDetailId(''); return; }
        const res = await fetch(`${API}/analytics/session/${id}`);
        setDetail(await res.json());
        setDetailId(id);
    }

    async function doReset() {
        if (!confirm('Delete all analytics data?')) return;
        await fetch(`${API}/analytics/reset`, { method: 'DELETE' });
        setSummary(null); setSessions([]); setDetail(null); setDetailId('');
        setResetDone(true);
        setTimeout(() => setResetDone(false), 2000);
    }

    // Chart data: score + WER trend from sessions
    const trendData = (summary?.trend ?? []).slice().reverse().map((s, i) => ({
        n: i + 1,
        score: s.avg_score != null ? +s.avg_score.toFixed(2) : 0,
        wer: s.avg_wer != null ? +Math.min(100, s.avg_wer * 100).toFixed(1) : 0,
        mode: s.mode,
    }));

    // Latency chart: map session_id to index
    const latencyData = (summary?.latency ?? []).map((l, i) => ({
        n: i + 1,
        STT: +l.stt_ms.toFixed(0),
        LLM: +l.llm_ms.toFixed(0),
        TTS: +l.tts_ms.toFixed(0),
    }));

    // TAT & Inverse RTF chart
    const perfData = (summary?.latency ?? []).map((l, i) => ({
        n: i + 1,
        TAT: +l.tat_ms.toFixed(0),
        InvRTF: l.inverse_rtf != null ? +l.inverse_rtf.toFixed(2) : null,
    }));

    const avgTAT = summary?.latency?.length
        ? (summary.latency.reduce((a, b) => a + (b.tat_ms ?? 0), 0) / summary.latency.length).toFixed(0)
        : null;
    const avgInvRTF = (() => {
        const valid = (summary?.latency ?? []).filter(l => l.inverse_rtf != null);
        if (!valid.length) return null;
        return (valid.reduce((a, b) => a + (b.inverse_rtf ?? 0), 0) / valid.length).toFixed(2);
    })();

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-3xl mx-auto flex flex-col gap-8 min-w-0 overflow-x-hidden">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link href="/" className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
                        <ArrowLeft size={18} className="text-gray-500" />
                    </Link>
                    <div className="w-10 h-10 rounded-2xl bg-gray-800 flex items-center justify-center shadow">
                        <BarChart2 size={18} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-lg font-semibold text-gray-800">Performance Analytics</h1>
                        <p className="text-xs text-gray-400">Scores, WER trends, latency across all sessions</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={fetchData} title="Refresh"
                            className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
                            <RefreshCw size={16} className={`text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={doReset} title="Reset analytics"
                            className="p-2 rounded-xl hover:bg-red-50 transition-colors">
                            <Trash2 size={16} className="text-red-400" />
                        </button>
                    </div>
                </div>
                {resetDone && <p className="text-xs text-green-600 text-center">Analytics reset.</p>}

                {/* Top stats */}
                {summary && (
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: 'Sessions', val: sessions.length },
                            {
                                label: 'Avg Score', val: sessions.length
                                    ? (sessions.reduce((a, b) => (a + (b.avg_score ?? 0)), 0) / sessions.length).toFixed(1) + '/10'
                                    : '—'
                            },
                            {
                                label: 'Avg WER', val: sessions.length
                                    ? Math.min(100, sessions.reduce((a, b) => (a + (b.avg_wer ?? 0)), 0) / sessions.length * 100).toFixed(0) + '%'
                                    : '—'
                            },
                        ].map(s => (
                            <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                                <p className="text-[10px] text-gray-400 uppercase tracking-widest">{s.label}</p>
                                <p className="text-2xl font-bold text-gray-800">{s.val}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Inverse RTF + TAT stats */}
                {(avgTAT != null || avgInvRTF != null) && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Avg Turn Around Time</p>
                            <p className="text-2xl font-bold text-gray-800">{avgTAT != null ? `${avgTAT} ms` : '—'}</p>
                            <p className="text-[10px] text-gray-400 mt-1">STT + LLM + TTS end-to-end</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Avg Inverse RTF</p>
                            <p className="text-2xl font-bold text-gray-800">{avgInvRTF != null ? `${avgInvRTF}×` : '—'}</p>
                            <p className="text-[10px] text-gray-400 mt-1">Audio duration ÷ STT time (higher = faster)</p>
                        </div>
                    </div>
                )}

                {/* Score + WER line chart */}
                {trendData.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 overflow-hidden">
                        <p className="text-sm font-semibold text-gray-700 mb-4">Score &amp; WER Trend (last 30 sessions)</p>
                        <div className="w-full">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={trendData} margin={{ top: 5, left: 10, right: 20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="n" tick={{ fontSize: 11 }} label={{ value: 'Session', position: 'insideBottom', offset: -10, fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} width={40} />
                                    <Tooltip />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Line type="monotone" dataKey="score" stroke="#6366f1" dot={false} name="Avg Score" connectNulls strokeWidth={2} />
                                    <Line type="monotone" dataKey="wer" stroke="#f59e0b" dot={false} name="WER %" connectNulls strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Latency bar chart */}
                {latencyData.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 overflow-hidden">
                        <p className="text-sm font-semibold text-gray-700 mb-4">Avg Latency per Session (ms)</p>
                        <div className="w-full">
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={latencyData} margin={{ top: 5, left: 10, right: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="n" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} width={50} />
                                    <Tooltip />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar dataKey="STT" stackId="a" fill="#6366f1" />
                                    <Bar dataKey="LLM" stackId="a" fill="#7c3aed" />
                                    <Bar dataKey="TTS" stackId="a" fill="#10b981" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Turn Around Time & Inverse RTF chart */}
                {perfData.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 overflow-hidden">
                        <p className="text-sm font-semibold text-gray-700 mb-1">Turn Around Time &amp; Inverse RTF per Session</p>
                        <p className="text-[11px] text-gray-400 mb-4">TAT (ms) = total pipeline delay &nbsp;·&nbsp; Inverse RTF = audio duration ÷ STT time (higher is better)</p>
                        <div className="w-full">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={perfData} margin={{ top: 5, left: 10, right: 20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="n" tick={{ fontSize: 11 }} label={{ value: 'Session', position: 'insideBottom', offset: -10, fontSize: 11 }} />
                                    <YAxis yAxisId="tat" tick={{ fontSize: 11 }} width={55} label={{ value: 'TAT (ms)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                    <YAxis yAxisId="rtf" orientation="right" tick={{ fontSize: 11 }} width={45} label={{ value: 'Inv RTF', angle: 90, position: 'insideRight', fontSize: 10 }} />
                                    <Tooltip />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Line yAxisId="tat" type="monotone" dataKey="TAT" stroke="#f43f5e" dot={false} name="TAT (ms)" connectNulls strokeWidth={2} />
                                    <Line yAxisId="rtf" type="monotone" dataKey="InvRTF" stroke="#0ea5e9" dot={false} name="Inverse RTF" connectNulls strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Per-topic stats */}
                {(summary?.topic_stats ?? []).length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                        <p className="text-sm font-semibold text-gray-700 mb-3">Avg Score per Topic</p>
                        <div className="flex flex-col divide-y divide-gray-100">
                            {summary!.topic_stats.map(t => (
                                <div key={`${t.topic}-${t.mode}`}
                                    className="flex items-center gap-3 py-2.5">
                                    {MODE_ICON[t.mode] ?? null}
                                    <span className="flex-1 text-sm text-gray-700 truncate">{t.topic || 'untitled'}</span>
                                    <span className="text-[10px] text-gray-400">{t.session_count} session{t.session_count !== 1 ? 's' : ''}</span>
                                    <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full"
                                            style={{ width: `${t.avg_score * 10}%`, backgroundColor: MODE_COLOR[t.mode] ?? '#6366f1' }} />
                                    </div>
                                    <span className="text-xs font-semibold text-gray-800 w-10 text-right">
                                        {t.avg_score.toFixed(1)}/10
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Session history table */}
                {sessions.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                        <p className="text-sm font-semibold text-gray-700 mb-3">Session History</p>
                        <div className="flex flex-col divide-y divide-gray-100">
                            {sessions.map(s => (
                                <React.Fragment key={s.id}>
                                    <button
                                        onClick={() => openDetail(s.id)}
                                        className="flex items-center gap-3 py-3 text-left hover:bg-gray-50 w-full rounded-lg px-2 transition-colors"
                                    >
                                        {MODE_ICON[s.mode] ?? <BarChart2 size={13} className="text-gray-400" />}
                                        <span className="flex-1 text-xs text-gray-700 truncate">
                                            {s.topic || s.mode} · {s.language.toUpperCase()}
                                        </span>
                                        <span className="text-[10px] text-gray-400 shrink-0">
                                            {new Date(s.started_at).toLocaleDateString()}
                                        </span>
                                        <span className="text-xs font-semibold text-gray-600 w-14 text-right">
                                            {s.avg_score != null ? `${s.avg_score.toFixed(1)}/10` : '—'}
                                        </span>
                                    </button>
                                    {/* Expanded detail */}
                                    {detailId === s.id && detail && (
                                        <div className="bg-gray-50 rounded-xl p-4 mb-2 text-xs text-gray-600">
                                            <p className="font-semibold text-gray-700 mb-2">Turn-by-turn breakdown</p>
                                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                            {((detail as any).evaluations ?? []).map((e: any) => {
                                                const werPct = e.wer != null ? Math.min(100, +(e.wer * 100).toFixed(0)) : null;
                                                const werColor = werPct == null ? 'text-gray-400'
                                                    : werPct <= 20 ? 'text-emerald-600 font-semibold'
                                                        : werPct <= 50 ? 'text-amber-500 font-semibold'
                                                            : 'text-red-500 font-semibold';
                                                return (
                                                    <div key={e.id} className="flex flex-col gap-1 mb-3 border-b border-gray-200 pb-3">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-semibold text-gray-700">Turn {e.turn}</span>
                                                            <span className="text-gray-400">·</span>
                                                            <span className="text-gray-600">Score: <span className="font-semibold text-gray-800">{e.total_score?.toFixed(1)}/10</span></span>
                                                            <span className="text-gray-400">·</span>
                                                            <span className="text-gray-600">WER: <span className={werColor}>{werPct != null ? `${werPct}%` : '—'}</span></span>
                                                        </div>
                                                        <p className="text-gray-500"><span className="text-gray-400 uppercase text-[10px] tracking-wider mr-1">Student</span>{e.student_text}</p>
                                                        {e.model_answer && (
                                                            <p className="text-gray-700 bg-indigo-50 rounded-lg px-2 py-1">
                                                                <span className="text-[10px] uppercase tracking-wider text-indigo-400 mr-1">Ground Truth</span>
                                                                {e.model_answer}
                                                            </p>
                                                        )}
                                                        <p className="text-indigo-600 italic">{e.feedback}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}

                {(!summary || sessions.length === 0) && !loading && (
                    <p className="text-center text-gray-400 text-sm py-12">
                        No sessions yet. Complete a study session to see analytics here.
                    </p>
                )}

            </div>
        </div>
    );
}
