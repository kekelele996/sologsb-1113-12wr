import type { ObsSession, Telescope } from '../types';
import { axisMinutes, minutesToTime } from './astro';

export interface ChangeoverEquipment {
  instrumentId: string;
  filterSlot: string;
}

export interface ChangeoverRequirement {
  previousSession: ObsSession;
  nextSession: ObsSession;
  telescopeId: string;
  nightId: string;
  /** 缓冲开始的时间轴刻度 */
  prepStartMinute: number;
  /** 按缓冲要求计算出的准备结束时刻 */
  prepEndMinute: number;
  /** 下一段计划开始时刻 */
  nextStartMinute: number;
  /** 下一段最早可开始时刻 */
  earliestStartMinute: number;
  earliestStartTime: string;
  bufferMinutes: number;
  gapMinutes: number;
  satisfied: boolean;
}

interface SessionInterval extends ChangeoverEquipment {
  id: string;
  startMinute: number;
  endMinute: number;
}

export function endAxisMinutes(session: Pick<ObsSession, 'startTime' | 'endTime'>): number {
  const start = axisMinutes(session.startTime);
  const end = axisMinutes(session.endTime);
  return end <= start ? end + 1440 : end;
}

function toInterval(session: ObsSession): SessionInterval {
  return {
    id: session.id,
    startMinute: axisMinutes(session.startTime),
    endMinute: endAxisMinutes(session),
    instrumentId: session.instrumentId,
    filterSlot: session.filterSlot,
  };
}

export function hasEquipmentChange(a: ChangeoverEquipment, b: ChangeoverEquipment): boolean {
  return a.instrumentId !== b.instrumentId || a.filterSlot !== b.filterSlot;
}

function buildRequirement(previous: ObsSession, next: ObsSession, bufferMinutes: number): ChangeoverRequirement | null {
  if (bufferMinutes <= 0) return null;
  const previousEnd = endAxisMinutes(previous);
  const nextStart = axisMinutes(next.startTime);
  const gapMinutes = nextStart - previousEnd;
  if (gapMinutes < 0) return null;

  const earliestStartMinute = previousEnd + Math.max(0, bufferMinutes);
  return {
    previousSession: previous,
    nextSession: next,
    telescopeId: previous.telescopeId,
    nightId: previous.nightId,
    prepStartMinute: Math.max(0, previousEnd),
    prepEndMinute: earliestStartMinute,
    nextStartMinute: nextStart,
    earliestStartMinute,
    earliestStartTime: minutesToTime(earliestStartMinute),
    bufferMinutes: Math.max(0, bufferMinutes),
    gapMinutes,
    satisfied: gapMinutes >= bufferMinutes,
  };
}

function adjacentPair<T extends SessionInterval>(ordered: T[], candidate: T): { previous?: T; next?: T } {
  const before = ordered.filter((item) => item.endMinute <= candidate.startMinute);
  const after = ordered.filter((item) => item.startMinute >= candidate.endMinute);
  return {
    previous: before.sort((a, b) => b.endMinute - a.endMinute)[0],
    next: after.sort((a, b) => a.startMinute - b.startMinute)[0],
  };
}

function resolveSession(id: string, sessions: ObsSession[], candidate?: ObsSession): ObsSession | undefined {
  if (id === candidate?.id && !sessions.some((session) => session.id === id)) return candidate;
  return sessions.find((session) => session.id === id);
}

/** 校验候选排程段与前/后相邻段的终端、滤镜换装缓冲 */
export function findAdjacentChangeovers(input: {
  candidate: ObsSession;
  sessions: ObsSession[];
  telescopes: Telescope[];
  ignoreSessionId?: string;
}): ChangeoverRequirement[] {
  const { candidate, sessions, telescopes, ignoreSessionId } = input;
  const telescope = telescopes.find((item) => item.id === candidate.telescopeId);
  if (!telescope) return [];

  const scoped = sessions.filter(
    (session) =>
      session.nightId === candidate.nightId &&
      session.telescopeId === candidate.telescopeId &&
      session.id !== ignoreSessionId,
  );
  const intervals = scoped.map(toInterval);
  const candidateInterval = toInterval(candidate);
  const { previous, next } = adjacentPair(intervals, candidateInterval);
  const result: ChangeoverRequirement[] = [];

  if (previous && hasEquipmentChange(previous, candidate)) {
    const previousSession = resolveSession(previous.id, sessions, candidate);
    const requirement = previousSession ? buildRequirement(previousSession, candidate, telescope.changeoverBufferMinutes) : null;
    if (requirement) result.push(requirement);
  }
  if (next && hasEquipmentChange(candidate, next)) {
    const nextSession = resolveSession(next.id, sessions, candidate);
    const requirement = nextSession ? buildRequirement(candidate, nextSession, telescope.changeoverBufferMinutes) : null;
    if (requirement) result.push(requirement);
  }

  return result;
}

/** 汇总某观测夜全部同望远镜相邻段的换装准备（满足与不满足都用于画图） */
export function changeoversForNight(nightId: string, sessions: ObsSession[], telescopes: Telescope[]): ChangeoverRequirement[] {
  const result: ChangeoverRequirement[] = [];
  telescopes.forEach((telescope) => {
    const ordered = sessions
      .filter((session) => session.nightId === nightId && session.telescopeId === telescope.id)
      .sort((a, b) => axisMinutes(a.startTime) - axisMinutes(b.startTime));
    if (!nightId || ordered.length === 0) return;

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const next = ordered[index];
      const gapMinutes = axisMinutes(next.startTime) - endAxisMinutes(previous);
      if (gapMinutes >= 0 && hasEquipmentChange(previous, next)) {
        const requirement = buildRequirement(previous, next, telescope.changeoverBufferMinutes);
        if (requirement) result.push(requirement);
      }
    }
  });
  return result;
}
