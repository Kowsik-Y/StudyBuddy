'use client';
import { useEffect, useState, useRef } from 'react';

interface BuddyProps {
    isSpeaking: boolean;
    isThinking: boolean;
    isListening: boolean;
    name?: string;
}

type Mood = 'idle' | 'speaking' | 'thinking' | 'listening';

export default function BuddyCharacter({
    isSpeaking, isThinking, isListening, name = 'Bun',
}: BuddyProps) {
    const [blink, setBlink] = useState(false);
    const [noseWig, setNoseWig] = useState(false);
    const [heartPop, setHeartPop] = useState(false);
    const blinkRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const noseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const go = () => {
            blinkRef.current = setTimeout(() => {
                setBlink(true);
                setTimeout(() => setBlink(false), 100);
                go();
            }, 3000 + Math.random() * 4500);
        };
        go();
        return () => {
            if (blinkRef.current) clearTimeout(blinkRef.current);
        };
    }, []);

    useEffect(() => {
        const go = () => {
            noseRef.current = setTimeout(() => {
                setNoseWig(true);
                setTimeout(() => setNoseWig(false), 700);
                go();
            }, 3200 + Math.random() * 5000);
        };
        go();
        return () => {
            if (noseRef.current) clearTimeout(noseRef.current);
        };
    }, []);

    useEffect(() => {
        if (!isSpeaking && !isThinking && !isListening) {
            const go = () => {
                heartRef.current = setTimeout(() => {
                    setHeartPop(true);
                    setTimeout(() => setHeartPop(false), 1400);
                    go();
                }, 6000 + Math.random() * 8000);
            };
            go();
        }
        return () => {
            if (heartRef.current) clearTimeout(heartRef.current);
        };
    }, [isSpeaking, isThinking, isListening]);

    const mood: Mood = isSpeaking ? 'speaking' : isThinking ? 'thinking' : isListening ? 'listening' : 'idle';

    const accentCol = {
        idle: '#f9a8d4', speaking: '#f472b6', thinking: '#fcd34d', listening: '#6ee7b7',
    }[mood];
    const ringCol = {
        idle: '#fda4af88', speaking: '#f472b688', thinking: '#fcd34d88', listening: '#6ee7b788',
    }[mood];
    const glowCol = {
        idle: '#fce7f340', speaking: '#f9a8d440', thinking: '#fef3c730', listening: '#d1fae530',
    }[mood];

    const statusLabel = {
        idle: '✨ Ready', speaking: '🔊 Speaking', thinking: '💭 Thinking', listening: '👂 Listening',
    }[mood];

    const lArm = { idle: 6, speaking: -68, thinking: -75, listening: -50 }[mood];
    const rArm = { idle: -6, speaking: 68, thinking: 10, listening: 44 }[mood];

    const dur = isSpeaking ? '.46s' : '3s';
    const bodyAnim = { idle: 'bobIdle', speaking: 'bobSpeak', thinking: 'tiltThink', listening: 'tiltListen' }[mood];
    const earLAnim = { idle: 'earLIdle', speaking: 'earLSpeak', thinking: 'earLThink', listening: 'earLListen' }[mood];
    const earRAnim = { idle: 'earRIdle', speaking: 'earRSpeak', thinking: 'earRThink', listening: 'earRListen' }[mood];

    return (
        <>
            <style>{`
        @keyframes bobIdle    { 0%,100%{transform:translateY(0)}        50%{transform:translateY(-7px)} }
        @keyframes bobSpeak   { 0%,100%{transform:translateY(0) scaleX(1)} 30%{transform:translateY(-9px) scaleX(1.04)} 70%{transform:translateY(-3px) scaleX(.97)} }
        @keyframes tiltThink  { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-4px) rotate(-5deg)} }
        @keyframes tiltListen { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-5px) rotate(3.5deg)} }

        @keyframes earLIdle   { 0%,100%{transform:rotate(0)}     50%{transform:rotate(-7deg)} }
        @keyframes earRIdle   { 0%,100%{transform:rotate(0)}     50%{transform:rotate(7deg)} }
        @keyframes earLSpeak  { 0%,100%{transform:rotate(-20deg)} 50%{transform:rotate(10deg)} }
        @keyframes earRSpeak  { 0%,100%{transform:rotate(20deg)}  50%{transform:rotate(-10deg)} }
        @keyframes earLThink  { 0%,100%{transform:rotate(-28deg)} 50%{transform:rotate(-22deg)} }
        @keyframes earRThink  { 0%,100%{transform:rotate(4deg)}   50%{transform:rotate(9deg)} }
        @keyframes earLListen { 0%,100%{transform:rotate(-10deg)} 50%{transform:rotate(-5deg)} }
        @keyframes earRListen { 0%,100%{transform:rotate(26deg)}  50%{transform:rotate(20deg)} }

        @keyframes tailWag    { 0%,100%{transform:rotate(-14deg) scale(1)} 50%{transform:rotate(14deg) scale(1.06)} }

        /* ── IDLE gentle sway ── */
        @keyframes legLIdle   { 0%,100%{transform:rotate(0) translateY(0)}  50%{transform:rotate(5deg) translateY(1px)} }
        @keyframes legRIdle   { 0%,100%{transform:rotate(0) translateY(0)}  50%{transform:rotate(-5deg) translateY(1px)} }

        /* ── SPEAKING full dance ── */
        /* left leg: kick out → pull back → knee lift → stomp */
        @keyframes legDanceL {
          0%   { transform: rotate(0deg)   translateY(0px); }
          12%  { transform: rotate(-35deg) translateY(-8px); }
          25%  { transform: rotate(20deg)  translateY(2px); }
          38%  { transform: rotate(-45deg) translateY(-12px); }
          50%  { transform: rotate(10deg)  translateY(0px); }
          62%  { transform: rotate(-20deg) translateY(-6px); }
          75%  { transform: rotate(30deg)  translateY(3px); }
          88%  { transform: rotate(-10deg) translateY(-4px); }
          100% { transform: rotate(0deg)   translateY(0px); }
        }
        /* right leg: offset by half phase — alternating stomp */
        @keyframes legDanceR {
          0%   { transform: rotate(0deg)   translateY(0px); }
          12%  { transform: rotate(30deg)  translateY(2px); }
          25%  { transform: rotate(-40deg) translateY(-10px); }
          38%  { transform: rotate(15deg)  translateY(1px); }
          50%  { transform: rotate(-50deg) translateY(-14px); }
          62%  { transform: rotate(25deg)  translateY(3px); }
          75%  { transform: rotate(-15deg) translateY(-5px); }
          88%  { transform: rotate(35deg)  translateY(2px); }
          100% { transform: rotate(0deg)   translateY(0px); }
        }

        /* ── THINKING — tap foot slowly ── */
        @keyframes legThinkL  { 0%,60%,100%{transform:rotate(0)}  30%{transform:rotate(12deg) translateY(2px)} }
        @keyframes legThinkR  { 0%,100%{transform:rotate(0)}       50%{transform:rotate(-8deg)} }

        /* ── LISTENING — gentle two-step ── */
        @keyframes legListenL { 0%,100%{transform:rotate(0) translateY(0)}  33%{transform:rotate(-18deg) translateY(-5px)} 66%{transform:rotate(8deg) translateY(1px)} }
        @keyframes legListenR { 0%,100%{transform:rotate(0) translateY(0)}  33%{transform:rotate(15deg) translateY(1px)}  66%{transform:rotate(-20deg) translateY(-5px)} }

        @keyframes td1 { 0%,70%,100%{transform:translateY(0) scale(.6);opacity:.15} 35%{transform:translateY(-10px) scale(1);opacity:1} }
        @keyframes td2 { 0%,100%{transform:translateY(0) scale(.6);opacity:.15}     50%{transform:translateY(-10px) scale(1);opacity:1} }
        @keyframes td3 { 0%,30%,100%{transform:translateY(0) scale(.6);opacity:.15} 65%{transform:translateY(-10px) scale(1);opacity:1} }

        @keyframes wave0 { 0%,100%{height:4px;y:61px}  50%{height:17px;y:48px} }
        @keyframes wave1 { 0%,100%{height:7px;y:58px}  50%{height:22px;y:43px} }
        @keyframes wave2 { 0%,100%{height:5px;y:60px}  50%{height:18px;y:47px} }
        @keyframes wave3 { 0%,100%{height:4px;y:61px}  50%{height:14px;y:51px} }

        @keyframes mb0 { 0%,100%{transform:scaleY(.15)} 50%{transform:scaleY(1)} }
        @keyframes mb1 { 0%,100%{transform:scaleY(.3)}  50%{transform:scaleY(1)} }
        @keyframes mb2 { 0%,100%{transform:scaleY(.2)}  50%{transform:scaleY(1)} }
        @keyframes mb3 { 0%,100%{transform:scaleY(.4)}  50%{transform:scaleY(1)} }
        @keyframes mouthBounce { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.1)} }

        /* ── REALISTIC VOCAL WAVE — tongue ripple paths ── */
        @keyframes vocalWave {
          0%   { d: path("M 51 90 Q 54 87 57 90 Q 60 93 63 90 Q 66 87 69 90"); }
          25%  { d: path("M 51 91 Q 54 88 57 92 Q 60 88 63 92 Q 66 89 69 91"); }
          50%  { d: path("M 51 89 Q 54 93 57 89 Q 60 93 63 89 Q 66 93 69 89"); }
          75%  { d: path("M 51 92 Q 54 88 57 91 Q 60 95 63 91 Q 66 88 69 92"); }
          100% { d: path("M 51 90 Q 54 87 57 90 Q 60 93 63 90 Q 66 87 69 90"); }
        }
        @keyframes vocalWave2 {
          0%   { d: path("M 52 85 Q 55 82 58 85 Q 61 88 64 85 Q 67 82 70 85"); }
          30%  { d: path("M 52 86 Q 55 83 58 87 Q 61 83 64 87 Q 67 84 70 86"); }
          60%  { d: path("M 52 84 Q 55 88 58 84 Q 61 88 64 84 Q 67 88 70 84"); }
          100% { d: path("M 52 85 Q 55 82 58 85 Q 61 88 64 85 Q 67 82 70 85"); }
        }
        @keyframes vocalWave3 {
          0%   { d: path("M 53 82 Q 56 79 59 82 Q 62 85 65 82 Q 68 79 71 82"); opacity: .4; }
          40%  { d: path("M 53 83 Q 56 80 59 84 Q 62 80 65 84 Q 68 81 71 83"); opacity: .7; }
          70%  { d: path("M 53 81 Q 56 85 59 81 Q 62 85 65 81 Q 68 85 71 81"); opacity: .5; }
          100% { d: path("M 53 82 Q 56 79 59 82 Q 62 85 65 82 Q 68 79 71 82"); opacity: .4; }
        }

        /* ── REALISTIC OUTER SOUND RIPPLES ── */
        @keyframes ripple0 { 0%{r:2;opacity:.9;stroke-width:1.8}  100%{r:14;opacity:0;stroke-width:.5} }
        @keyframes ripple1 { 0%{r:2;opacity:.8;stroke-width:1.6}  100%{r:18;opacity:0;stroke-width:.4} }
        @keyframes ripple2 { 0%{r:2;opacity:.75;stroke-width:1.4} 100%{r:22;opacity:0;stroke-width:.3} }
        @keyframes ripple3 { 0%{r:2;opacity:.6;stroke-width:1.2}  100%{r:26;opacity:0;stroke-width:.2} }

        @keyframes noseWig { 0%,100%{transform:scale(1)} 40%{transform:scale(1.3,.75)} 70%{transform:scale(.9,1.1)} }
        @keyframes heartPop { 0%{transform:scale(0);opacity:0} 30%{transform:scale(1.3);opacity:1} 80%{transform:scale(1) translateY(-10px);opacity:.85} 100%{transform:scale(.5) translateY(-20px);opacity:0} }
        @keyframes spinOrbit { to{transform:rotate(360deg)} }
        @keyframes slideIn   { from{opacity:0;transform:translateY(-50%) translateX(110px)} to{opacity:1;transform:translateY(-50%) translateX(0)} }

        @keyframes breathe {
          0%,100%{ box-shadow: 0 10px 40px #e9b8cc38, 0 0 0 1px #f5c6d660, 0 2px 8px #0000000f; }
          50%    { box-shadow: 0 18px 55px ${glowCol}, 0 0 0 1.5px ${ringCol}, 0 2px 8px #0000000f; }
        }
        @keyframes pillPulse { 0%,100%{opacity:.9} 50%{opacity:1} }

        /* fur stroke shimmer */
        @keyframes furShimmer { 0%,100%{opacity:.18} 50%{opacity:.32} }

        .buddy-root {
          position:absolute; left:-50px; top:50%; z-index:50;
          transform:translateY(-50%);
          animation: slideIn .6s cubic-bezier(.22,1,.36,1) both;
          user-select:none;
        }
        
        .bunny-body { animation:${bodyAnim} ${dur} ease-in-out infinite; transform-origin:60px 205px; }
        .ear-l { transform-origin:37px 8px;   animation:${earLAnim} ${dur} ease-in-out infinite; }
        .ear-r { transform-origin:83px 8px;   animation:${earRAnim} ${dur} ease-in-out infinite; }
        .arm-l { transform-origin:28px 100px; transition:transform .35s ease; }
        .arm-r { transform-origin:92px 100px; transition:transform .35s ease; }
        .leg-l { transform-origin:42px 158px; animation:${isThinking ? 'legThinkL 2.2s ease-in-out infinite' :
                    isListening ? 'legListenL 1.6s ease-in-out infinite' :
                        'legLIdle 3s ease-in-out infinite'
                }; }
        .leg-r { transform-origin:78px 158px; animation:${isThinking ? 'legThinkR 2.2s ease-in-out infinite' :
                    isListening ? 'legListenR 1.6s ease-in-out infinite' :
                        'legRIdle 3s ease-in-out infinite'
                }; }
        .tail  { transform-origin:91px 144px; animation:tailWag 1.4s ease-in-out infinite; }
        .nose-g{ transform-origin:60px 83px;  animation:${noseWig ? 'noseWig .7s ease-in-out 1' : 'none'}; }
        .heart { animation:${heartPop ? 'heartPop 1.4s ease-out forwards' : 'none'}; transform-origin:60px 42px; }
        .fur-shimmer { animation:furShimmer 3s ease-in-out infinite; }

        .status-pill { animation:pillPulse 2.2s ease-in-out infinite; }
      `}</style>

            <div className="buddy-root">
                <div className="buddy-card">



                    {/* ════════ REALISTIC BUNNY SVG ════════ */}
                    <svg viewBox="0 0 120 225" width="96" height="180" style={{ overflow: 'visible', display: 'block' }}>
                        <defs>
                            {/* ── fur base gradients ── */}
                            <radialGradient id="rg_head" cx="40%" cy="32%" r="58%">
                                <stop offset="0%" stopColor="#fffcfe" />
                                <stop offset="40%" stopColor="#fef6fb" />
                                <stop offset="75%" stopColor="#fde8f0" />
                                <stop offset="100%" stopColor="#fbcfe8" />
                            </radialGradient>
                            <radialGradient id="rg_body" cx="38%" cy="22%" r="62%">
                                <stop offset="0%" stopColor="#fff" />
                                <stop offset="50%" stopColor="#fef0f7" />
                                <stop offset="85%" stopColor="#fde0ee" />
                                <stop offset="100%" stopColor="#fbb6d0" />
                            </radialGradient>
                            <radialGradient id="rg_ear_out" cx="50%" cy="20%" r="55%">
                                <stop offset="0%" stopColor="#fff" />
                                <stop offset="60%" stopColor="#fef0f7" />
                                <stop offset="100%" stopColor="#fbd5e6" />
                            </radialGradient>
                            <radialGradient id="rg_ear_in" cx="50%" cy="30%" r="52%">
                                <stop offset="0%" stopColor="#fecdd3" />
                                <stop offset="55%" stopColor="#fca5a5" />
                                <stop offset="100%" stopColor="#f87171" />
                            </radialGradient>
                            <radialGradient id="rg_belly" cx="50%" cy="38%" r="55%">
                                <stop offset="0%" stopColor="#fff9fc" />
                                <stop offset="70%" stopColor="#fef0f7" stopOpacity=".7" />
                                <stop offset="100%" stopColor="#fde0ee" stopOpacity=".3" />
                            </radialGradient>
                            <radialGradient id="rg_tail" cx="35%" cy="30%" r="58%">
                                <stop offset="0%" stopColor="#fff" />
                                <stop offset="65%" stopColor="#fef0f7" />
                                <stop offset="100%" stopColor="#fde8f0" />
                            </radialGradient>
                            <radialGradient id="rg_paw" cx="45%" cy="30%" r="55%">
                                <stop offset="0%" stopColor="#fff" />
                                <stop offset="65%" stopColor="#fef0f7" />
                                <stop offset="100%" stopColor="#fbcfe8" />
                            </radialGradient>

                            {/* ── eye gradients ── */}
                            <radialGradient id="rg_eye_iris" cx="38%" cy="32%" r="58%">
                                <stop offset="0%" stopColor="#78350f" />
                                <stop offset="45%" stopColor="#451a03" />
                                <stop offset="100%" stopColor="#1c0a00" />
                            </radialGradient>
                            <radialGradient id="rg_eye_pupil" cx="42%" cy="38%" r="55%">
                                <stop offset="0%" stopColor="#0f0905" />
                                <stop offset="100%" stopColor="#000" />
                            </radialGradient>

                            {/* ── nose gradient ── */}
                            <radialGradient id="rg_nose" cx="42%" cy="35%" r="55%">
                                <stop offset="0%" stopColor="#fecdd3" />
                                <stop offset="55%" stopColor="#fca5a5" />
                                <stop offset="100%" stopColor="#f87171" />
                            </radialGradient>

                            {/* ── filters ── */}
                            <filter id="fur_shadow" x="-25%" y="-20%" width="150%" height="150%">
                                <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#e879a8" floodOpacity=".18" />
                                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#f9a8d4" floodOpacity=".12" />
                            </filter>
                            <filter id="eye_depth" x="-30%" y="-30%" width="160%" height="160%">
                                <feGaussianBlur stdDeviation="0.4" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                            <filter id="nose_glow" x="-40%" y="-40%" width="180%" height="180%">
                                <feGaussianBlur stdDeviation="1.5" result="g" />
                                <feComposite in="SourceGraphic" in2="g" operator="over" />
                            </filter>
                            <filter id="soft_fur" x="-8%" y="-8%" width="116%" height="116%">
                                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="2" result="noise" />
                                <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" />
                            </filter>

                            {/* ── mouth clip ── */}
                            <clipPath id="mouthClip">
                                <path d="M 50 79 Q 60 97 70 79 Q 65 73 60 72 Q 55 73 50 79 Z" />
                            </clipPath>

                            {/* ── orbit gradient ── */}
                            <linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={accentCol} stopOpacity="0" />
                                <stop offset="50%" stopColor={accentCol} stopOpacity=".95" />
                                <stop offset="100%" stopColor={accentCol} stopOpacity="0" />
                            </linearGradient>

                            {/* ── fur stroke pattern ── */}
                            <pattern id="fur_strokes" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
                                <line x1="1" y1="0" x2="2" y2="3" stroke="#e8b0c8" strokeWidth=".4" opacity=".5" />
                                <line x1="4" y1="1" x2="5" y2="4" stroke="#f0c0d4" strokeWidth=".35" opacity=".4" />
                                <line x1="0" y1="4" x2="1.5" y2="6" stroke="#e8b0c8" strokeWidth=".3" opacity=".35" />
                            </pattern>
                        </defs>

                        <g className="bunny-body" filter="url(#fur_shadow)">

                            {/* ══ FLUFFY TAIL ══ */}
                            <g className="tail">
                                <circle cx="91" cy="145" r="15" fill="url(#rg_tail)" />
                                <circle cx="89" cy="142" r="9" fill="white" opacity=".65" />
                                <circle cx="87" cy="140" r="5" fill="white" opacity=".5" />
                                <circle cx="93" cy="147" r="4" fill="white" opacity=".35" />
                                {/* fur texture on tail */}
                                <circle cx="91" cy="145" r="15" fill="url(#fur_strokes)" opacity=".3" />
                            </g>

                            {/* ══ LEGS ══ */}
                            <g className="leg-l">
                                <path d="M 33 157 Q 26 170 28 185 Q 30 198 42 199 Q 54 200 56 186 Q 58 172 50 160 Z"
                                    fill="url(#rg_body)" filter="url(#soft_fur)" />
                                {/* big realistic foot */}
                                <ellipse cx="40" cy="202" rx="19" ry="11" fill="url(#rg_body)" />
                                <ellipse cx="40" cy="202" rx="19" ry="11" fill="url(#fur_strokes)" opacity=".25" />
                                {/* foot highlight */}
                                <ellipse cx="33" cy="198" rx="9" ry="5" fill="white" opacity=".55" />
                                {/* toes with shadow */}
                                <circle cx="26" cy="202" r="5" fill="url(#rg_paw)" />
                                <circle cx="26" cy="202" r="5" fill="url(#fur_strokes)" opacity=".2" />
                                <circle cx="36" cy="207" r="5" fill="url(#rg_paw)" />
                                <circle cx="47" cy="207" r="5" fill="url(#rg_paw)" />
                                {/* toe nail hints */}
                                <ellipse cx="26" cy="205" rx="2" ry="1.2" fill="#e879a8" opacity=".2" />
                                <ellipse cx="36" cy="210" rx="2" ry="1.2" fill="#e879a8" opacity=".2" />
                                <ellipse cx="47" cy="210" rx="2" ry="1.2" fill="#e879a8" opacity=".2" />
                            </g>
                            <g className="leg-r">
                                <path d="M 87 157 Q 94 170 92 185 Q 90 198 78 199 Q 66 200 64 186 Q 62 172 70 160 Z"
                                    fill="url(#rg_body)" filter="url(#soft_fur)" />
                                <ellipse cx="80" cy="202" rx="19" ry="11" fill="url(#rg_body)" />
                                <ellipse cx="80" cy="202" rx="19" ry="11" fill="url(#fur_strokes)" opacity=".25" />
                                <ellipse cx="87" cy="198" rx="9" ry="5" fill="white" opacity=".55" />
                                <circle cx="94" cy="202" r="5" fill="url(#rg_paw)" />
                                <circle cx="84" cy="207" r="5" fill="url(#rg_paw)" />
                                <circle cx="73" cy="207" r="5" fill="url(#rg_paw)" />
                                <ellipse cx="94" cy="205" rx="2" ry="1.2" fill="#e879a8" opacity=".2" />
                                <ellipse cx="84" cy="210" rx="2" ry="1.2" fill="#e879a8" opacity=".2" />
                                <ellipse cx="73" cy="210" rx="2" ry="1.2" fill="#e879a8" opacity=".2" />
                            </g>

                            {/* ══ BODY ══ */}
                            <ellipse cx="60" cy="138" rx="36" ry="44" fill="url(#rg_body)" />
                            <ellipse cx="60" cy="138" rx="36" ry="44" fill="url(#fur_strokes)" opacity=".2" />
                            {/* belly lighter patch */}
                            <ellipse cx="60" cy="148" rx="19" ry="25" fill="url(#rg_belly)" />
                            {/* body specular highlight */}
                            <ellipse cx="44" cy="104" rx="11" ry="6" fill="white" opacity=".45" transform="rotate(-18,44,104)" />
                            <ellipse cx="48" cy="100" rx="6" ry="3" fill="white" opacity=".3" transform="rotate(-22,48,100)" />
                            {/* lower body crease shadow */}
                            <path d="M 36 158 Q 60 165 84 158" stroke="#e879a8" strokeWidth="1" fill="none" opacity=".2" strokeLinecap="round" />

                            {/* ══ LEFT ARM ══ */}
                            <g className="arm-l" style={{ transform: `rotate(${lArm}deg)` }}>
                                <path d="M 28 100 Q 17 114 15 131 Q 13 148 22 155 Q 31 162 40 155 Q 48 148 46 131 Q 43 114 34 105 Z"
                                    fill="url(#rg_body)" filter="url(#soft_fur)" />
                                <path d="M 28 100 Q 17 114 15 131 Q 13 148 22 155 Q 31 162 40 155 Q 48 148 46 131 Q 43 114 34 105 Z"
                                    fill="url(#fur_strokes)" opacity=".18" />
                                {/* arm highlight */}
                                <ellipse cx="21" cy="120" rx="5" ry="12" fill="white" opacity=".3" transform="rotate(-8,21,120)" />
                                {/* paw */}
                                <ellipse cx="29" cy="160" rx="13" ry="11" fill="url(#rg_paw)" />
                                <ellipse cx="29" cy="160" rx="13" ry="11" fill="url(#fur_strokes)" opacity=".2" />
                                <ellipse cx="29" cy="165" rx="8" ry="4" fill="#fbcfe8" opacity=".75" />
                                <circle cx="22" cy="159" r="4.5" fill="#fbcfe8" opacity=".6" />
                                <circle cx="29" cy="156" r="4.5" fill="#fbcfe8" opacity=".6" />
                                <circle cx="36" cy="159" r="4.5" fill="#fbcfe8" opacity=".6" />
                                {/* paw pad shine */}
                                <ellipse cx="22" cy="158" rx="1.5" ry="1" fill="white" opacity=".5" />
                                <ellipse cx="29" cy="155" rx="1.5" ry="1" fill="white" opacity=".5" />
                                <ellipse cx="36" cy="158" rx="1.5" ry="1" fill="white" opacity=".5" />
                            </g>

                            {/* ══ RIGHT ARM ══ */}
                            <g className="arm-r" style={{ transform: `rotate(${rArm}deg)` }}>
                                <path d="M 92 100 Q 103 114 105 131 Q 107 148 98 155 Q 89 162 80 155 Q 72 148 74 131 Q 77 114 86 105 Z"
                                    fill="url(#rg_body)" filter="url(#soft_fur)" />
                                <path d="M 92 100 Q 103 114 105 131 Q 107 148 98 155 Q 89 162 80 155 Q 72 148 74 131 Q 77 114 86 105 Z"
                                    fill="url(#fur_strokes)" opacity=".18" />
                                <ellipse cx="99" cy="120" rx="5" ry="12" fill="white" opacity=".3" transform="rotate(8,99,120)" />
                                <ellipse cx="91" cy="160" rx="13" ry="11" fill="url(#rg_paw)" />
                                <ellipse cx="91" cy="160" rx="13" ry="11" fill="url(#fur_strokes)" opacity=".2" />
                                <ellipse cx="91" cy="165" rx="8" ry="4" fill="#fbcfe8" opacity=".75" />
                                <circle cx="84" cy="159" r="4.5" fill="#fbcfe8" opacity=".6" />
                                <circle cx="91" cy="156" r="4.5" fill="#fbcfe8" opacity=".6" />
                                <circle cx="98" cy="159" r="4.5" fill="#fbcfe8" opacity=".6" />
                                <ellipse cx="84" cy="158" rx="1.5" ry="1" fill="white" opacity=".5" />
                                <ellipse cx="91" cy="155" rx="1.5" ry="1" fill="white" opacity=".5" />
                                <ellipse cx="98" cy="158" rx="1.5" ry="1" fill="white" opacity=".5" />
                            </g>

                            {/* ══ EARS ══ */}
                            <g className="ear-l">
                                {/* outer ear with fur texture */}
                                <path d="M 28 56 Q 21 32 29 10 Q 36 -9 44 10 Q 51 30 47 56 Z" fill="url(#rg_ear_out)" />
                                <path d="M 28 56 Q 21 32 29 10 Q 36 -9 44 10 Q 51 30 47 56 Z" fill="url(#fur_strokes)" opacity=".22" />
                                {/* inner ear — realistic pink canal */}
                                <path d="M 31 53 Q 26 32 33 14 Q 37 3 43 14 Q 47 30 45 53 Z" fill="url(#rg_ear_in)" />
                                {/* ear vein lines */}
                                <path d="M 37 18 Q 36 30 37 46" stroke="#f87171" strokeWidth=".6" fill="none" opacity=".3" strokeLinecap="round" />
                                <path d="M 40 16 Q 40 30 39 48" stroke="#fca5a5" strokeWidth=".5" fill="none" opacity=".25" strokeLinecap="round" />
                                {/* ear rim highlight */}
                                <path d="M 29 52 Q 22 34 30 12" stroke="white" strokeWidth="1.5" fill="none" opacity=".25" strokeLinecap="round" />
                                {/* ear tip fluffy */}
                                <ellipse cx="37" cy="8" rx="5" ry="4" fill="white" opacity=".45" />
                            </g>
                            <g className="ear-r">
                                <path d="M 92 56 Q 99 32 91 10 Q 84 -9 76 10 Q 69 30 73 56 Z" fill="url(#rg_ear_out)" />
                                <path d="M 92 56 Q 99 32 91 10 Q 84 -9 76 10 Q 69 30 73 56 Z" fill="url(#fur_strokes)" opacity=".22" />
                                <path d="M 89 53 Q 94 32 87 14 Q 83 3 77 14 Q 73 30 75 53 Z" fill="url(#rg_ear_in)" />
                                <path d="M 83 18 Q 84 30 83 46" stroke="#f87171" strokeWidth=".6" fill="none" opacity=".3" strokeLinecap="round" />
                                <path d="M 80 16 Q 80 30 81 48" stroke="#fca5a5" strokeWidth=".5" fill="none" opacity=".25" strokeLinecap="round" />
                                <path d="M 91 52 Q 98 34 90 12" stroke="white" strokeWidth="1.5" fill="none" opacity=".25" strokeLinecap="round" />
                                <ellipse cx="83" cy="8" rx="5" ry="4" fill="white" opacity=".45" />
                            </g>

                            {/* ══ HEAD ══ */}
                            <circle cx="60" cy="72" r="38" fill="url(#rg_head)" />
                            <circle cx="60" cy="72" r="38" fill="url(#fur_strokes)" opacity=".15" />
                            {/* head form highlight — large soft */}
                            <ellipse cx="44" cy="50" rx="16" ry="11" fill="white" opacity=".38" transform="rotate(-20,44,50)" />
                            {/* secondary specular */}
                            <ellipse cx="48" cy="46" rx="8" ry="5" fill="white" opacity=".22" transform="rotate(-25,48,46)" />
                            {/* head base shadow */}
                            <ellipse cx="60" cy="102" rx="28" ry="8" fill="#e879a8" opacity=".08" />
                            {/* cheek fur tufts */}
                            <ellipse cx="26" cy="75" rx="10" ry="7" fill="url(#fur_strokes)" opacity=".3" transform="rotate(-15,26,75)" />
                            <ellipse cx="94" cy="75" rx="10" ry="7" fill="url(#fur_strokes)" opacity=".3" transform="rotate(15,94,75)" />

                            {/* ── LISTENING ORBIT ── */}
                            {isListening && (
                                <g style={{ animation: 'spinOrbit 3s linear infinite', transformOrigin: '60px 72px' }}>
                                    <circle cx="60" cy="72" r="47" fill="none"
                                        stroke="url(#orbitGrad)" strokeWidth="2.5" strokeLinecap="round"
                                        strokeDasharray="28 46" />
                                </g>
                            )}

                            {/* ══ EYES ══ — realistic layered */}
                            {/* LEFT EYE */}
                            <g filter="url(#eye_depth)">
                                {/* sclera (white of eye) — slightly cream */}
                                <ellipse cx="47" cy="70" rx="11" ry={blink ? 1.2 : 12} fill="#fdf8f0" />
                                {/* limbal ring shadow */}
                                {!blink && <ellipse cx="47" cy="70" rx="11" ry="12" fill="none" stroke="#c4a882" strokeWidth=".8" opacity=".3" />}
                                {/* iris */}
                                {!blink && <ellipse cx="47" cy="70" rx="8" ry="9" fill="url(#rg_eye_iris)" />}
                                {/* pupil */}
                                {!blink && <ellipse cx="47" cy="71" rx="4.5" ry={isThinking ? 4 : 5.5} fill="url(#rg_eye_pupil)" />}
                                {/* iris texture ring */}
                                {!blink && <ellipse cx="47" cy="70" rx="8" ry="9" fill="none" stroke="#8b4513" strokeWidth=".6" opacity=".2" />}
                                {/* catchlight — large */}
                                {!blink && <ellipse cx="50" cy="65" rx="3.5" ry="3" fill="white" opacity=".92" />}
                                {/* catchlight — small secondary */}
                                {!blink && <circle cx="43" cy="73" r="1.4" fill="white" opacity=".55" />}
                                {/* lower lid shadow */}
                                {!blink && <path d="M 37 72 Q 47 78 57 72" stroke="#e8c4a8" strokeWidth="1" fill="none" opacity=".4" />}
                                {/* upper lash line */}
                                {!blink && <path d="M 37 66 Q 47 62 57 66" stroke="#5c3317" strokeWidth="1.2" fill="none" opacity=".6" />}
                            </g>

                            {/* RIGHT EYE */}
                            <g filter="url(#eye_depth)">
                                <ellipse cx="73" cy="70" rx="11" ry={blink ? 1.2 : 12} fill="#fdf8f0" />
                                {!blink && <ellipse cx="73" cy="70" rx="11" ry="12" fill="none" stroke="#c4a882" strokeWidth=".8" opacity=".3" />}
                                {!blink && <ellipse cx="73" cy="70" rx="8" ry="9" fill="url(#rg_eye_iris)" />}
                                {!blink && <ellipse cx="73" cy="71" rx="4.5" ry={isThinking ? 4 : 5.5} fill="url(#rg_eye_pupil)" />}
                                {!blink && <ellipse cx="73" cy="70" rx="8" ry="9" fill="none" stroke="#8b4513" strokeWidth=".6" opacity=".2" />}
                                {!blink && <ellipse cx="76" cy="65" rx="3.5" ry="3" fill="white" opacity=".92" />}
                                {!blink && <circle cx="69" cy="73" r="1.4" fill="white" opacity=".55" />}
                                {!blink && <path d="M 63 72 Q 73 78 83 72" stroke="#e8c4a8" strokeWidth="1" fill="none" opacity=".4" />}
                                {!blink && <path d="M 63 66 Q 73 62 83 66" stroke="#5c3317" strokeWidth="1.2" fill="none" opacity=".6" />}
                            </g>

                            {/* thinking — pupils shift up-left */}
                            {isThinking && !blink && <>
                                <ellipse cx="45" cy="67" rx="4.5" ry="4" fill="url(#rg_eye_pupil)" />
                                <ellipse cx="48" cy="64" rx="3.5" ry="3" fill="white" opacity=".92" />
                                <ellipse cx="71" cy="67" rx="4.5" ry="4" fill="url(#rg_eye_pupil)" />
                                <ellipse cx="74" cy="64" rx="3.5" ry="3" fill="white" opacity=".92" />
                            </>}

                            {/* ══ CHEEK BLUSH ══ */}
                            <ellipse cx="30" cy="80" rx="11" ry="7" fill="#fda4af" opacity=".28" />
                            <ellipse cx="90" cy="80" rx="11" ry="7" fill="#fda4af" opacity=".28" />
                            {/* cheek highlight */}
                            <ellipse cx="28" cy="77" rx="5" ry="3" fill="white" opacity=".22" />
                            <ellipse cx="92" cy="77" rx="5" ry="3" fill="white" opacity=".22" />

                            {/* ══ NOSE ══ */}
                            <g className="nose-g" filter="url(#nose_glow)">
                                {/* nose bridge */}
                                <path d="M 60 86 L 54 80 Q 60 76 66 80 Z" fill="#fecdd3" opacity=".5" />
                                {/* nose body */}
                                <path d="M 54 83 Q 60 78 66 83 Q 63 88 60 89 Q 57 88 54 83 Z" fill="url(#rg_nose)" />
                                {/* nostril shadows */}
                                <ellipse cx="56.5" cy="85" rx="2.5" ry="1.5" fill="#f43f5e" opacity=".3" transform="rotate(-10,56.5,85)" />
                                <ellipse cx="63.5" cy="85" rx="2.5" ry="1.5" fill="#f43f5e" opacity=".3" transform="rotate(10,63.5,85)" />
                                {/* nose highlight */}
                                <ellipse cx="58" cy="81" rx="3" ry="2" fill="white" opacity=".55" />
                                <ellipse cx="57.5" cy="80.5" rx="1.5" ry="1" fill="white" opacity=".35" />
                            </g>

                            {/* ══ WHISKERS ══ — 3 per side, varying weight */}
                            {/* left whiskers */}
                            <line x1="16" y1="76" x2="51" y2="82" stroke="#cbd5e1" strokeWidth="1.1" opacity=".85" strokeLinecap="round" />
                            <line x1="16" y1="82" x2="51" y2="84" stroke="#cbd5e1" strokeWidth=".9" opacity=".75" strokeLinecap="round" />
                            <line x1="18" y1="88" x2="51" y2="86" stroke="#cbd5e1" strokeWidth=".7" opacity=".6" strokeLinecap="round" />
                            {/* right whiskers */}
                            <line x1="104" y1="76" x2="69" y2="82" stroke="#cbd5e1" strokeWidth="1.1" opacity=".85" strokeLinecap="round" />
                            <line x1="104" y1="82" x2="69" y2="84" stroke="#cbd5e1" strokeWidth=".9" opacity=".75" strokeLinecap="round" />
                            <line x1="102" y1="88" x2="69" y2="86" stroke="#cbd5e1" strokeWidth=".7" opacity=".6" strokeLinecap="round" />
                            {/* whisker base dots */}
                            <circle cx="51" cy="83" r="1.5" fill="#fca5a5" opacity=".4" />
                            <circle cx="69" cy="83" r="1.5" fill="#fca5a5" opacity=".4" />

                            {/* ══ MOUTH ══ */}
                            {isSpeaking ? (
                                <g style={{ animation: 'mouthBounce .46s ease-in-out infinite', transformOrigin: '60px 84px' }}>
                                    {/* mouth cavity — dark warm pink */}
                                    <path d="M 50 79 Q 60 97 70 79 Q 65 73 60 72 Q 55 73 50 79 Z" fill="#7c1f3e" />
                                    {/* mouth cavity ambient light */}
                                    <path d="M 50 79 Q 60 97 70 79 Q 65 73 60 72 Q 55 73 50 79 Z" fill="url(#rg_ear_in)" opacity=".15" />
                                    {/* tongue — realistic layered */}
                                    <ellipse cx="60" cy="92" rx="8" ry="5" fill="#f43f5e" opacity=".95" />
                                    <ellipse cx="60" cy="91" rx="6" ry="3.5" fill="#fb7185" opacity=".7" />
                                    <ellipse cx="60" cy="90" rx="3" ry="2" fill="#fda4af" opacity=".4" />
                                    {/* tongue center groove */}
                                    <line x1="60" y1="88" x2="60" y2="95" stroke="#e11d48" strokeWidth=".8" opacity=".3" strokeLinecap="round" />
                                    {/* ── REALISTIC VOCAL WAVES — undulating sine curves over tongue ── */}
                                    <g clipPath="url(#mouthClip)">
                                        {/* wave 3 — deepest, faintest, uppermost */}
                                        <path
                                            d="M 53 82 Q 56 79 59 82 Q 62 85 65 82 Q 68 79 71 82"
                                            stroke="rgba(255,255,255,0.38)" strokeWidth="1.2" fill="none" strokeLinecap="round"
                                            style={{ animation: 'vocalWave3 .55s ease-in-out infinite', animationDelay: '.1s' }}
                                        />
                                        {/* wave 2 — mid layer */}
                                        <path
                                            d="M 52 85 Q 55 82 58 85 Q 61 88 64 85 Q 67 82 70 85"
                                            stroke="rgba(255,255,255,0.58)" strokeWidth="1.6" fill="none" strokeLinecap="round"
                                            style={{ animation: 'vocalWave2 .48s ease-in-out infinite', animationDelay: '.05s' }}
                                        />
                                        {/* wave 1 — loudest, over tongue surface */}
                                        <path
                                            d="M 51 90 Q 54 87 57 90 Q 60 93 63 90 Q 66 87 69 90"
                                            stroke="rgba(255,255,255,0.82)" strokeWidth="2" fill="none" strokeLinecap="round"
                                            style={{ animation: 'vocalWave .42s ease-in-out infinite' }}
                                        />
                                        {/* subtle ambient glow under waves */}
                                        <ellipse cx="60" cy="89" rx="9" ry="4" fill="white" opacity=".08" />
                                    </g>
                                    {/* upper teeth */}
                                    <rect x="53.5" y="71.5" width="7" height="5.5" rx="2" fill="#fffbf0" />
                                    <rect x="61.5" y="71.5" width="7" height="5.5" rx="2" fill="#fffbf0" />
                                    <line x1="60" y1="71.5" x2="60" y2="77" stroke="#ede0c8" strokeWidth=".8" opacity=".5" />
                                    {/* tooth highlights */}
                                    <rect x="54.5" y="72" width="2.5" height="2" rx="1" fill="white" opacity=".6" />
                                    <rect x="62.5" y="72" width="2.5" height="2" rx="1" fill="white" opacity=".6" />
                                    {/* lower lip */}
                                    <path d="M 50 79 Q 60 97 70 79" stroke="#fda4af" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                                    {/* upper lip */}
                                    <path d="M 50 79 Q 55 73 60 72 Q 65 73 70 79" stroke="#fca5a5" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                                    {/* lip corner shadows */}
                                    <circle cx="50" cy="79" r="1.5" fill="#f87171" opacity=".4" />
                                    <circle cx="70" cy="79" r="1.5" fill="#f87171" opacity=".4" />
                                </g>
                            ) : (
                                <>
                                    {/* closed mouth — realistic W-lip shape */}
                                    <path d={{
                                        idle: 'M 52 86 Q 55 90 60 91 Q 65 90 68 86',
                                        speaking: 'M 52 86 Q 55 90 60 91 Q 65 90 68 86',
                                        thinking: 'M 54 87 Q 57 85 60 85 Q 63 85 66 87',
                                        listening: 'M 52 87 Q 56 91 60 92 Q 64 91 68 87',
                                    }[mood]}
                                        stroke="#fca5a5" strokeWidth="2" strokeLinecap="round" fill="none"
                                        style={{ transition: 'd .25s ease' }}
                                    />
                                    {/* upper lip line */}
                                    <path d={{
                                        idle: 'M 52 86 Q 55 83 60 82 Q 65 83 68 86',
                                        speaking: 'M 52 86 Q 55 83 60 82 Q 65 83 68 86',
                                        thinking: 'M 54 87 Q 57 84 60 83 Q 63 84 66 87',
                                        listening: 'M 52 87 Q 56 84 60 83 Q 64 84 68 87',
                                    }[mood]}
                                        stroke="#fda4af" strokeWidth="1.2" strokeLinecap="round" fill="none"
                                        style={{ transition: 'd .25s ease' }}
                                    />
                                    {/* philtrum — small indent above lip */}
                                    <line x1="60" y1="82" x2="60" y2="86" stroke="#fca5a5" strokeWidth="1" strokeLinecap="round" opacity=".5" />
                                    {/* corner dots */}
                                    <circle cx="52" cy="86" r="1.2" fill="#fca5a5" opacity=".5" />
                                    <circle cx="68" cy="86" r="1.2" fill="#fca5a5" opacity=".5" />
                                </>
                            )}

                            {/* ══ THINKING DOTS ══ */}
                            {isThinking && (<>
                                <circle cx="75" cy="40" r="5.5" fill={accentCol} style={{ animation: 'td1 1.2s ease-in-out infinite' }} />
                                <circle cx="87" cy="30" r="5.5" fill={accentCol} style={{ animation: 'td2 1.2s ease-in-out infinite' }} />
                                <circle cx="99" cy="21" r="5.5" fill={accentCol} style={{ animation: 'td3 1.2s ease-in-out infinite' }} />
                            </>)}

                            {/* ══ REALISTIC SOUND RIPPLES — expand from mouth corner ══ */}
                            {isSpeaking && (
                                <g>
                                    {/* ripple origin: right side of mouth ~(70, 79) */}
                                    <circle cx="72" cy="78" r="2" fill="none" stroke={accentCol} strokeWidth="1.8"
                                        style={{ animation: 'ripple0 1.1s ease-out infinite', animationDelay: '0s' }} />
                                    <circle cx="72" cy="78" r="2" fill="none" stroke={accentCol} strokeWidth="1.6"
                                        style={{ animation: 'ripple1 1.1s ease-out infinite', animationDelay: '.28s' }} />
                                    <circle cx="72" cy="78" r="2" fill="none" stroke={accentCol} strokeWidth="1.4"
                                        style={{ animation: 'ripple2 1.1s ease-out infinite', animationDelay: '.56s' }} />
                                    <circle cx="72" cy="78" r="2" fill="none" stroke={accentCol} strokeWidth="1.2"
                                        style={{ animation: 'ripple3 1.1s ease-out infinite', animationDelay: '.84s' }} />
                                </g>
                            )}

                            {/* ══ IDLE SPARKLES ══ */}
                            {mood === 'idle' && (<>
                                {[{ x: 107, y: 50, s: 9, d: 0 }, { x: 116, y: 36, s: 6, d: .8 }, { x: 101, y: 28, s: 7, d: 1.5 }].map(({ x, y, s, d }, i) => (
                                    <g key={i} style={{ animation: `sparkleFloat 2.4s ease-in-out ${d}s infinite`, transformOrigin: `${x}px ${y}px` }}>
                                        <path d={`M${x},${y - s / 2} L${x + s * .12},${y - s * .12} L${x + s / 2},${y} L${x + s * .12},${y + s * .12} L${x},${y + s / 2} L${x - s * .12},${y + s * .12} L${x - s / 2},${y} L${x - s * .12},${y - s * .12} Z`}
                                            fill={accentCol} opacity=".85" />
                                    </g>
                                ))}
                            </>)}

                            {/* ══ HEART POP ══ */}
                            {heartPop && (
                                <g className="heart">
                                    <path d="M 60 42 C 60 39 57 36 54 38 C 51 40 51 44 54 47 L 60 54 L 66 47 C 69 44 69 40 66 38 C 63 36 60 39 60 42 Z"
                                        fill="#f472b6" opacity=".95" />
                                    <path d="M 58 41 C 58 39.5 56.5 38.5 55.5 39.5 C 55 40 55.5 41.5 57 42.5 Z" fill="white" opacity=".55" />
                                </g>
                            )}

                        </g>{/* bunny-body */}
                    </svg>

                    {/* ══ STATUS PILL ══ */}
                    <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                        <div className="status-pill" style={{
                            fontSize: 9.5, fontWeight: 700, letterSpacing: '.03em',
                            color: mood === 'idle' ? '#be185d' : mood === 'speaking' ? '#9d174d' : mood === 'thinking' ? '#92400e' : '#065f46',
                            padding: '4px 10px',
                            background: mood === 'idle' ? '#fce7f3' : mood === 'speaking' ? '#fce7f3' : mood === 'thinking' ? '#fef3c7' : '#d1fae5',
                            borderRadius: 20,
                            display: 'inline-block',
                            transition: 'all .5s',
                            boxShadow: `0 2px 8px ${accentCol}44`,
                        }}>
                            {statusLabel}
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}