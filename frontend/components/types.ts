export type StatusKey =
    | 'idle' | 'connecting' | 'calibrating' | 'listening' | 'speech_detected'
    | 'processing' | 'thinking' | 'speaking' | 'no_speech'
    | 'goodbye' | 'error' | 'scoring' | 'waiting';

export type Mode = 'explain' | 'viva' | 'quiz';
export type Language = 'en' | 'ta';

export interface Message {
    role: 'user' | 'assistant';
    text: string;
    time: string;
    turn?: number;
    streaming?: boolean;
}

export interface ScoreBreakdown {
    accuracy:     number;
    terminology:  number;
    completeness: number;
    clarity:      number;
    total_score:  number;
    wer:          number;
    feedback:     string;
    turn:         number;
    is_correct?:  boolean;
}

export interface LatencyInfo {
    stt_ms: number;
    llm_ms: number;
    tts_ms: number;
    turn?:  number;
}

export const STATUS_LABEL: Record<StatusKey, string> = {
    idle:            'Idle',
    connecting:      'Connecting',
    calibrating:     'Calibrating…',
    listening:       'Listening',
    speech_detected: 'Speech detected',
    processing:      'Transcribing',
    thinking:        'Thinking',
    speaking:        'Speaking',
    no_speech:       'No speech detected',
    goodbye:         'Goodbye',
    error:           'Error',
    scoring:         'Scoring',
    waiting:         'Waiting',
};

export const BADGE_STYLE: Record<StatusKey, { bg: string; text: string; dot: string }> = {
    idle:            { bg: 'bg-gray-100',    text: 'text-gray-500',   dot: 'bg-gray-400' },
    connecting:      { bg: 'bg-amber-50',    text: 'text-amber-600',  dot: 'bg-amber-400 animate-pulse' },
    calibrating:     { bg: 'bg-orange-50',   text: 'text-orange-600', dot: 'bg-orange-400 animate-pulse' },
    listening:       { bg: 'bg-blue-50',     text: 'text-blue-600',   dot: 'bg-blue-500 animate-pulse' },
    speech_detected: { bg: 'bg-green-50',    text: 'text-green-600',  dot: 'bg-green-500 animate-pulse' },
    processing:      { bg: 'bg-amber-50',    text: 'text-amber-600',  dot: 'bg-amber-400 animate-pulse' },
    thinking:        { bg: 'bg-violet-50',   text: 'text-violet-600', dot: 'bg-violet-500 animate-pulse' },
    speaking:        { bg: 'bg-indigo-50',   text: 'text-indigo-600', dot: 'bg-indigo-500 animate-pulse' },
    no_speech:       { bg: 'bg-gray-100',    text: 'text-gray-500',   dot: 'bg-gray-400' },
    goodbye:         { bg: 'bg-teal-50',     text: 'text-teal-600',   dot: 'bg-teal-500' },
    error:           { bg: 'bg-red-50',      text: 'text-red-600',    dot: 'bg-red-500' },
    scoring:         { bg: 'bg-purple-50',   text: 'text-purple-600', dot: 'bg-purple-500 animate-pulse' },
    waiting:         { bg: 'bg-gray-100',    text: 'text-gray-400',   dot: 'bg-gray-300' },
};
