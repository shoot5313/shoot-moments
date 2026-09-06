// 普通全文检索，不用 AI。中文按二元组做模糊，英文按词/前缀。
// 之后要换 embedding 的话，只要保持 search() 的签名不变就行。

import { episodeCode, quoteText } from './format.js'

const CJK = /[㐀-鿿豈-﫿]/

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s，。、！？：；「」『』（）()[\]{}"'’“”·,.!?:;/\\_-]+/g, ' ')
    .trim()
}

/** 中文没有词边界，用二元组近似：「真正重逢」→ 真正/正重/重逢。 */
function bigrams(text) {
  const chars = [...text.replace(/\s+/g, '')]
  if (chars.length < 2) return chars
  const out = []
  for (let i = 0; i < chars.length - 1; i += 1) out.push(chars[i] + chars[i + 1])
  return out
}

function tokenize(text) {
  const normalized = normalize(text)
  if (!normalized) return []
  return normalized.split(' ').filter(Boolean)
}

/** "S4E11" / "s4e11" / "4x11" / "第四季第11集" → { season, episode } */
export function parseEpisodeQuery(query) {
  const text = normalize(query)
  const m =
    text.match(/\bs(\d{1,2})\s*e(\d{1,2})\b/) ||
    text.match(/\b(\d{1,2})\s*x\s*(\d{1,2})\b/)
  if (m) return { season: Number(m[1]), episode: Number(m[2]) }

  const cn = String(query).match(/第\s*([一二三四五1-5])\s*季/)
  if (cn) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 }
    const season = map[cn[1]] ?? Number(cn[1])
    const ep = String(query).match(/第\s*(\d{1,2})\s*集/)
    return { season, episode: ep ? Number(ep[1]) : null }
  }
  return null
}

/** 每个 moment 预处理成一份可检索的索引条目。 */
export function buildIndex(moments) {
  return moments.map((moment) => {
    const aliases = (moment.aliases ?? []).map(normalize).filter(Boolean)
    const title = normalize(moment.title)
    const tags = (moment.tags ?? []).map(normalize)
    const characters = (moment.characters ?? []).map(normalize)
    const description = normalize(moment.description)
    const episodeTitle = normalize(moment.episodeTitle)
    const quote = normalize(quoteText(moment))

    return {
      moment,
      aliases,
      title,
      tags,
      characters,
      description,
      episodeTitle,
      quote,
      code: normalize(episodeCode(moment)),
      // 模糊匹配只针对「人会拿来当检索词」的字段，不含 description，
      // 否则长描述里的偶然字符重合会把无关结果顶上来。
      fuzzy: new Set([...bigrams(title), ...aliases.flatMap(bigrams)]),
    }
  })
}

function scoreToken(entry, token) {
  let score = 0
  const isCjk = CJK.test(token)

  if (entry.aliases.includes(token)) score += 120
  else if (entry.aliases.some((a) => a.includes(token) || token.includes(a))) score += 70

  if (entry.title === token) score += 90
  else if (entry.title.includes(token)) score += 55

  if (entry.tags.includes(token)) score += 45
  else if (entry.tags.some((t) => t.startsWith(token))) score += 25

  if (entry.characters.some((c) => c === token || c.startsWith(token))) score += 30
  if (entry.episodeTitle.includes(token)) score += 30
  if (entry.code.includes(token)) score += 80
  // 「我记得有句台词是……」是很常见的问法，权重排在描述之上
  if (entry.quote.includes(token)) score += 35
  if (entry.description.includes(token)) score += 18

  // 英文允许词前缀：搜 "reun" 也能命中 "reunion"
  if (!isCjk && token.length >= 3) {
    const words = `${entry.title} ${entry.aliases.join(' ')}`.split(' ')
    if (words.some((w) => w.startsWith(token))) score += 20
  }

  // 中文模糊兜底：二元组重合比例
  if (score === 0 && isCjk) {
    const grams = bigrams(token)
    if (grams.length) {
      const hits = grams.filter((g) => entry.fuzzy.has(g)).length
      if (hits) score += Math.round((hits / grams.length) * 40)
    }
  }

  return score
}

/**
 * @param {object[]} index buildIndex() 的产物
 * @param {string} query 用户输进来的话
 * @returns {{moment: object, score: number}[]} 按相关度降序
 */
export function search(index, query) {
  const episodeFilter = parseEpisodeQuery(query)
  const tokens = tokenize(query)

  let candidates = index
  if (episodeFilter) {
    candidates = index.filter(
      (e) =>
        e.moment.season === episodeFilter.season &&
        (episodeFilter.episode === null || e.moment.episode === episodeFilter.episode),
    )
    // 光给集数就把整集的 moment 都列出来
    if (!tokens.length || candidates.length) {
      const onlyEpisode = tokens.every((t) => /^(s\d+e\d+|\d+x\d+|第|季|集|\d+)/.test(t))
      if (onlyEpisode) {
        return candidates.map((e) => ({ moment: e.moment, score: 1 }))
      }
    }
  }

  if (!tokens.length) return []

  return candidates
    .map((entry) => ({
      moment: entry.moment,
      score: tokens.reduce((sum, token) => sum + scoreToken(entry, token), 0),
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
}
