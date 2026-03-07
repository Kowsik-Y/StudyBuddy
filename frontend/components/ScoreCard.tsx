import React from 'react';
import { ScoreBreakdown } from './types';
import { MessageSquare } from 'lucide-react';

interface Props {
    score: ScoreBreakdown;
}

const CRITERION_COLOR = (v: number) =>
    v >= 8 ? 'bg-green-500' : v >= 5 ? 'bg-amber-400' : 'bg-red-400';
const WER_LABEL = (w: number) =>
    w === 0 ? 'Perfect' : w <= 0.1 ? 'Excellent' : w <= 0.3 ? 'Good' : w <= 0.5 ? 'Fair' : 'Needs work';
const WER_COLOR = (w: number) =>
    w <= 0.1 ? 'text-green-600 bg-green-50 border-green-200'
        : w <= 0.3 ? 'text-amber-600 bg-amber-50 border-amber-200'
            : 'text-red-600 bg-red-50 border-red-200';

function Bar({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center gap-3">
            <span className="w-28 text-xs text-gray-500 text-right shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${CRITERION_COLOR(value)}`}
                    style={{ width: `${value * 10}%` }}
                />
            </div>
            <span className="w-8 text-right text-xs font-semibold text-gray-700">{value}/10</span>
        </div>
    );
}

export default function ScoreCard({ score }: Props) {
    const totalColor = score.total_score >= 8 ? 'text-green-600' : score.total_score >= 5 ? 'text-amber-600' : 'text-red-500';
    return (
        <div className="w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col gap-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Answer Score — Turn {score.turn}</span>
                <div className="flex items-center gap-3">
                    {/* WER chip */}
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${WER_COLOR(score.wer)}`}>
                        WER {(score.wer * 100).toFixed(0)}% · {WER_LABEL(score.wer)}
                    </span>
                    {/* Total score */}
                    <span className={`text-xl font-bold ${totalColor}`}>
                        {score.total_score.toFixed(1)}<span className="text-xs font-normal text-gray-400">/10</span>
                    </span>
                </div>
            </div>

            {/* Criterion bars */}
            <div className="flex flex-col gap-2.5">
                <Bar label="Accuracy" value={score.accuracy} />
                <Bar label="Terminology" value={score.terminology} />
                <Bar label="Completeness" value={score.completeness} />
                <Bar label="Clarity" value={score.clarity} />
            </div>

            {/* Feedback */}
            {score.feedback && (
                <div className="flex gap-2 bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-700 leading-relaxed">
                    <MessageSquare size={13} className="shrink-0 mt-0.5 text-indigo-400" />
                    {score.feedback}
                </div>
            )}
        </div>
    );
}
