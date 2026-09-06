// 「我想重看 Shoot，我只有 30 分钟」→ 排一份片单。

import { compareChrono, durationOf } from './format.js'

export const BUDGETS = [
  { id: '10', label: '10 分钟', minutes: 10 },
  { id: '30', label: '30 分钟', minutes: 30 },
  { id: '60', label: '1 小时', minutes: 60 },
  { id: 'full', label: '完整线', minutes: Infinity },
]

/**
 * 挑出总时长不超过预算的片单。
 *
 * 只用「时间已确认」的 moment —— 没有 start/end 就没法算时长，
 * 硬塞进去只会让片单的总时长是假的。
 *
 * 挑选顺序按 priority（1 最高），同级按时间线先后；
 * 返回时统一按时间线排序，这样是顺着看下来的。
 *
 * @param {object[]} moments
 * @param {number} minutes 预算，Infinity 表示不限
 * @returns {{picks: object[], totalSeconds: number, skippedNoTimestamp: number}}
 */
export function planRewatch(moments, minutes) {
  const usable = moments.filter((m) => durationOf(m) !== null)
  const skippedNoTimestamp = moments.length - usable.length
  const budgetSeconds = minutes === Infinity ? Infinity : minutes * 60

  const ranked = [...usable].sort((a, b) => {
    const pa = a.priority ?? 3
    const pb = b.priority ?? 3
    if (pa !== pb) return pa - pb
    return compareChrono(a, b)
  })

  const picks = []
  let totalSeconds = 0
  for (const moment of ranked) {
    const duration = durationOf(moment)
    if (totalSeconds + duration > budgetSeconds) continue
    picks.push(moment)
    totalSeconds += duration
  }

  picks.sort(compareChrono)
  return { picks, totalSeconds, skippedNoTimestamp }
}
