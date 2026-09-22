"use client";

import Link from "next/link";

const SUBJECTS = [
    {
        id: "languages",
        icon: "🗣️",
        name: "Languages",
        tagline: "Learn any language step by step — words first, then sentences.",
        status: "live",
        href: "/education/languages",
        count: "35 languages · lessons, streaks, leagues, crowns",
    },
    {
        id: "maths",
        icon: "🧮",
        name: "Mathematics",
        tagline: "From kindergarten counting to matriculation maths. MCQ warm-up, then step-by-step solutions.",
        status: "live",
        href: "/education/course/maths",
        count: "Kindergarten → Primary → Middle → Matriculation",
    },
    {
        id: "physics",
        icon: "⚛️",
        name: "Physics",
        tagline: "Mechanics to quantum — concepts, derivations and practise.",
        status: "soon",
    },
    {
        id: "cs",
        icon: "💻",
        name: "Computer Science",
        tagline: "Programming, data structures, algorithms and how computers think.",
        status: "soon",
    },
    {
        id: "chemistry",
        icon: "🧪",
        name: "Chemistry",
        tagline: "Atoms, reactions and the science of everything around you.",
        status: "soon",
    },
    {
        id: "biology",
        icon: "🧬",
        name: "Biology",
        tagline: "From cells to ecosystems — life, explained.",
        status: "soon",
    },
    {
        id: "life-skills",
        icon: "🌸",
        name: "Life Skills",
        tagline: "How to live a good, healthy life — habits, money, well-being.",
        status: "soon",
    },
    {
        id: "mcq-bank",
        icon: "📝",
        name: "MCQ Bank",
        tagline: "Thousands of practice multiple-choice questions across every subject.",
        status: "soon",
    },
    {
        id: "iq",
        icon: "🧠",
        name: "IQ Test",
        tagline: "Reasoning, logic and pattern puzzles to measure your thinking.",
        status: "live",
        href: "/education/course/iq",
        count: "Numerical · verbal · spatial reasoning",
    },
    {
        id: "character",
        icon: "🪞",
        name: "Character Test",
        tagline: "Understand your personality, values and strengths.",
        status: "live",
        href: "/education/course/character",
        count: "Honesty · kindness · discipline",
    },
    {
        id: "psychology",
        icon: "🫀",
        name: "Psychology",
        tagline: "Why we think, feel and act the way we do.",
        status: "soon",
    },
];

export default function EducationHub() {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
            <div className="max-w-3xl mx-auto px-4 py-6">
                <div className="mb-8">
                    <h1 className="text-2xl font-extrabold text-[#58cc02] tracking-tight">Education</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Pick your subject and level — lessons, quizzes and real practice in one place.
                    </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    {SUBJECTS.map((s) =>
                        s.status === "live" ? (
                            <Link
                                key={s.id}
                                href={s.href}
                                className="group relative text-left bg-white dark:bg-gray-900 border-2 border-[#e5e5e5] dark:border-gray-800 rounded-2xl p-4 hover:border-[#58cc02] transition-all hover:shadow-md"
                            >
                                <span className="absolute top-3 right-3 bg-[#58cc02] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">LIVE</span>
                                <span className="text-4xl block mb-3">{s.icon}</span>
                                <span className="font-bold text-sm text-gray-900 dark:text-gray-100 block">{s.name}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed block mt-0.5">{s.tagline}</span>
                                {s.count && <span className="text-[11px] font-bold text-[#1cb0f6] block mt-1">{s.count}</span>}
                                <span className="text-[11px] text-[#58cc02] font-bold mt-2 block group-hover:underline">Open {s.name.toLowerCase()} →</span>
                            </Link>
                        ) : (
                            <div
                                key={s.id}
                                className="relative text-left bg-white/60 dark:bg-gray-900/50 border-2 border-dashed border-gray-300 dark:border-gray-800 rounded-2xl p-4"
                            >
                                <span className="absolute top-3 right-3 text-[10px] font-bold text-gray-400">IN DEVELOPMENT</span>
                                <span className="text-4xl block mb-3 opacity-70">{s.icon}</span>
                                <span className="font-bold text-sm text-gray-500 dark:text-gray-400 block">{s.name}</span>
                                <span className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed block mt-0.5">{s.tagline}</span>
                                {s.flow && <span className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed block mt-2 italic">Planned: {s.flow}</span>}
                            </div>
                        )
                    )}
                </div>

                <div className="mt-8 bg-[#58cc02]/10 border border-[#58cc02]/30 rounded-2xl p-5 text-sm text-gray-600 dark:text-gray-300">
                    <p className="font-bold text-[#58cc02] mb-1">What&apos;s coming</p>
                    <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                        Languages are live today. Every other subject follows the same recipe: an <b>MCQ pass</b> to
                        check what you know, <b>solved examples narrated step by step</b>, then <b>real exercises</b>{" "}
                        with answer checking and a full solution revealed — so you always learn how, not just whether.
                    </p>
                </div>
            </div>
        </div>
    );
}