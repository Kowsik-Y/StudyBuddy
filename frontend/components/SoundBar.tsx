import React from 'react';

export default function SoundBar() {
    return (
        <div className="flex gap-0.5 items-end h-5">
            {[...Array(16)].map((_, i) => (
                <div
                    key={i}
                    className="w-1 rounded-full bg-indigo-400"
                    style={{
                        height: `${6 + Math.random() * 22}px`,
                        animation: `bounce ${0.35 + Math.random() * 0.4}s ease-in-out infinite alternate`,
                        opacity: 0.6 + Math.random() * 0.4,
                    }}
                />
            ))}
        </div>
    );
}
