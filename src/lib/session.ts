"use client";

import type { Session } from "./types";

const KEY = "skillforge.session.v1";

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore quota errors
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function emptySession(): Session {
  return {
    context: null,
    assessments: [],
    scores: null,
    summary: null,
    plan: null,
    current_skill_index: 0,
    created_at: new Date().toISOString(),
  };
}
