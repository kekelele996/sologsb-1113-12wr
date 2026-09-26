import type { Instrument, ObsNight, ObsSession, ObsTarget, Telescope } from '../types';
import { changeoverGaps, type ChangeoverGap } from './changeover';

export interface PlanContext {
  night?: ObsNight;
  sessions: ObsSession[];
  targets: ObsTarget[];
  telescopes: Telescope[];
  instruments: Instrument[];
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** 以排程段 id 索引其作为前段的换装缓冲（用于在清单中写明下一段最早开始时刻） */
function changeoverByPrev(context: PlanContext): Map<string, ChangeoverGap> {
  const map = new Map<string, ChangeoverGap>();
  changeoverGaps(context.sessions, context.telescopes, context.night?.id).forEach((gap) => {
    map.set(gap.prevSessionId, gap);
  });
  return map;
}

/** 生成当晚观测清单文本（目标、时刻、滤镜、帧数） */
export function buildNightPlanText(context: PlanContext): string {
  const { night, sessions, targets, telescopes, instruments } = context;
  const changeovers = changeoverByPrev(context);
  const lines: string[] = [];
  lines.push('天文观测夜编排表');
  lines.push(`观测夜：${night?.date ?? '-'}　站点：${night?.siteName ?? '-'}　值班人：${night?.dutyOfficer ?? '-'}`);
  lines.push(
    `月相：${night ? `${night.moonPhasePct}%（${night.moonrise} 月出 / ${night.moonset} 月落）` : '-'}　日落日出：${
      night ? `${night.sunset} / ${night.sunrise}` : '-'
    }　云量预报：${night?.cloudText ?? '-'}`,
  );
  lines.push('-'.repeat(96));
  lines.push('序 时段           目标            望远镜   终端            滤镜  帧数  状态      备注');
  const ordered = [...sessions].sort((a, b) => a.startTime.localeCompare(b.startTime));
  ordered.forEach((session, index) => {
    const target = targets.find((item) => item.id === session.targetId);
    const telescope = telescopes.find((item) => item.id === session.telescopeId);
    const instrument = instruments.find((item) => item.id === session.instrumentId);
    const changeover = changeovers.get(session.id);
    const changeoverNote = changeover
      ? `换装缓冲 ${changeover.requiredMinutes} 分钟，下一段 ${changeover.nextSessionId} 最早 ${changeover.earliestStart} 开始${
          changeover.insufficient ? '（间隔不足）' : ''
        }`
      : '';
    const remark = [session.rescheduleReason ?? '', changeoverNote].filter(Boolean).join('；');
    lines.push(
      [
        pad(index + 1),
        `${session.startTime}-${session.endTime}`.padEnd(14, ' '),
        `${target?.name ?? '未知目标'}（${target?.catalog ?? '-'}）`.padEnd(24, ' '),
        (telescope?.code ?? '-').padEnd(8, ' '),
        (instrument?.model ?? '-').padEnd(16, ' '),
        session.filterSlot.padEnd(6, ' '),
        pad(session.plannedFrames, 4),
        session.status.padEnd(8, ' '),
        remark,
      ].join(' '),
    );
  });
  lines.push('-'.repeat(96));
  const totalFrames = ordered.reduce((sum, session) => sum + session.plannedFrames, 0);
  const totalExposure = ordered.reduce((sum, session) => {
    const target = targets.find((item) => item.id === session.targetId);
    return sum + (target ? (session.plannedFrames * target.exposureSec) / 60 : 0);
  }, 0);
  lines.push(`合计排程段 ${ordered.length} 段，计划帧数 ${totalFrames} 帧，预计曝光 ${totalExposure.toFixed(1)} 分钟`);
  const insufficient = [...changeovers.values()].filter((gap) => gap.insufficient);
  if (insufficient.length > 0) {
    lines.push(
      `注意：${insufficient.length} 处换装缓冲不足——${insufficient
        .map((gap) => `${gap.prevSessionId}→${gap.nextSessionId} 需 ${gap.requiredMinutes} 分钟，下一段最早 ${gap.earliestStart} 开始`)
        .join('；')}`,
    );
  }
  lines.push(`导出时间：${new Date().toLocaleString('zh-CN')}`);
  return lines.join('\n');
}

/** 生成 CSV */
export function buildPlanCsv(context: PlanContext): string {
  const { sessions, targets, telescopes, instruments } = context;
  const changeovers = changeoverByPrev(context);
  const header = ['观测夜', '时段', '目标名', '星表编号', '类型', '视星等', '望远镜', '终端', '滤镜', '帧数', '单帧曝光(s)', '状态', '换装缓冲(分钟)', '下一段最早开始', '改期原因'];
  const rows = [...sessions]
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((session) => {
      const target = targets.find((item) => item.id === session.targetId);
      const telescope = telescopes.find((item) => item.id === session.telescopeId);
      const instrument = instruments.find((item) => item.id === session.instrumentId);
      const changeover = changeovers.get(session.id);
      return [
        session.nightId,
        `${session.startTime}-${session.endTime}`,
        target?.name ?? '',
        target?.catalog ?? '',
        target?.type ?? '',
        target ? String(target.magnitude) : '',
        telescope?.code ?? '',
        instrument?.model ?? '',
        session.filterSlot,
        String(session.plannedFrames),
        target ? String(target.exposureSec) : '',
        session.status,
        changeover ? String(changeover.requiredMinutes) : '',
        changeover ? changeover.earliestStart : '',
        session.rescheduleReason ?? '',
      ];
    });
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return `﻿${csv}`;
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 打印当前视图（打印视图） */
export function printPage(): void {
  window.print();
}
