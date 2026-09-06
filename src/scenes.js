// 场景是给「想不起来锚点」的人用的入口：不用先想出关键词，
// 从「是那种……的戏」直接进去。
//
// 成员关系由 tag 推导，不手写 id 列表——新录一条打上 tag 就自动归位，
// 不用在两个地方维护同一件事。

/** 这个 moment 命中了哪些场景。 */
export function scenesOf(moment, scenes) {
  const tags = moment.tags ?? []
  return scenes.filter((scene) => scene.tags.some((tag) => tags.includes(tag)))
}

/** 这个场景里有哪些 moment。一个 moment 可以同时属于多个场景。 */
export function momentsInScene(moments, scene) {
  return moments.filter((moment) => (moment.tags ?? []).some((tag) => scene.tags.includes(tag)))
}

/**
 * 场景 + 各自的成员，空场景会被去掉——列一个点不进去的格子只会让人白点一次。
 * @returns {{scene: object, moments: object[]}[]}
 */
export function groupByScene(moments, scenes) {
  return scenes
    .map((scene) => ({ scene, moments: momentsInScene(moments, scene) }))
    .filter((group) => group.moments.length > 0)
}

/**
 * 一个场景都没进的 moment。这些只能靠搜索找到，等于从浏览入口漏掉了，
 * 所以 validate 会把它当错误拦下来。
 */
export function unscened(moments, scenes) {
  return moments.filter((moment) => scenesOf(moment, scenes).length === 0)
}

/** 所有被场景用到的 tag，录入时提示用。 */
export function sceneTags(scenes) {
  return [...new Set(scenes.flatMap((scene) => scene.tags))].sort()
}
