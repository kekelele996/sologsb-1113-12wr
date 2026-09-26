/** 排程段状态 */
export type SessionStatus = '待执行' | '进行中' | '已完成' | '因云取消';

/** 观测排程段 */
export interface ObsSession {
  id: string;
  /** 观测夜 ID */
  nightId: string;
  /** 观测目标 ID */
  targetId: string;
  /** 开始时刻 HH:mm */
  startTime: string;
  /** 结束时刻 HH:mm（可跨零点） */
  endTime: string;
  /** 望远镜 ID */
  telescopeId: string;
  /** 终端 ID */
  instrumentId: string;
  /** 滤镜轮位 */
  filterSlot: string;
  /** 计划帧数 */
  plannedFrames: number;
  /** 状态 */
  status: SessionStatus;
  /** 改期原因 */
  rescheduleReason?: string;
  /** 替补夜 ID（迁移时补齐） */
  backupNightId?: string;
  /** 数据结构版本 */
  schemaVersion: number;
}

/** 冲突类型 */
export type ConflictKind = 'overlap' | 'changeover';

/** 冲突项 */
export interface ConflictItem {
  /** 冲突类型 */
  kind: ConflictKind;
  /** 当前排程段 */
  sessionId: string;
  /** 与之冲突的排程段 */
  otherId: string;
  nightId: string;
  telescopeId: string;
  /** 重叠分钟数 */
  overlapMinutes: number;
  /** 重叠区间文案 / 换装校验文案 */
  overlapText: string;
  /** 下一段最早可开始时刻（换装冲突） */
  earliestStartTime?: string;
  /** 需要的换装缓冲分钟数（换装冲突） */
  bufferMinutes?: number;
  /** 实际间隔分钟数（换装冲突） */
  gapMinutes?: number;
  /** 当前段是否为换装前一段 */
  subjectIsPrevious?: boolean;
}

export const SESSION_STATUSES: SessionStatus[] = ['待执行', '进行中', '已完成', '因云取消'];

/** 4 种状态配色（MUI Chip color） */
export const STATUS_CHIP_COLOR: Record<SessionStatus, 'default' | 'primary' | 'success' | 'error'> = {
  待执行: 'default',
  进行中: 'primary',
  已完成: 'success',
  因云取消: 'error',
};
