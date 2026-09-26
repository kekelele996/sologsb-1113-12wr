import type { Instrument, ObsNight, ObsSession, ObsTarget, Telescope } from '../types';
import { axisMinutes } from './astro';
import { changeoversForNight } from './changeover';

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

/** 生成当晚观测清单文本（目标、时刻、滤镜、帧数） */
export function buildNightPlanText(context: PlanContext): string {
  const { night, sessions, targets, telescopes, instruments } = context;
  const lines: string[] = [];
  lines.push('天文观测夜编排表');
  lines.push(`观测夜：${night?.date ?? '-'}　站点：${night?.siteName ?? '-'}　值班人：${night?.dutyOfficer ?? '-'}`);
  lines.push(
    `月相：${night ? `${night.moonPhasePct}%（${night.moonrise} 月出 / ${night.moonset} 月落）` : '-'}　日落日出：${
      night ? `${night.sunset} / ${night.sunrise}` : '-'
    }　云量预报：${night?.cloudText ?? '-'}`,
  );
  lines.push('-'.repeat(112));
  lines.push('序 时段           目标            望远镜   终端            滤镜  帧数  状态      下段最早开始      备注');
  const ordered = [...sessions].sort((a, b) => axisMinutes(a.startTime) - axisMinutes(b.startTime));
  const changeovers = changeoversForNight(night?.id ?? '', ordered, telescopes);
  const changeoverByNext = new Map(changeovers.map((item) => [item.nextSession.id, item]));
  ordered.forEach((session, index) => {
    const target = targets.find((item) => item.id === session.targetId);
    const telescope = telescopes.find((item) => item.id === session.telescopeId);
    const instrument = instruments.find((item) => item.id === session.instrumentId);
    const changeover = changeoverByNext.get(session.id);
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
        (changeover ? changeover.earliestStartTime : '无需换装').padEnd(16, ' '),
        session.rescheduleReason ?? '',
      ].join(' '),
    );
  });
  lines.push('-'.repeat(112));
  if (changeovers.length > 0) {
    lines.push('换装准备：');
    changeovers.forEach((item) => {
      const telescope = telescopes.find((entry) => entry.id === item.telescopeId)?.code ?? item.telescopeId;
      lines.push(
        `  ${item.previousSession.id} → ${item.nextSession.id}（${telescope}）：缓冲 ${item.bufferMinutes} 分钟，实际间隔 ${item.gapMinutes} 分钟，下一段最早 ${item.earliestStartTime}${
          item.satisfied ? '' : '（不足，需顺延）'
        }`,
      );
    });
  } else {
    lines.push('换装准备：相邻排程终端与滤镜相同，无需额外准备时间');
  }
  const totalFrames = ordered.reduce((sum, session) => sum + session.plannedFrames, 0);
  const totalExposure = ordered.reduce((sum, session) => {
    const target = targets.find((item) => item.id === session.targetId);
    return sum + (target ? (session.plannedFrames * target.exposureSec) / 60 : 0);
  }, 0);
  lines.push(`合计排程段 ${ordered.length} 段，计划帧数 ${totalFrames} 帧，预计曝光 ${totalExposure.toFixed(1)} 分钟`);
  lines.push(`导出时间：${new Date().toLocaleString('zh-CN')}`);
  return lines.join('\n');
}

/** 生成 CSV */
export function buildPlanCsv(context: PlanContext): string {
  const { night, sessions, targets, telescopes, instruments } = context;
  const ordered = [...sessions].sort((a, b) => axisMinutes(a.startTime) - axisMinutes(b.startTime));
  const changeoverByNext = new Map(changeoversForNight(night?.id ?? '', ordered, telescopes).map((item) => [item.nextSession.id, item]));
  const header = ['观测夜', '时段', '目标名', '星表编号', '类型', '视星等', '望远镜', '换装缓冲(分钟)', '终端', '滤镜', '帧数', '单帧曝光(s)', '状态', '下段最早开始', '换装间隔(分钟)', '改期原因'];
  const rows = ordered.map((session) => {
      const target = targets.find((item) => item.id === session.targetId);
      const telescope = telescopes.find((item) => item.id === session.telescopeId);
      const instrument = instruments.find((item) => item.id === session.instrumentId);
      const changeover = changeoverByNext.get(session.id);
      return [
        session.nightId,
        `${session.startTime}-${session.endTime}`,
        target?.name ?? '',
        target?.catalog ?? '',
        target?.type ?? '',
        target ? String(target.magnitude) : '',
        telescope?.code ?? '',
        telescope ? String(telescope.changeoverBufferMinutes) : '',
        instrument?.model ?? '',
        session.filterSlot,
        String(session.plannedFrames),
        target ? String(target.exposureSec) : '',
        session.status,
        changeover ? changeover.earliestStartTime : '无需换装',
        changeover ? String(changeover.gapMinutes) : '',
        session.rescheduleReason ?? '',
      ];
    });
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return `\ufeff${csv}`;
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
