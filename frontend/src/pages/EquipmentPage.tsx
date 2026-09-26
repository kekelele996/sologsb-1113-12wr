import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router-dom';
import ConflictBadge from '../components/common/ConflictBadge';
import { usePersistentStore } from '../hooks/usePersistentStore';
import { useConflictCheck } from '../hooks/useConflictCheck';
import { useSessionStore } from '../stores/sessionStore';
import { useNightStore } from '../stores/nightStore';
import { useTargetStore } from '../stores/targetStore';
import { useEquipmentStore } from '../stores/equipmentStore';
import { NIGHT_TOTAL_MINUTES, TARGET_COLOR } from '../types';
import { axisMinutes, minutesToTime } from '../utils/astro';
import { changeoverGaps } from '../utils/changeover';

const SLOT_MINUTES = 30;

/** 望远镜与终端分配视图：行 = 设备、列 = 30 分钟时段，冲突格标红并可一键跳转；换装缓冲格标橙 */
export default function EquipmentPage() {
  usePersistentStore();
  const navigate = useNavigate();
  const telescopes = useEquipmentStore((s) => s.telescopes);
  const instruments = useEquipmentStore((s) => s.instruments);
  const fieldOfView = useEquipmentStore((s) => s.fieldOfView);
  const updateTelescope = useEquipmentStore((s) => s.updateTelescope);
  const sessions = useSessionStore((s) => s.sessions);
  const nights = useNightStore((s) => s.nights);
  const currentNightId = useNightStore((s) => s.currentNightId);
  const setCurrentNight = useNightStore((s) => s.setCurrentNight);
  const targets = useTargetStore((s) => s.targets);
  const { conflictsOfNight } = useConflictCheck();

  const [nightId, setNightId] = useState(currentNightId);
  const activeNightId = nightId || currentNightId;
  const night = nights.find((item) => item.id === activeNightId);
  const nightSessions = useMemo(() => sessions.filter((session) => session.nightId === activeNightId), [sessions, activeNightId]);
  const conflicts = useMemo(() => conflictsOfNight(activeNightId), [conflictsOfNight, activeNightId]);
  const slots = useMemo(() => Array.from({ length: NIGHT_TOTAL_MINUTES / SLOT_MINUTES }, (_, index) => index), []);

  /** 本夜各望远镜相邻段的换装缓冲（终端或滤镜发生变化的段对） */
  const changeovers = useMemo(() => changeoverGaps(sessions, telescopes, activeNightId), [sessions, telescopes, activeNightId]);
  const insufficientCount = useMemo(() => changeovers.filter((gap) => gap.insufficient).length, [changeovers]);

  /** 换装缓冲登记草稿：telescopeId → 分钟数 */
  const [bufferDraft, setBufferDraft] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState('');

  /** 把登记草稿写回各望远镜（仅保存有修改的行） */
  async function saveBuffers() {
    for (const telescope of telescopes) {
      const draft = bufferDraft[telescope.id];
      if (typeof draft === 'number' && Number.isFinite(draft) && draft !== telescope.changeoverMinutes) {
        await updateTelescope(telescope.id, { changeoverMinutes: Math.max(0, Math.round(draft)) });
      }
    }
    setBufferDraft({});
    setNotice('已登记各望远镜换装缓冲分钟数');
  }

  /** 某望远镜在某时段内重叠到的换装缓冲窗口 */
  const bufferInSlot = (telescopeId: string, slot: number) => {
    const slotStart = slot * SLOT_MINUTES;
    const slotEnd = slotStart + SLOT_MINUTES;
    return changeovers.filter(
      (gap) => gap.telescopeId === telescopeId && Math.min(gap.earliestStartAxis, slotEnd) - Math.max(gap.prevEndAxis, slotStart) > 0,
    );
  };

  const targetById = (id: string) => targets.find((target) => target.id === id);
  const pairedInstrument = (telescopeCode: string) => instruments.find((instrument) => instrument.telescopeCode === telescopeCode);

  /** 某望远镜在某时段内的排程段 */
  const occupancy = (telescopeId: string, slot: number) => {
    const slotStart = slot * SLOT_MINUTES;
    const slotEnd = slotStart + SLOT_MINUTES;
    return nightSessions
      .filter((session) => session.telescopeId === telescopeId)
      .filter((session) => {
        const start = axisMinutes(session.startTime);
        const rawEnd = axisMinutes(session.endTime);
        const end = rawEnd <= start ? rawEnd + 1440 : rawEnd;
        return Math.min(end, slotEnd) - Math.max(start, slotStart) > 0;
      })
      .sort((a, b) => axisMinutes(a.startTime) - axisMinutes(b.startTime));
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        望远镜与终端分配视图
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        以行 = 设备、列 = 30 分钟时段的占用网格呈现；同一望远镜在同一时段排入多段即标红，点击格子可一键跳转到对应排程段；相邻段更换终端或滤镜时，所需的换装缓冲以橙色格画出。
      </Typography>

      {notice ? (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
          换装缓冲登记（分钟）
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          主夜连续观测时，同一台望远镜相邻两段若更换终端或滤镜，需留出这段准备时间重新调焦；登记后排程保存、总览与导出都会按此校验与标注。
        </Typography>
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }} alignItems="center">
          {telescopes.map((telescope) => (
            <TextField
              key={telescope.id}
              size="small"
              type="number"
              label={`${telescope.code} 换装缓冲`}
              value={bufferDraft[telescope.id] ?? telescope.changeoverMinutes}
              onChange={(event) => setBufferDraft((prev) => ({ ...prev, [telescope.id]: Number(event.target.value) }))}
              inputProps={{ min: 0, max: 240, step: 5 }}
              sx={{ width: 160 }}
            />
          ))}
          <Button variant="contained" disabled={Object.keys(bufferDraft).length === 0} onClick={() => void saveBuffers()}>
            保存缓冲设置
          </Button>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }} alignItems="center">
        <TextField
          select
          size="small"
          label="观测夜"
          value={activeNightId}
          onChange={(event) => {
            setNightId(event.target.value);
            setCurrentNight(event.target.value);
          }}
          sx={{ minWidth: 240 }}
        >
          {nights.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {`${item.date} · ${item.siteName}${item.primary ? '（主夜）' : item.backup ? '（备用夜）' : ''}`}
            </MenuItem>
          ))}
        </TextField>
        <Chip size="small" label={night ? `月相 ${night.moonPhasePct}% · 云量 ${night.cloudText}` : '未选择观测夜'} />
        <Chip
          size="small"
          color={insufficientCount ? 'warning' : 'default'}
          variant={insufficientCount ? 'filled' : 'outlined'}
          label={`换装缓冲 ${changeovers.length} 段${insufficientCount ? `（不足 ${insufficientCount}）` : ''}`}
        />
        <ConflictBadge conflicts={conflicts} />
      </Stack>

      {conflicts.length > 0 ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          本夜存在 {conflicts.length} 处设备时段冲突，冲突格已在下方网格中标红：{' '}
          {conflicts.map((conflict) => `${conflict.sessionId}↔${conflict.otherId}（${conflict.overlapText}）`).join('；')}
        </Alert>
      ) : (
        <Alert severity="success" sx={{ mb: 2 }}>
          本夜各望远镜时段无重叠，无设备冲突
        </Alert>
      )}

      {insufficientCount > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          本夜存在 {insufficientCount} 处换装缓冲不足（网格中以橙色格画出准备时间）：{' '}
          {changeovers
            .filter((gap) => gap.insufficient)
            .map(
              (gap) =>
                `${gap.prevSessionId}→${gap.nextSessionId}（需 ${gap.requiredMinutes} 分钟，实际 ${Math.max(0, gap.gapMinutes)} 分钟，${gap.nextSessionId} 最早 ${gap.earliestStart} 开始）`,
            )
            .join('；')}
        </Alert>
      ) : null}

      <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
        <Table size="small" sx={{ minWidth: 1180 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 210 }}>望远镜 / 终端 / 视场角</TableCell>
              {slots.map((slot) => (
                <TableCell key={slot} align="center" sx={{ px: 0.25 }}>
                  {minutesToTime(slot * SLOT_MINUTES)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {telescopes.map((telescope) => {
              const instrument = pairedInstrument(telescope.code);
              const fov = instrument ? fieldOfView(telescope.id, instrument.id) : undefined;
              return (
                <TableRow key={telescope.id}>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {telescope.code}
                        </Typography>
                        <Chip
                          size="small"
                          label={telescope.status}
                          color={telescope.status === '可用' ? 'success' : telescope.status === '维护中' ? 'warning' : 'default'}
                          variant="outlined"
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {telescope.apertureMm}mm · f/{telescope.focalLengthMm}mm · {telescope.mount} · 载荷 {telescope.maxPayloadKg}kg · 换装缓冲 {telescope.changeoverMinutes} 分钟
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {instrument ? `${instrument.model}（${instrument.terminalType}）` : '未配终端'}
                        {fov ? ` · 视场 ${fov.text}` : ''}
                      </Typography>
                    </Stack>
                  </TableCell>
                  {slots.map((slot) => {
                    const items = occupancy(telescope.id, slot);
                    const isConflict = items.length > 1;
                    const target = items[0] ? targetById(items[0].targetId) : undefined;
                    const buffers = items.length === 0 ? bufferInSlot(telescope.id, slot) : [];
                    const buffer = buffers[0];
                    /** 该格内排程段是否起步于不足的换装缓冲窗口内（前段换装尚未完成） */
                    const rushed =
                      items.length === 1 &&
                      changeovers.some((gap) => gap.telescopeId === telescope.id && gap.nextSessionId === items[0].id && gap.insufficient);
                    return (
                      <TableCell
                        key={slot}
                        align="center"
                        sx={{
                          px: 0.25,
                          py: 0.5,
                          bgcolor: isConflict ? 'error.main' : items.length === 1 ? TARGET_COLOR[target?.type ?? '星云'] : buffer ? 'warning.main' : 'transparent',
                          color: items.length || buffer ? '#fff' : 'text.secondary',
                          cursor: items.length ? 'pointer' : 'default',
                          borderLeft: '1px solid',
                          borderColor: 'divider',
                          ...(rushed ? { outline: '2px solid', outlineColor: 'warning.dark', outlineOffset: -2 } : null),
                          ...(buffer
                            ? { background: 'repeating-linear-gradient(45deg, rgba(237,108,2,0.85) 0 6px, rgba(237,108,2,0.45) 6px 12px)' }
                            : null),
                        }}
                        onClick={() => {
                          if (items.length === 0) return;
                          navigate(`/sessions?highlight=${items[0].id}&night=${activeNightId}`);
                        }}
                      >
                        {items.length === 0 ? (
                          buffer ? (
                            <Tooltip
                              title={`换装缓冲 ${minutesToTime(Math.max(buffer.prevEndAxis, slot * SLOT_MINUTES))} 起：${buffer.prevSessionId}→${buffer.nextSessionId} 需 ${buffer.requiredMinutes} 分钟（实际 ${Math.max(0, buffer.gapMinutes)} 分钟），下一段最早 ${buffer.earliestStart} 开始`}
                            >
                              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                换装
                              </Typography>
                            </Tooltip>
                          ) : (
                            <Typography variant="caption">·</Typography>
                          )
                        ) : isConflict ? (
                          <Tooltip title={items.map((item) => `${item.startTime}-${item.endTime} ${targetById(item.targetId)?.name ?? ''}`).join(' ｜ ')}>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                              冲突 {items.length}
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Tooltip title={`${items[0].startTime}-${items[0].endTime} ${target?.name ?? ''} · ${items[0].status}`}>
                            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                              {target?.name ?? '已排'}
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        终端清单与适配望远镜
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>型号</TableCell>
              <TableCell>类型</TableCell>
              <TableCell align="right">像元(μm)</TableCell>
              <TableCell>靶面(mm)</TableCell>
              <TableCell align="right">读出噪声(e-)</TableCell>
              <TableCell>适配望远镜</TableCell>
              <TableCell>视场角</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {instruments.map((instrument) => {
              const telescope = telescopes.find((item) => item.code === instrument.telescopeCode);
              const fov = telescope ? fieldOfView(telescope.id, instrument.id) : undefined;
              return (
                <TableRow key={instrument.id} hover>
                  <TableCell>{instrument.model}</TableCell>
                  <TableCell>{instrument.terminalType}</TableCell>
                  <TableCell align="right">{instrument.pixelSizeUm}</TableCell>
                  <TableCell>
                    {instrument.sensorWidthMm} × {instrument.sensorHeightMm}
                  </TableCell>
                  <TableCell align="right">{instrument.readNoiseE}</TableCell>
                  <TableCell>{telescope ? `${telescope.code}（${telescope.status}）` : '未适配'}</TableCell>
                  <TableCell>{fov?.text ?? '-'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 2 }}>
        <Button variant="outlined" onClick={() => navigate('/sessions')}>
          前往排程段列表处理冲突
        </Button>
      </Box>
    </Box>
  );
}
