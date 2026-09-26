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
import { changeoversForNight } from '../utils/changeover';

const SLOT_MINUTES = 30;

/** 望远镜与终端分配视图：行 = 设备、列 = 30 分钟时段，冲突格标红并可一键跳转 */
export default function EquipmentPage() {
  usePersistentStore();
  const navigate = useNavigate();
  const telescopes = useEquipmentStore((s) => s.telescopes);
  const instruments = useEquipmentStore((s) => s.instruments);
  const updateTelescope = useEquipmentStore((s) => s.updateTelescope);
  const fieldOfView = useEquipmentStore((s) => s.fieldOfView);
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
  const changeovers = useMemo(() => changeoversForNight(activeNightId, nightSessions, telescopes), [activeNightId, nightSessions, telescopes]);
  const unmetChangeovers = changeovers.filter((item) => !item.satisfied);
  const slots = useMemo(() => Array.from({ length: NIGHT_TOTAL_MINUTES / SLOT_MINUTES }, (_, index) => index), []);
  const [bufferDrafts, setBufferDrafts] = useState<Record<string, string>>({});

  const targetById = (id: string) => targets.find((target) => target.id === id);
  const pairedInstrument = (telescopeCode: string) => instruments.find((instrument) => instrument.telescopeCode === telescopeCode);

  async function commitBuffer(telescopeId: string) {
    const draft = bufferDrafts[telescopeId];
    if (draft === undefined) return;
    const value = Number(draft);
    if (Number.isFinite(value) && value >= 0) {
      await updateTelescope(telescopeId, { changeoverBufferMinutes: value });
    }
    setBufferDrafts((current) => {
      const next = { ...current };
      delete next[telescopeId];
      return next;
    });
  }

  /** 某望远镜在某 30 分钟格内需要占用的换装准备段 */
  const prepOccupancy = (telescopeId: string, slot: number) => {
    const slotStart = slot * SLOT_MINUTES;
    const slotEnd = slotStart + SLOT_MINUTES;
    return changeovers
      .filter((item) => item.telescopeId === telescopeId)
      .filter((item) => Math.min(item.prepEndMinute, slotEnd) - Math.max(item.prepStartMinute, slotStart) > 0);
  };

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
        以行 = 设备、列 = 30 分钟时段的占用网格呈现；可登记每台望远镜的换装缓冲分钟数，斜纹格为换终端/滤镜准备时间，间隔不足会以警告样式标出。
      </Typography>

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
        <Chip size="small" variant="outlined" label="斜纹格 = 换装准备时间" sx={{ bgcolor: 'warning.light' }} />
        <ConflictBadge conflicts={conflicts} />
      </Stack>

      {conflicts.filter((conflict) => conflict.kind === 'overlap').length > 0 ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          本夜存在 {conflicts.filter((conflict) => conflict.kind === 'overlap').length} 处设备时段冲突，冲突格已在下方网格中标红：{' '}
          {conflicts
            .filter((conflict) => conflict.kind === 'overlap')
            .map((conflict) => `${conflict.sessionId}↔${conflict.otherId}（${conflict.overlapText}）`)
            .join('；')}
        </Alert>
      ) : null}

      {unmetChangeovers.length > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          本夜有 {unmetChangeovers.length} 段换装准备时间不足，橙色边框格表示需要顺延：
          {unmetChangeovers
            .map((item) => ` ${item.previousSession.id}→${item.nextSession.id}（下一段最早 ${item.earliestStartTime}）`)
            .join('；')}
        </Alert>
      ) : conflicts.filter((conflict) => conflict.kind === 'overlap').length === 0 ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          本夜各望远镜时段无重叠，换装配置相同或相邻间隔已满足缓冲
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
                        {telescope.apertureMm}mm · f/{telescope.focalLengthMm}mm · {telescope.mount} · 载荷 {telescope.maxPayloadKg}kg
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {instrument ? `${instrument.model}（${instrument.terminalType}）` : '未配终端'}
                        {fov ? ` · 视场 ${fov.text}` : ''}
                      </Typography>
                      <TextField
                        size="small"
                        type="number"
                        inputProps={{ min: 0, step: 5 }}
                        label="换装缓冲(分钟)"
                        value={bufferDrafts[telescope.id] ?? telescope.changeoverBufferMinutes}
                        onChange={(event) => setBufferDrafts((current) => ({ ...current, [telescope.id]: event.target.value }))}
                        onBlur={() => void commitBuffer(telescope.id)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                        sx={{ maxWidth: 150, mt: 0.5 }}
                      />
                    </Stack>
                  </TableCell>
                  {slots.map((slot) => {
                    const items = occupancy(telescope.id, slot);
                    const prepItems = prepOccupancy(telescope.id, slot);
                    const isConflict = items.length > 1;
                    const hasUnmetPrep = prepItems.some((item) => !item.satisfied);
                    const hasPrep = prepItems.length > 0;
                    const target = items[0] ? targetById(items[0].targetId) : undefined;
                    return (
                      <TableCell
                        key={slot}
                        align="center"
                        sx={{
                          px: 0.25,
                          py: 0.5,
                          bgcolor: isConflict
                            ? 'error.main'
                            : items.length === 1
                              ? TARGET_COLOR[target?.type ?? '星云']
                              : hasPrep
                                ? 'warning.light'
                                : 'transparent',
                          backgroundImage: hasPrep
                            ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.38) 0 4px, transparent 4px 9px)'
                            : undefined,
                          color: items.length ? '#fff' : 'text.secondary',
                          cursor: items.length ? 'pointer' : 'default',
                          borderLeft: '1px solid',
                          borderColor: 'divider',
                          outline: hasPrep ? `2px ${hasUnmetPrep ? 'solid #ed6c02' : 'dashed #ed6c02'} inset` : undefined,
                          outlineOffset: -2,
                          boxShadow: undefined,
                        }}
                        onClick={() => {
                          if (items.length === 0) return;
                          navigate(`/sessions?highlight=${items[0].id}&night=${activeNightId}`);
                        }}
                      >
                        {items.length === 0 ? (
                          <Tooltip title={prepItems.map((item) => `换装 ${item.bufferMinutes} 分钟 → ${item.nextSession.id}，最早 ${item.earliestStartTime}`).join('；')}>
                            <Typography variant="caption" sx={{ fontWeight: hasUnmetPrep ? 700 : 500 }}>
                              {hasPrep ? (hasUnmetPrep ? '换装!' : '备') : '·'}
                            </Typography>
                          </Tooltip>
                        ) : isConflict ? (
                          <Tooltip title={items.map((item) => `${item.startTime}-${item.endTime} ${targetById(item.targetId)?.name ?? ''}`).join(' ｜ ')}>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                              冲突 {items.length}
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Tooltip
                            title={`${items[0].startTime}-${items[0].endTime} ${target?.name ?? ''} · ${items[0].status}${
                              prepItems.length ? `；换装准备：${prepItems.map((item) => `最早 ${item.earliestStartTime}`).join('，')}` : ''
                            }`}
                          >
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
