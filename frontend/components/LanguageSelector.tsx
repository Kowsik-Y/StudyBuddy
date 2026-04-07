import React from 'react';
import { Language } from './types';
import { Globe } from 'lucide-react';

interface Props {
    value: Language;
    onChange: (lang: Language) => void;
}

const LANGS: { code: Language; label: string }[] = [
    { code: 'en', label: 'English' },
    { code: 'ta', label: 'தமிழ்' },
];

export default function LanguageSelector({ value, onChange }: Props) {
    return (
        <div className="flex items-center gap-2">
            <Globe size={14} className="text-gray-400" />
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {LANGS.map(l => (
                    <button
                        key={l.code}
                        onClick={() => onChange(l.code)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors
                            ${value === l.code
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                        {l.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
