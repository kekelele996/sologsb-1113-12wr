import { useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useEquipmentStore } from '../stores/equipmentStore';
import type { ConflictItem, ObsSession } from '../types';
import { overlapMinutes } from '../utils/astro';
import { changeoversForNight, findAdjacentChangeovers, type ChangeoverRequirement } from '../utils/changeover';

export interface ConflictCheckInput {
  nightId: string;
  telescopeId: string;
  startTime: string;
  endTime: string;
  instrumentId: string;
  filterSlot: string;
  /** 编辑时忽略自身 */
  ignoreSessionId?: string;
}

export interface ConflictCheckApi {
  findConflicts: (input: ConflictCheckInput) => ConflictItem[];
  /** 某一观测夜内的全部冲突（同望远镜重叠 + 换装缓冲不足） */
  conflictsOfNight: (nightId: string) => ConflictItem[];
  /** 冲突排程段 id 集合（可传观测夜过滤） */
  conflictIds: (nightId?: string) => Set<string>;
  hasConflict: (sessionId: string) => boolean;
}

function describeOverlap(a: ObsSession, b: ObsSession): ConflictItem | null {
  if (a.nightId !== b.nightId || a.telescopeId !== b.telescopeId || a.id === b.id) {
    return null;
  }
  const overlap = overlapMinutes(a.startTime, a.endTime, b.startTime, b.endTime);
  if (overlap <= 0) {
    return null;
  }
  const overlapStart = a.startTime > b.startTime ? a.startTime : b.startTime;
  return {
    kind: 'overlap',
    sessionId: a.id,
    otherId: b.id,
    nightId: a.nightId,
    telescopeId: a.telescopeId,
    overlapMinutes: overlap,
    overlapText: `${overlapStart} 起重叠 ${overlap} 分钟`,
  };
}

function describeChangeover(requirement: ChangeoverRequirement, sessionId: string): ConflictItem {
  const isNext = requirement.nextSession.id === sessionId;
  const otherId = isNext ? requirement.previousSession.id : requirement.nextSession.id;
  return {
    kind: 'changeover',
    sessionId,
    otherId,
    nightId: requirement.nightId,
    telescopeId: requirement.telescopeId,
    overlapMinutes: 0,
    bufferMinutes: requirement.bufferMinutes,
    gapMinutes: requirement.gapMinutes,
    earliestStartTime: requirement.earliestStartTime,
    subjectIsPrevious: !isNext,
    overlapText: isNext
      ? `与前一段换装配置不同，间隔 ${requirement.gapMinutes} 分钟，不足 ${requirement.bufferMinutes} 分钟；本段最早 ${requirement.earliestStartTime} 开始`
      : `与下一段换装配置不同，间隔 ${requirement.gapMinutes} 分钟，不足 ${requirement.bufferMinutes} 分钟；下一段最早 ${requirement.earliestStartTime} 开始`,
  };
}

function sameConflict(a: ConflictItem, b: ConflictItem): boolean {
  return a.kind === b.kind && a.sessionId === b.otherId && b.sessionId === a.otherId && a.telescopeId === b.telescopeId;
}

/** 输入设备与时段区间即返回冲突排程段数组；被排程段列表与设备分配视图消费 */
export function useConflictCheck(): ConflictCheckApi {
  const sessions = useSessionStore((s) => s.sessions);
  const telescopes = useEquipmentStore((s) => s.telescopes);

  const findConflicts = useCallback(
    (input: ConflictCheckInput): ConflictItem[] => {
      const candidate: ObsSession = {
        id: input.ignoreSessionId ?? '__candidate__',
        nightId: input.nightId,
        targetId: '',
        startTime: input.startTime,
        endTime: input.endTime,
        telescopeId: input.telescopeId,
        instrumentId: input.instrumentId,
        filterSlot: input.filterSlot,
        plannedFrames: 0,
        status: '待执行',
        schemaVersion: 3,
      };
      const overlaps = sessions
        .filter((session) => session.id !== input.ignoreSessionId)
        .map((session) => describeOverlap(candidate, session))
        .filter((item): item is ConflictItem => item !== null);

      const changeovers = findAdjacentChangeovers({
        candidate,
        sessions,
        telescopes,
        ignoreSessionId: input.ignoreSessionId,
      })
        .filter((requirement) => !requirement.satisfied)
        .map((requirement) => describeChangeover(requirement, candidate.id));

      return [...overlaps, ...changeovers];
    },
    [sessions, telescopes],
  );

  const conflictsOfNight = useCallback(
    (nightId: string): ConflictItem[] => {
      const scoped = sessions.filter((session) => session.nightId === nightId);
      const result: ConflictItem[] = [];

      scoped.forEach((a) => {
        scoped.forEach((b) => {
          const item = describeOverlap(a, b);
          if (item && !result.some((existing) => sameConflict(existing, item))) {
            result.push(item);
          }
        });
      });

      changeoversForNight(nightId, sessions, telescopes)
        .filter((requirement) => !requirement.satisfied)
        .forEach((requirement) => {
          result.push(describeChangeover(requirement, requirement.nextSession.id));
        });

      return result;
    },
    [sessions, telescopes],
  );

  const conflictIds = useCallback(
    (nightId?: string): Set<string> => {
      const ids = new Set<string>();
      const targetNights = nightId ? [nightId] : Array.from(new Set(sessions.map((session) => session.nightId)));
      targetNights.forEach((id) => {
        const scoped = sessions.filter((session) => session.nightId === id);
        scoped.forEach((a) => {
          scoped.forEach((b) => {
            const item = describeOverlap(a, b);
            if (item) {
              ids.add(a.id);
              ids.add(b.id);
            }
          });
        });
        changeoversForNight(id, sessions, telescopes)
          .filter((requirement) => !requirement.satisfied)
          .forEach((requirement) => {
            ids.add(requirement.previousSession.id);
            ids.add(requirement.nextSession.id);
          });
      });
      return ids;
    },
    [sessions, telescopes],
  );

  const hasConflict = useCallback((sessionId: string) => conflictIds().has(sessionId), [conflictIds]);

  return { findConflicts, conflictsOfNight, conflictIds, hasConflict };
}
