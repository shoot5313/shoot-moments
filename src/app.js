import { moments, scenes } from './data/moments.generated.js'
import { buildIndex, search } from './search.js'
import { groupByScene, momentsInScene } from './scenes.js'
import { relatedOf } from './related.js'
import { planRewatch, BUDGETS } from './rewatch.js'
import {
  compareChrono,
  episodeCode,
  episodeLine,
  focusOf,
  hasTimestamp,
  timeLine,
  FOCUSES,
} from './format.js'

const index = buildIndex(moments)
const byId = new Map(moments.map((m) => [m.id, m]))
const chronological = [...moments].sort(compareChrono)

const el = {
  q: document.getElementById('q'),
  hint: document.getElementById('hint'),
  results: document.getElementById('results'),
  timeline: document.getElementById('timeline'),
  budgets: document.getElementById('budgets'),
  plan: document.getElementById('plan'),
  focus: document.getElementById('focus'),
  scenes: document.getElementById('scenes'),
  timelineToggle: document.getElementById('timeline-toggle'),
  detail: document.getElementById('detail'),
}

// 同一个人的不同叫法，颜色要跟着人走，不能跟着字面走。
// 标签上仍然显示原文（闪回里那声「Sameen」不该被改成 Shaw）。
const VOICE_OF = { sameen: 'shaw' }
const voiceSlug = (who) => {
  const slug = who.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return VOICE_OF[slug] ?? slug
}

// 三个可以叠加的维度：
//   线（谁的戏）× 场景（哪种戏）× 搜索词（记得的锚点）
let activeFocus = 'all' // 'all' | 'shoot' | 'root' | 'shaw'
let activeScene = null // scene id，null = 不限
// 时间线默认只放 major-moment：82 条全铺开的话 S3 有 27 个点、
// 一行两百多字，那不是时间线，是一堵字墙。
let timelineAll = false

const inFocus = (moment) => activeFocus === 'all' || focusOf(moment) === activeFocus

function inScene(moment) {
  if (!activeScene) return true
  const scene = scenes.find((s) => s.id === activeScene)
  return scene ? momentsInScene([moment], scene).length > 0 : true
}

const visible = (moment) => inFocus(moment) && inScene(moment)

// ---- 卡片 ----

function card(moment) {
  const button = document.createElement('button')
  button.className = 'card'
  button.type = 'button'
  button.addEventListener('click', () => {
    location.hash = `#/m/${moment.id}`
  })

  const meta = document.createElement('div')
  meta.className = 'card-meta'

  const episode = document.createElement('span')
  episode.textContent = episodeLine(moment)

  const time = document.createElement('span')
  time.className = hasTimestamp(moment) ? 'card-time' : 'card-time pending'
  time.textContent = timeLine(moment)

  meta.append(episode, time)

  const title = document.createElement('p')
  title.className = 'card-title'
  title.textContent = moment.title

  button.append(meta, title)

  if (moment.description) {
    const desc = document.createElement('p')
    desc.className = 'card-desc'
    desc.textContent = moment.description
    button.append(desc)
  }

  if (moment.tags?.length) {
    const tags = document.createElement('p')
    tags.className = 'tags'
    tags.textContent = moment.tags.map((t) => `#${t}`).join(' ')
    button.append(tags)
  }

  return button
}

function renderCards(list) {
  el.results.replaceChildren(...list.map(card))
}

// ---- 搜索 ----

function renderSearch() {
  const query = el.q.value.trim()

  const scene = activeScene ? scenes.find((s) => s.id === activeScene) : null
  const within = scene ? `「${scene.label}」里` : ''

  if (!query) {
    const list = chronological.filter(visible)
    el.hint.textContent = `${within}${list.length} 个 moment，按时间线排。`
    renderCards(list)
    return
  }

  const hits = search(index, query).map((hit) => hit.moment).filter(visible)

  if (!hits.length) {
    const narrowed = activeScene || activeFocus !== 'all'
    el.hint.textContent = narrowed
      ? `当前范围里没有「${query}」。清掉筛选再试试。`
      : `没找到「${query}」。换个说法，或者补一条 alias 进 data/moments.json。`
    el.results.replaceChildren()
    return
  }

  el.hint.textContent = `${within}${hits.length} 个结果。`
  renderCards(hits)
}

el.q.addEventListener('input', renderSearch)

function renderFocus() {
  el.focus.replaceChildren(
    ...FOCUSES.map((focus) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = focus.label
      button.setAttribute('aria-pressed', String(activeFocus === focus.id))
      button.addEventListener('click', () => {
        activeFocus = focus.id
        renderAll()
      })
      return button
    }),
  )
}

function renderScenes() {
  // 计数跟着「线」走：切到 Shaw 个人线时，格子上的数字要是那条线里的数量，
  // 不然点进去发现和数字对不上。
  const pool = moments.filter(inFocus)

  el.scenes.replaceChildren(
    ...groupByScene(pool, scenes).map(({ scene, moments: members }) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'scene'
      button.setAttribute('aria-pressed', String(activeScene === scene.id))

      const label = document.createElement('span')
      label.className = 'scene-label'

      const name = document.createElement('span')
      name.textContent = scene.label

      const count = document.createElement('span')
      count.className = 'scene-count'
      count.textContent = String(members.length)

      label.append(name, count)

      const blurb = document.createElement('span')
      blurb.className = 'scene-blurb'
      blurb.textContent = scene.blurb

      button.append(label, blurb)
      button.addEventListener('click', () => {
        // 再点一次取消，别让人被困在一个场景里出不来
        activeScene = activeScene === scene.id ? null : scene.id
        renderAll()
      })
      return button
    }),
  )
}

el.timelineToggle.addEventListener('click', () => {
  timelineAll = !timelineAll
  renderTimeline()
})

function renderAll() {
  renderFocus()
  renderScenes()
  renderTimeline()
  renderPlan()
  renderSearch()
}

// ---- 时间线 ----

function renderTimeline() {
  const pool = chronological.filter(visible)
  const shown = timelineAll ? pool : pool.filter((m) => m.tags?.includes('major-moment'))
  const seasons = [...new Set(shown.map((m) => m.season))].sort((a, b) => a - b)

  el.timelineToggle.textContent = timelineAll
    ? `只看关键场次（${pool.filter((m) => m.tags?.includes('major-moment')).length}）`
    : `显示全部（${pool.length}）`

  el.timeline.replaceChildren(
    ...seasons.map((season) => {
      const row = document.createElement('div')
      row.className = 'season-row'

      const label = document.createElement('span')
      label.className = 'season-label'
      label.textContent = `S${season}`

      const dots = document.createElement('div')
      dots.className = 'dots'
      for (const moment of shown.filter((m) => m.season === season)) {
        const dot = document.createElement('button')
        dot.type = 'button'
        dot.className = moment.tags?.includes('major-moment') ? 'dot major' : 'dot'
        dot.textContent = moment.title
        dot.title = `${episodeLine(moment)} · ${timeLine(moment)}`
        dot.addEventListener('click', () => {
          location.hash = `#/m/${moment.id}`
        })
        dots.append(dot)
      }

      row.append(label, dots)
      return row
    }),
  )
}

// ---- 重看片单 ----

let activeBudget = null

function renderPlan() {
  if (activeBudget === null) {
    el.plan.replaceChildren()
    return
  }

  const budget = BUDGETS.find((b) => b.id === activeBudget)
  const { picks, totalSeconds, skippedNoTimestamp } = planRewatch(
    moments.filter(visible),
    budget.minutes,
  )

  if (!picks.length) {
    const note = document.createElement('p')
    note.className = 'empty'
    note.textContent = skippedNoTimestamp
      ? `还没有确认过时间的 moment（${skippedNoTimestamp} 个待确认），排不出片单。`
      : '没有能排进这个时长的 moment。'
    el.plan.replaceChildren(note)
    return
  }

  const heading = document.createElement('p')
  heading.className = 'empty'
  heading.textContent =
    `Shoot essentials · ${Math.round(totalSeconds / 60)} min` +
    (skippedNoTimestamp ? `（另有 ${skippedNoTimestamp} 个时间待确认，没算进来）` : '')

  const list = document.createElement('ul')
  list.className = 'plan-list'
  for (const moment of picks) {
    const item = document.createElement('li')

    const code = document.createElement('code')
    code.textContent = episodeCode(moment)

    const time = document.createElement('span')
    time.textContent = timeLine(moment)

    const title = document.createElement('span')
    title.textContent = moment.title

    item.append(code, time, title)
    list.append(item)
  }

  el.plan.replaceChildren(heading, list)
}

function renderBudgets() {
  el.budgets.replaceChildren(
    ...BUDGETS.map((budget) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = budget.label
      button.setAttribute('aria-pressed', String(activeBudget === budget.id))
      button.addEventListener('click', () => {
        activeBudget = activeBudget === budget.id ? null : budget.id
        renderBudgets()
        renderPlan()
      })
      return button
    }),
  )
}

// ---- 详情 ----

function renderDetail(moment) {
  // 「上一个 / 下一个」跟着当前筛选走；深链进来的如果不在范围里，就退回全部。
  const neighbours = visible(moment) ? chronological.filter(visible) : chronological
  const at = neighbours.indexOf(moment)
  const previous = neighbours[at - 1]
  const next = neighbours[at + 1]

  const inner = document.createElement('div')
  inner.className = 'detail-inner'

  const close = document.createElement('button')
  close.className = 'close'
  close.type = 'button'
  close.textContent = '← 返回'
  close.addEventListener('click', () => {
    location.hash = ''
  })

  const meta = document.createElement('p')
  meta.className = 'card-meta'
  meta.textContent = `${episodeLine(moment)}   ${timeLine(moment)}`

  const title = document.createElement('h2')
  title.textContent = moment.title

  inner.append(close, meta, title)

  if (moment.description) {
    const h = document.createElement('h3')
    h.textContent = '发生了什么'
    const p = document.createElement('p')
    p.textContent = moment.description
    inner.append(h, p)
  }

  if (moment.why) {
    const h = document.createElement('h3')
    h.textContent = '为什么重要'
    const p = document.createElement('p')
    p.textContent = moment.why
    inner.append(h, p)
  }

  if (moment.quote?.length) {
    const quote = document.createElement('blockquote')
    quote.className = 'quote'
    // 两列网格：说话人一列、台词一列。列宽由最长的名字撑开，
    // 之前写死 4.5rem，PARAMEDIC 和 THE MACHINE 会压到台词上。
    for (const { who, line } of moment.quote) {
      const label = document.createElement('span')
      label.className = who ? `who who-${voiceSlug(who)}` : 'who'
      label.textContent = who ?? ''

      const said = document.createElement('p')
      said.className = who ? 'said' : 'said anon'
      said.textContent = line

      quote.append(label, said)
    }
    inner.append(quote)
  }

  if (moment.tags?.length) {
    const tags = document.createElement('p')
    tags.className = 'tags'
    tags.textContent = moment.tags.map((t) => `#${t}`).join(' ')
    inner.append(tags)
  }

  const links = relatedOf(moment, moments)
  if (links.length) {
    const h = document.createElement('h3')
    h.textContent = '呼应'
    const list = document.createElement('div')
    list.className = 'related'

    for (const { moment: other, note } of links) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'related-item'

      const head = document.createElement('span')
      head.className = 'related-head'
      head.textContent = `${episodeCode(other)} · ${other.title}`

      const why = document.createElement('span')
      why.className = 'related-note'
      why.textContent = note

      item.append(head, why)
      item.addEventListener('click', () => {
        location.hash = `#/m/${other.id}`
      })
      list.append(item)
    }
    inner.append(h, list)
  }

  const nav = document.createElement('div')
  nav.className = 'detail-nav'

  const back = document.createElement('button')
  back.type = 'button'
  back.textContent = '← 上一个'
  back.disabled = !previous
  back.addEventListener('click', () => {
    location.hash = `#/m/${previous.id}`
  })

  const forward = document.createElement('button')
  forward.type = 'button'
  forward.textContent = '下一个 →'
  forward.disabled = !next
  forward.addEventListener('click', () => {
    location.hash = `#/m/${next.id}`
  })

  nav.append(back, forward)
  inner.append(nav)

  el.detail.replaceChildren(inner)
  el.detail.hidden = false
}

function route() {
  const match = location.hash.match(/^#\/m\/(.+)$/)
  const moment = match ? byId.get(decodeURIComponent(match[1])) : null

  if (moment) {
    renderDetail(moment)
  } else {
    el.detail.hidden = true
    el.detail.replaceChildren()
  }
}

window.addEventListener('hashchange', route)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !el.detail.hidden) location.hash = ''
})

renderBudgets()
renderAll()
route()
