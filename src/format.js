// 时间戳与剧集编号的解析/格式化。所有内部计算一律用「秒」。

/**
 * 把 "33:10" / "1:03:10" / "33:10.5" 解析成秒。
 * 解析不了（含 null / 空串）返回 null —— 表示这个时间点还没确认。
 */
export function parseTime(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const text = String(value).trim()
  if (!text) return null
  if (!/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(text)) return null

  const parts = text.split(':').map(Number)
  if (parts.some((n) => !Number.isFinite(n))) return null
  if (parts.length === 3 && (parts[1] > 59 || parts[2] > 59)) return null
  if (parts.length === 2 && parts[1] > 59) return null

  return parts.reduce((total, n) => total * 60 + n, 0)
}

/** 秒 → "33:10"，超过一小时给 "1:03:10"。 */
export function formatTime(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null

  const total = Math.max(0, Math.round(seconds))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n) => String(n).padStart(2, '0')

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** "S4E11" */
export function episodeCode(moment) {
  return `S${moment.season}E${String(moment.episode).padStart(2, '0')}`
}

/**
 * 一个 moment 的时长（秒）。没有 start/end 就返回 null，
 * 这样「按时间预算重看」不会把没确认的东西算进去。
 */
export function durationOf(moment) {
  const start = parseTime(moment.start)
  const end = parseTime(moment.end)
  if (start === null || end === null || end <= start) return null
  return end - start
}

/**
 * quote 是 [{who, line}] 的对话数组。这里拍平成一段文本，
 * 给检索和测试用——它们不关心谁说的，只关心说了什么。
 */
export function quoteText(moment) {
  const quote = moment.quote
  if (!quote) return ''
  if (typeof quote === 'string') return quote
  return quote.map((q) => (q.who ? `${q.who}: ${q.line}` : q.line)).join(' ')
}

/** 时间戳确认了没有。没确认的在界面上写「时间待确认」，不编数字。 */
export function hasTimestamp(moment) {
  return parseTime(moment.start) !== null
}

/** 卡片上那行 "S4E11 · If-Then-Else"。 */
export function episodeLine(moment) {
  const code = episodeCode(moment)
  return moment.episodeTitle ? `${code} · ${moment.episodeTitle}` : code
}

/** 卡片上那行 "37:14 – 39:02"，没确认就是 "时间待确认"。 */
export function timeLine(moment) {
  const start = parseTime(moment.start)
  if (start === null) return '时间待确认'
  const end = parseTime(moment.end)
  return end !== null && end > start
    ? `${formatTime(start)} – ${formatTime(end)}`
    : formatTime(start)
}

/**
 * 一个 moment 属于哪条线：两个人的交互，还是某个人自己的线。
 * 由 characters 推出来，不用单独维护字段。
 * 出现别的角色（Finch、Reese、Samaritan…）不影响判断。
 *
 * @returns {'shoot'|'root'|'shaw'|'other'}
 */
export function focusOf(moment) {
  const cast = (moment.characters ?? []).map((c) => String(c).toLowerCase())
  const root = cast.includes('root')
  const shaw = cast.includes('shaw')

  if (root && shaw) return 'shoot'
  if (root) return 'root'
  if (shaw) return 'shaw'
  return 'other'
}

export const FOCUSES = [
  { id: 'all', label: '全部' },
  { id: 'shoot', label: 'Root × Shaw' },
  { id: 'root', label: 'Root 个人线' },
  { id: 'shaw', label: 'Shaw 个人线' },
]

/** 排序键：先按集，再按集内时间。时间未知的排到该集末尾。 */
export function chronoKey(moment) {
  const start = parseTime(moment.start)
  return [moment.season, moment.episode, start === null ? Number.MAX_SAFE_INTEGER : start]
}

export function compareChrono(a, b) {
  const ka = chronoKey(a)
  const kb = chronoKey(b)
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i]
  }
  return 0
}
