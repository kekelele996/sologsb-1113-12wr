import type { ObsSession, Telescope } from '../types';
import { axisMinutes, minutesToTime } from './astro';

/** 望远镜未登记换装缓冲时采用的默认值（分钟） */
export const DEFAULT_CHANGEOVER_MINUTES = 15;

/** 同一望远镜相邻两段排程之间的换装缓冲检查结果 */
export interface ChangeoverGap {
  nightId: string;
  telescopeId: string;
  /** 前一段排程段 ID */
  prevSessionId: string;
  /** 后一段排程段 ID */
  nextSessionId: string;
  /** 终端是否更换 */
  instrumentChanged: boolean;
  /** 滤镜是否更换 */
  filterChanged: boolean;
  /** 该望远镜登记的换装缓冲（分钟） */
  requiredMinutes: number;
  /** 前段结束到后段开始的实际间隔（分钟，跨零点安全，时段重叠时为负） */
  gapMinutes: number;
  /** 前段结束刻度（18:00 起算分钟，用于时间轴绘制） */
  prevEndAxis: number;
  /** 后段最早可开始刻度（前段结束 + 缓冲） */
  earliestStartAxis: number;
  /** 后段最早可开始时刻 HH:mm */
  earliestStart: string;
  /** 实际间隔是否不足缓冲 */
  insufficient: boolean;
}

/** 排程段结束刻度（跨零点自动 +1440） */
function endAxisOf(session: ObsSession): number {
  const start = axisMinutes(session.startTime);
  const end = axisMinutes(session.endTime);
  return end <= start ? end + 1440 : end;
}

function bufferOf(telescopes: Telescope[], telescopeId: string): number {
  const telescope = telescopes.find((item) => item.id === telescopeId);
  return typeof telescope?.changeoverMinutes === 'number' ? telescope.changeoverMinutes : DEFAULT_CHANGEOVER_MINUTES;
}

function buildGap(prev: ObsSession, next: ObsSession, requiredMinutes: number): ChangeoverGap | null {
  const instrumentChanged = prev.instrumentId !== next.instrumentId;
  const filterChanged = prev.filterSlot !== next.filterSlot;
  // 终端与滤镜都未变化时无需换装缓冲
  if (!instrumentChanged && !filterChanged) return null;
  const prevEndAxis = endAxisOf(prev);
  const gapMinutes = axisMinutes(next.startTime) - prevEndAxis;
  const earliestStartAxis = prevEndAxis + requiredMinutes;
  return {
    nightId: prev.nightId,
    telescopeId: prev.telescopeId,
    prevSessionId: prev.id,
    nextSessionId: next.id,
    instrumentChanged,
    filterChanged,
    requiredMinutes,
    gapMinutes,
    prevEndAxis,
    earliestStartAxis,
    earliestStart: minutesToTime(earliestStartAxis),
    insufficient: gapMinutes < requiredMinutes,
  };
}

/**
 * 逐台望远镜比较同一观测夜内相邻两段排程的终端与滤镜：
 * 配置发生变化时按登记的换装缓冲分钟数校验间隔，返回全部需要缓冲的相邻段对。
 */
export function changeoverGaps(sessions: ObsSession[], telescopes: Telescope[], nightId?: string): ChangeoverGap[] {
  const groups = new Map<string, ObsSession[]>();
  sessions
    .filter((session) => !nightId || session.nightId === nightId)
    .forEach((session) => {
      const key = `${session.nightId}|${session.telescopeId}`;
      groups.set(key, [...(groups.get(key) ?? []), session]);
    });
  const result: ChangeoverGap[] = [];
  groups.forEach((list) => {
    const ordered = [...list].sort((a, b) => axisMinutes(a.startTime) - axisMinutes(b.startTime));
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const gap = buildGap(ordered[index], ordered[index + 1], bufferOf(telescopes, ordered[index].telescopeId));
      if (gap) result.push(gap);
    }
  });
  return result.sort((a, b) => a.prevEndAxis - b.prevEndAxis);
}

/** 保存前排程段表单校验输入（新增或编辑中的候选段） */
export interface ChangeoverCandidate {
  nightId: string;
  telescopeId: string;
  instrumentId: string;
  filterSlot: string;
  startTime: string;
  endTime: string;
  /** 编辑时忽略自身 */
  ignoreSessionId?: string;
}

/** 候选排程段 id（用于把表单数据混入现有排程一起比较） */
export const CANDIDATE_SESSION_ID = '__candidate__';

/**
 * 保存前校验：把候选段与同望远镜相邻段比较终端与滤镜，
 * 配置变化且间隔不足时返回冲突（冲突对象与后段最早开始时刻见 ChangeoverGap）。
 */
export function candidateChangeoverViolations(
  candidate: ChangeoverCandidate,
  sessions: ObsSession[],
  telescopes: Telescope[],
): ChangeoverGap[] {
  const pseudo: ObsSession = {
    id: CANDIDATE_SESSION_ID,
    nightId: candidate.nightId,
    targetId: '',
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    telescopeId: candidate.telescopeId,
    instrumentId: candidate.instrumentId,
    filterSlot: candidate.filterSlot,
    plannedFrames: 0,
    status: '待执行',
    schemaVersion: 0,
  };
  const merged = [...sessions.filter((session) => session.id !== candidate.ignoreSessionId), pseudo];
  return changeoverGaps(merged, telescopes, candidate.nightId).filter(
    (gap) => gap.insufficient && (gap.prevSessionId === CANDIDATE_SESSION_ID || gap.nextSessionId === CANDIDATE_SESSION_ID),
  );
}

/** 冲突描述文案：更换内容、所需与实际缓冲、后段最早开始时刻 */
export function describeChangeover(gap: ChangeoverGap, labelOf: (sessionId: string) => string): string {
  const changed = [gap.instrumentChanged ? '终端' : '', gap.filterChanged ? '滤镜' : ''].filter(Boolean).join('与');
  return `${labelOf(gap.prevSessionId)} → ${labelOf(gap.nextSessionId)} 更换${changed}，需缓冲 ${gap.requiredMinutes} 分钟（实际 ${Math.max(
    0,
    gap.gapMinutes,
  )} 分钟），${labelOf(gap.nextSessionId)} 最早 ${gap.earliestStart} 开始`;
}
