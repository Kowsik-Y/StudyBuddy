import Link from 'next/link';
import {
  BookOpen, GraduationCap, HelpCircle, BarChart2, ChevronRight, Video,
} from 'lucide-react';

const MODES = [
  {
    href: '/explain',
    icon: BookOpen,
    color: 'bg-indigo-600',
    title: 'Topic Explanation',
    desc: 'Speak a topic. AI explains clearly and asks probing follow-up questions to deepen your understanding.',
    badge: 'Learn',
    badgeBg: 'bg-indigo-50 text-indigo-600',
  },
  {
    href: '/viva',
    icon: GraduationCap,
    color: 'bg-violet-600',
    title: 'Viva Simulation',
    desc: 'Face a structured AI examiner. Answer timed technical questions and receive scored feedback each turn.',
    badge: 'Evaluate',
    badgeBg: 'bg-violet-50 text-violet-600',
  },
  {
    href: '/quiz',
    icon: HelpCircle,
    color: 'bg-emerald-600',
    title: 'Interactive Quiz',
    desc: 'Answer voice MCQs on core CS topics. Track your score across questions in real time.',
    badge: 'Quiz',
    badgeBg: 'bg-emerald-50 text-emerald-600',
  },
  {
    href: '/video-qa',
    icon: Video,
    color: 'bg-rose-600',
    title: 'Video Q&A',
    desc: 'Paste a YouTube URL or upload a video. AI transcribes it and answers your questions to clear any doubts.',
    badge: 'Understand',
    badgeBg: 'bg-rose-50 text-rose-600',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Hero */}
        <div className="flex flex-col items-center text-center mb-14">
          <div className="w-16 h-16 rounded-3xl bg-indigo-600 flex items-center justify-center shadow-lg mb-5">
            <GraduationCap size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Voice Study Assistant</h1>
          <p className="text-gray-500 text-sm mt-2 max-w-md">
            Practice speaking technical concepts, simulate viva exams, and take timed quizzes — all by voice.
          </p>
        </div>

        {/* Mode cards */}
        <div className="flex flex-col gap-4 mb-8">
          {MODES.map(m => (
            <Link
              key={m.href}
              href={m.href}
              className="group flex items-center gap-5 bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all p-5"
            >
              <div className={`w-12 h-12 rounded-2xl ${m.color} flex items-center justify-center shrink-0 shadow`}>
                <m.icon size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-gray-800">{m.title}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${m.badgeBg}`}>{m.badge}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{m.desc}</p>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
            </Link>
          ))}
        </div>

        {/* Analytics link */}
        <Link
          href="/analytics"
          className="group flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-5"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <BarChart2 size={18} className="text-gray-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">Performance Analytics</p>
              <p className="text-xs text-gray-400">View score trends, WER, latency, and session history</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
        </Link>
      </div>
    </div>
  );
}
