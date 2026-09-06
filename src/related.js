// moment 之间的呼应。
//
// 关系只在一边声明，反向自动算出来——不然每加一条就要改两处，
// 迟早会出现 A 指向 B 但 B 没指回 A 的情况。
//
// 但说明文字要分两个方向。「两年后她拿这场戏当尺度衡量别人」从 A 看成立，
// 从 B 那边看就是反的。所以链接声明一次，措辞可以有两副面孔：
// note 是正向的，back 是反向的；没写 back 就退回 note（对称的关系不用写）。

/**
 * 一条 moment 的全部呼应，正反两向合并。
 *
 * @param {object} moment
 * @param {object[]} moments 全集
 * @returns {{moment: object, note: string}[]} 按时间线排序
 */
export function relatedOf(moment, moments) {
  const byId = new Map(moments.map((m) => [m.id, m]))
  const out = new Map()

  for (const link of moment.related ?? []) {
    const target = byId.get(link.id)
    if (target) out.set(target.id, { moment: target, note: link.note })
  }

  // 反向：别人指过来的，换成反向措辞
  for (const other of moments) {
    for (const link of other.related ?? []) {
      if (link.id === moment.id && !out.has(other.id)) {
        out.set(other.id, { moment: other, note: link.back ?? link.note })
      }
    }
  }

  return [...out.values()].sort((a, b) => {
    if (a.moment.season !== b.moment.season) return a.moment.season - b.moment.season
    return a.moment.episode - b.moment.episode
  })
}

/** 指向不存在 id 的链接。validate 用来拦。 */
export function brokenLinks(moments) {
  const ids = new Set(moments.map((m) => m.id))
  const broken = []
  for (const moment of moments) {
    for (const link of moment.related ?? []) {
      if (!ids.has(link.id)) broken.push({ from: moment.id, to: link.id })
      if (link.id === moment.id) broken.push({ from: moment.id, to: '（指向自己）' })
      if (!link.note?.trim()) broken.push({ from: moment.id, to: `${link.id}（缺 note）` })
    }
  }
  return broken
}
