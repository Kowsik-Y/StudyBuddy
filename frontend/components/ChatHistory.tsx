import React, { useRef, useEffect } from 'react';
import { Bot, User, Loader2 } from 'lucide-react';
import { Message } from './types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function ChatMessage({ message }: { message: Message }) {
    const isUser = message.role === 'user';
    return (
        <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                ${isUser ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                {isUser ? <User size={13} /> : <Bot size={13} />}
            </div>
            <div className="flex flex-col gap-0.5" style={{ maxWidth: '72%' }}>
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                    ${isUser
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'}`}>
                    {isUser ? (
                        <span>{message.text}</span>
                    ) : (
                        <div className="prose prose-sm max-w-none prose-p:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-100 prose-pre:rounded-lg prose-pre:p-3 prose-headings:font-semibold prose-headings:mt-2 prose-headings:mb-1">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                        </div>
                    )}
                    {message.streaming && (
                        <span className="inline-block w-0.5 h-3.5 bg-gray-500 ml-0.5 align-middle animate-pulse" />
                    )}
                </div>
                <span className={`text-[10px] text-gray-400 ${isUser ? 'text-right' : 'text-left'} px-1`}>
                    {message.time}
                </span>
            </div>
        </div>
    );
}

interface ChatHistoryProps {
    messages: Message[];
    /** Optional header title (replaces default "Conversation") */
    title?: string;
    /** Optional header subtitle shown below the title */
    subtitle?: string;
    /** Optional ReactNode rendered as the right side of the header */
    headerRight?: React.ReactNode;
    /** Renders a "Thinking…" bubble after the last message */
    thinking?: boolean;
    /** Shows a live interim speech-to-text bubble (italic, accent colour) */
    interimText?: string;
    /** Renders input controls (mic, textarea, send button, etc.) pinned to the bottom */
    inputSlot?: React.ReactNode;
    /** Renders a status bar below the input (e.g. recording indicator) */
    statusBar?: React.ReactNode;
    /** Warning / error strip above the input */
    warningBar?: React.ReactNode;
    /** Renders a slot pinned above the message list (e.g. topic input bar) */
    topSlot?: React.ReactNode;
}

export default function ChatHistory({
    messages,
    title,
    subtitle,
    headerRight,
    thinking,
    interimText,
    inputSlot,
    statusBar,
    warningBar,
    topSlot,
}: ChatHistoryProps) {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, thinking, interimText]);

    return (
        <div className="w-full flex flex-col border border-gray-200 bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* ── Header ── */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 shrink-0">
                <div className="flex flex-col flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest truncate">
                        {title ?? 'Conversation'}
                    </p>
                    {subtitle && (
                        <p className="text-[10px] text-gray-400 truncate">{subtitle}</p>
                    )}
                </div>
                {headerRight && <div className="shrink-0">{headerRight}</div>}
            </div>

            {/* ── Top slot (e.g. topic input) ── */}
            {topSlot && (
                <div className="border-b border-gray-100 px-4 py-3 shrink-0 bg-gray-50">{topSlot}</div>
            )}

            {/* ── Message list ── */}
            <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4 flex-1" style={{ minHeight: '240px', maxHeight: '420px' }}>
                {messages.map((m, idx) => (
                    <ChatMessage key={idx} message={m} />
                ))}

                {/* Live interim voice bubble */}
                {interimText && (
                    <div className="flex items-end gap-2 flex-row-reverse">
                        <div className="shrink-0 w-7 h-7 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center">
                            <User size={13} />
                        </div>
                        <div className="px-3.5 py-2.5 rounded-2xl rounded-br-sm text-sm bg-rose-50 text-rose-400 italic border border-rose-200" style={{ maxWidth: '72%' }}>
                            🎤 {interimText}
                        </div>
                    </div>
                )}

                
                {/* Thinking indicator */}
                {thinking && (
                    <div className="flex items-end gap-2 flex-row">
                        <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                            <Bot size={13} />
                        </div>
                        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-sm bg-white text-gray-400 border border-gray-200 shadow-sm">
                            <Loader2 size={13} className="animate-spin" />
                            Thinking…
                        </div>
                    </div>
                )}

                <div ref={endRef} />
            </div>

            {/* ── Warning / error strip ── */}
            {warningBar && (
                <div className="px-4 pb-2 shrink-0">{warningBar}</div>
            )}

            {/* ── Input slot ── */}
            {inputSlot && (
                <div className="border-t border-gray-100 px-4 py-3 shrink-0">
                    {inputSlot}
                </div>
            )}

            {/* ── Status bar (e.g. recording indicator) ── */}
            {statusBar && (
                <div className="px-4 pb-3 shrink-0">{statusBar}</div>
            )}
        </div>
    );
}
