import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ChangeoverGap } from '../../utils/changeover';
import { minutesToTime } from '../../utils/astro';

export interface ChangeoverLayerProps {
  /** 需要换装缓冲的相邻段对（changeoverGaps 计算结果） */
  gaps: ChangeoverGap[];
  /** 时间轴总分钟数（与外层 Timeline 一致） */
  totalMinutes: number;
  /** 与外层 Timeline 的 height 对齐 */
  height?: number;
}

/** 时间轴上的换装缓冲叠加层：以前段结束为起点画出重新调焦/换装所需的准备时间 */
export default function ChangeoverLayer({ gaps, totalMinutes, height = 96 }: ChangeoverLayerProps) {
  return (
    <>
      {gaps.map((gap) => {
        const start = Math.max(0, Math.min(totalMinutes, gap.prevEndAxis));
        const end = Math.max(start, Math.min(totalMinutes, gap.earliestStartAxis));
        if (end - start <= 0) return null;
        const changed = [gap.instrumentChanged ? '终端' : '', gap.filterChanged ? '滤镜' : ''].filter(Boolean).join('与');
        const color = gap.insufficient ? 'rgba(211,47,47,0.5)' : 'rgba(237,108,2,0.4)';
        return (
          <Tooltip
            key={`${gap.prevSessionId}-${gap.nextSessionId}`}
            title={`换装缓冲 ${minutesToTime(start)}-${minutesToTime(end)}：更换${changed}需 ${gap.requiredMinutes} 分钟（实际 ${Math.max(0, gap.gapMinutes)} 分钟），下一段 ${gap.nextSessionId} 最早 ${gap.earliestStart} 开始`}
          >
            <Box
              sx={{
                position: 'absolute',
                left: `${(start / totalMinutes) * 100}%`,
                width: `${((end - start) / totalMinutes) * 100}%`,
                minWidth: 14,
                top: 18,
                height: height - 34,
                borderRadius: 1,
                border: '1px dashed',
                borderColor: gap.insufficient ? 'error.main' : 'warning.main',
                background: `repeating-linear-gradient(45deg, ${color} 0 6px, rgba(0,0,0,0.08) 6px 12px)`,
                overflow: 'hidden',
                zIndex: 1,
              }}
            >
              <Typography variant="caption" sx={{ display: 'block', px: 0.5, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', textShadow: '0 0 3px rgba(0,0,0,.6)' }}>
                换装
              </Typography>
            </Box>
          </Tooltip>
        );
      })}
    </>
  );
}
