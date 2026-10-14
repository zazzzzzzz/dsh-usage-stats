/**
 * 跨会话的 Token 用量汇总。
 *
 * 宿主没有发布"按天分桶的全局用量"这样的服务：`tokenUsage` 投影只覆盖单个会话，
 * 会话列表也只带每个会话自己的合计。所以这里从最可靠的一手来源自己算：
 * 读会话日志里每条落定的助手消息所带的使用量样本。
 *
 * 折叠方式与宿主自己的 `tokenUsage` 投影保持一致：
 *
 *   - 一条持久化的助手结算贡献它流里最后一个使用量样本；
 *   - 同一 turn/step 上的重试替换那个样本，而不是叠加；
 *   - 四个桶 input / output / cacheRead / cacheWrite 互不重叠（推理 token 记在 output 里）。
 *
 * 在这之上补两个维度：日期（本地日历日）与小时，让界面能画热力图、趋势线，
 * 并按时间范围重新求和。
 *
 * 日志是多帧 zstd（每批追加一帧），`node:zlib` 只解第一帧，所以解码交给宿主的
 * `sessionQuery` 服务，这里只做汇总。自己算的结果按"会话日志的大小 + 修改时间"
 * 缓存在 `$DSH_HOME/cache/dsh-usage-stats/usage.json`，热启动只需一次目录遍历
 * 加每个会话一次 stat，只重读变过的日志。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { harnessPath } from './home-path.js'

/** 本地缓存文档的版本；字段形状一变就要 +1，否则旧缓存会被当成新格式读。 */
const CACHE_VERSION = 2
/**
 * 两次活动相隔超过这么久，就当作换了「一场」。
 *
 * 会话是可以隔几天再回来接着聊的，所以首末时间相减得到的是「这个会话存在了多久」，
 * 不是「聊了多久」。一小时以内的停顿（读回复、想下一句、等一个慢命令、离开一会儿再回来）
 * 仍算同一场。
 */
const IDLE_GAP_MS = 60 * 60 * 1000
/**
 * 算「一次连续活动」时采信的事件类型。
 *
 * 只取真正代表干活的那些：一轮的起止、步骤、消息、工具调用、压缩与工作流。
 * 会话自己的簿记不取——`session/*`、`request/*`、`goal/change`、`schedule/change`、
 * `todo/write`、`team/*`、`subagent/*`、`model/selection` 这些，后台机制可以定期写入，
 * 一旦把它们当成「人在用」，一个会话的时长就能跨满好几天。
 *
 * 类型取自引擎的 `KNOWN_SESSION_EVENT_TYPES`。
 */
const ACTIVITY_EVENT_TYPES = new Set([
  'turn/start',
  'turn/end',
  'step/start',
  'step/end',
  'user/message',
  'developer/message',
  'system/message',
  'assistant/attempt',
  'assistant/message',
  'tool/call',
  'tool/result',
  'tool/ptc-dispatch',
  'tool/ptc-dispatch-start',
  'tool-workflow/run-start',
  'tool-workflow/run-end',
  'tool-workflow/agent-start',
  'tool-workflow/agent-end',
  'command/run',
  'command/done',
  'compaction/start',
  'compaction/end',
  'compaction/summary',
  'compaction/prune',
])
/** 会话日志名：v0 是 `session.jsonl`，vN 是 `session.vN.jsonl`，压缩后追加 `.zstd`。 */
const SESSION_LOG = /^session(?:\.v([1-9][0-9]*))?\.jsonl(?:\.zstd)?$/i
/** 四个互不重叠的桶；推理 token 记在 output 里。 */
const BUCKET_KEYS = ['input', 'output', 'cacheRead', 'cacheWrite']
/**
 * 汇总结果的保鲜期：超过它，下一次请求会在后台重算。
 *
 * 界面每 20 秒问一次，所以这个值决定数字最多有多旧。重算只重读变过的会话日志，
 * 所以这个频率的代价是一次目录遍历加当前那个会话的一次读取。
 */
const TTL_MS = 30_000

/** 一个本地日历日，与日志里事件时间所在的时区一致。 */
function dayKey(time) {
  const date = new Date(time)
  if (!Number.isFinite(date.getTime())) return null
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function emptyBuckets() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }
}

function count(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function addBuckets(target, buckets, sign) {
  for (const key of BUCKET_KEYS) {
    const value = count(buckets?.[key])
    if (value !== 0) target[key] += sign * value
  }
  target.calls += sign * count(buckets?.calls)
}

/** 四个桶加起来的合计。 */
function bucketTotal(buckets) {
  let total = 0
  for (const key of BUCKET_KEYS) total += count(buckets?.[key])
  return total
}

function bucketsEqual(left, right) {
  return BUCKET_KEYS.every((key) => left[key] === right[key])
}

/** 一条落定结算所报告的使用量。 */
function usageOf(event) {
  const data = event?.data
  if (data === null || data === undefined || typeof data !== 'object') return undefined
  if (event.type === 'assistant/message' && data.usage !== undefined) return data.usage
  const stream = data.stream
  if (!Array.isArray(stream)) return undefined
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index]
    if (record !== null && typeof record === 'object' && record.type === 'chunk'
      && record.chunk !== null && typeof record.chunk === 'object' && record.chunk.type === 'usage') {
      return record.chunk.usage
    }
  }
  return undefined
}

/** 一条结算所属的模型路由；事件没有指明时返回 null。 */
function modelOf(event) {
  const source = event?.data?.message?.source
  const model = source?.model
  if (typeof model !== 'string' || model === '') return null
  const provider = typeof source?.provider === 'string' ? source.provider : ''
  return { model, provider }
}

function hoursFrom(raw) {
  return Array.isArray(raw) && raw.length === 24
    ? raw.map((value) => count(value))
    : new Array(24).fill(0)
}

/**
 * 一段时间里最长的一次连续活动。
 *
 * 时间已按序排好，从前往后走：与上一次活动相隔不超过 `IDLE_GAP_MS` 就并进当前这一段，
 * 超过就另起一段。单条事件构不成一段，返回 0。
 *
 * @param times - 该会话所有「真正干活」的事件时间戳。
 * @returns 最长那一段的毫秒数。
 */
function longestRunOf(times) {
  if (times.length < 2) return 0
  const sorted = [...times].sort((left, right) => left - right)
  let longest = 0
  let runStart = sorted[0]
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] - sorted[index - 1] > IDLE_GAP_MS) {
      runStart = sorted[index]
      continue
    }
    const run = sorted[index] - runStart
    if (run > longest) longest = run
  }
  return longest
}

/**
 * 把一个会话的事件折叠成按天的桶、一天一行的小时直方图，以及最长的一次连续活动。
 *
 * 替换槽位保存"上一条结算"，`llm/retry-started` 清空它：同 turn/step 上的重试
 * 会先把旧的样本从它落的那天减掉，再把新样本加上去。
 *
 * @param events - 该会话的持久化事件，按 seq 升序。
 */
function foldSession(events) {
  const days = new Map()
  const hours = new Array(24).fill(0)
  const times = []

  const bump = (day, hour, buckets, sign, route) => {
    hours[hour] += sign
    let target = days.get(day)
    if (target === undefined) {
      if (sign < 0) return
      target = emptyBuckets()
      target.hours = new Array(24).fill(0)
      target.models = new Map()
      days.set(day, target)
    }
    target.hours[hour] += sign
    addBuckets(target, buckets, sign)
    if (route !== null) {
      let cell = target.models.get(route.model)
      if (cell === undefined && sign > 0) {
        cell = emptyBuckets()
        target.models.set(route.model, cell)
      }
      if (cell !== undefined) {
        addBuckets(cell, buckets, sign)
        if (sign < 0 && BUCKET_KEYS.every((key) => cell[key] === 0) && cell.calls === 0) target.models.delete(route.model)
      }
    }
    if (sign < 0 && BUCKET_KEYS.every((key) => target[key] === 0) && target.calls === 0) days.delete(day)
  }

  let slot = null
  for (const event of events) {
    const time = count(event?.time)
    // 只有真正干活的事件参与「一次连续活动」的判定，簿记事件不参与。
    if (time > 0 && ACTIVITY_EVENT_TYPES.has(event?.type)) times.push(time)
    const type = event?.type
    if (type === 'llm/retry-started') {
      const data = event.data
      if (slot !== null && slot.turn === data?.turn && slot.step === data?.step) slot = null
      continue
    }
    if (type !== 'assistant/message' && type !== 'assistant/attempt') continue
    const usage = usageOf(event)
    if (usage === undefined) continue
    const day = dayKey(event.time)
    if (day === null) continue
    const hour = new Date(count(event.time)).getHours()
    const buckets = { ...emptyBuckets(), ...pickBuckets(usage) }
    const route = modelOf(event)
    const turn = event.data?.turn
    const step = event.data?.step
    const replacing = slot !== null && slot.turn === turn && slot.step === step
    if (replacing && bucketsEqual(slot.buckets, buckets)) continue
    if (replacing) bump(slot.day, slot.hour, slot.buckets, -1, slot.route)
    bump(day, hour, buckets, 1, route)
    slot = { turn, step, buckets, day, hour, route }
  }
  return { days, hours, longestRun: longestRunOf(times) }
}

/** 一条使用量样本的四个桶，外加一次调用。 */
function pickBuckets(usage) {
  return {
    input: count(usage?.inputTokens),
    output: count(usage?.outputTokens),
    cacheRead: count(usage?.cacheReadTokens),
    cacheWrite: count(usage?.cacheWriteTokens),
    calls: 1,
  }
}

/** 桶表转成可写入缓存的普通对象。 */
function daysToObject(days) {
  const out = {}
  for (const [day, buckets] of days) {
    const entry = { ...buckets }
    if (buckets.models instanceof Map && buckets.models.size > 0) {
      entry.models = {}
      for (const [model, cell] of buckets.models) entry.models[model] = cell
    } else {
      entry.models = null
    }
    out[day] = entry
  }
  return out
}

function daysFromObject(raw) {
  const days = new Map()
  if (raw === null || typeof raw !== 'object') return days
  for (const [day, buckets] of Object.entries(raw)) {
    if (buckets === null || typeof buckets !== 'object') continue
    const clean = emptyBuckets()
    addBuckets(clean, buckets, 1)
    clean.hours = hoursFrom(buckets.hours)
    clean.models = new Map()
    if (buckets.models !== null && typeof buckets.models === 'object') {
      for (const [model, cell] of Object.entries(buckets.models)) {
        if (cell === null || typeof cell !== 'object') continue
        const into = emptyBuckets()
        addBuckets(into, cell, 1)
        clean.models.set(model, into)
      }
    }
    days.set(day, clean)
  }
  return days
}

/** 一个会话目录里最新一代的日志，连同它的指纹。 */
function newestLog(dir) {
  let best = null
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const match = SESSION_LOG.exec(entry.name)
    if (match === null) continue
    const version = Number(match[1] ?? 0)
    const compressed = /\.zstd$/i.test(entry.name)
    if (best === null || version > best.version
      || (version === best.version && Number(compressed) > Number(best.compressed))) {
      best = { name: entry.name, version, compressed }
    }
  }
  if (best === null) return null
  const path = join(dir, best.name)
  const stat = statSync(path)
  return { path, size: stat.size, mtimeMs: stat.mtimeMs }
}

/** 每个已存会话的 id、最新日志与它的指纹；从未存过会话的 harness home 还没有这个目录。 */
function listSessionLogs(root) {
  const out = []
  if (!existsSync(root)) return out
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue
    const projectDir = join(root, project.name)
    for (const session of readdirSync(projectDir, { withFileTypes: true })) {
      if (!session.isDirectory()) continue
      let log
      try {
        log = newestLog(join(projectDir, session.name))
      } catch {
        continue
      }
      if (log === null) continue
      out.push({ id: session.name, ...log })
    }
  }
  return out
}

/** 把逐会话的按天结果并成全局结果，并统计每天出现过的会话集合。 */
function mergeSessions(sessions) {
  const days = new Map()
  const hours = new Array(24).fill(0)
  const seen = new Set()
  let longest = { ms: 0, sessionId: null }
  for (const [id, entry] of sessions) {
    seen.add(id)
    if (Number.isFinite(entry.longestRun) && entry.longestRun > longest.ms) {
      longest = { ms: entry.longestRun, sessionId: id }
    }
    if (Array.isArray(entry.hours)) {
      for (let hour = 0; hour < 24; hour += 1) hours[hour] += count(entry.hours[hour])
    }
    for (const [day, buckets] of entry.days) {
      let target = days.get(day)
      if (target === undefined) {
        target = emptyBuckets()
        target.sessions = new Set()
        target.hours = new Array(24).fill(0)
        target.models = new Map()
        days.set(day, target)
      }
      addBuckets(target, buckets, 1)
      target.sessions.add(id)
      for (let hour = 0; hour < 24; hour += 1) target.hours[hour] += count(buckets.hours?.[hour])
      if (!(buckets.models instanceof Map)) continue
      for (const [model, cell] of buckets.models) {
        let into = target.models.get(model)
        if (into === undefined) {
          into = emptyBuckets()
          target.models.set(model, into)
        }
        addBuckets(into, cell, 1)
      }
    }
  }
  return { days, hours, sessionCount: seen.size, longest }
}

/**
 * 连续使用天数。
 *
 * 「当前」从今天往回数：今天没有活动时，昨天有活动也还算连续（今天还没开始用而已）；
 * 今天和昨天都没有活动则为 0。
 */
function streaks(dayKeys) {
  const sorted = [...dayKeys].sort()
  let longest = 0
  let run = 0
  let previous = null
  for (const day of sorted) {
    const ms = new Date(`${day}T00:00:00`).getTime()
    run = previous !== null && ms - previous === 86_400_000 ? run + 1 : 1
    if (run > longest) longest = run
    previous = ms
  }
  let current = 0
  if (sorted.length > 0) {
    const today = dayKey(Date.now())
    const last = sorted[sorted.length - 1]
    const lastMs = new Date(`${last}T00:00:00`).getTime()
    const todayMs = new Date(`${today}T00:00:00`).getTime()
    const gap = Math.round((todayMs - lastMs) / 86_400_000)
    if (gap === 0 || gap === 1) current = run
  }
  return { current, longest }
}

/** 把合并结果整理成交给界面的文档。 */
function summarize(merged, source) {
  const entries = [...merged.days.entries()].sort((left, right) => (left[0] < right[0] ? -1 : 1))
  const days = entries.map(([date, buckets]) => ({
    date,
    input: buckets.input,
    output: buckets.output,
    cacheRead: buckets.cacheRead,
    cacheWrite: buckets.cacheWrite,
    calls: buckets.calls,
    sessions: buckets.sessions.size,
    tokens: bucketTotal(buckets),
    hours: buckets.hours,
    models: Object.fromEntries([...buckets.models].map(([id, cell]) => [id, bucketTotal(cell)])),
  }))

  const totals = emptyBuckets()
  const byModel = new Map()
  let peak = null
  for (const [date, buckets] of entries) {
    addBuckets(totals, buckets, 1)
    const total = bucketTotal(buckets)
    if (peak === null || total > peak.tokens) peak = { date, tokens: total }
    for (const [model, cell] of buckets.models) {
      let into = byModel.get(model)
      if (into === undefined) {
        into = { ...emptyBuckets(), days: 0, lastDay: null }
        byModel.set(model, into)
      }
      addBuckets(into, cell, 1)
      into.days += 1
      if (into.lastDay === null || date > into.lastDay) into.lastDay = date
    }
  }
  const models = [...byModel.entries()]
    .map(([id, cell]) => ({ id, ...cell, tokens: bucketTotal(cell) }))
    .sort((left, right) => right.tokens - left.tokens)

  return {
    source,
    computedAt: Date.now(),
    totals: { ...totals, tokens: bucketTotal(totals), sessions: merged.sessionCount, activeDays: days.length },
    peak,
    streak: streaks(days.map((day) => day.date)),
    duration: { longestMs: merged.longest.ms, sessionId: merged.longest.sessionId },
    firstDay: days.length === 0 ? null : days[0].date,
    lastDay: days.length === 0 ? null : days[days.length - 1].date,
    hours: merged.hours,
    days,
    models,
  }
}

/**
 * 建立用量服务。
 *
 * @param ctx - 宿主插件上下文，用来解析 harness home 并读取 `sessionQuery`。
 * @returns 服务：`snapshot()` 读当前状态，`refresh()` 在后台重算。
 */
export function createUsage(ctx) {
  const home = () => harnessPath(ctx)

  let state = null
  let pending = null
  let disposed = false

  const cacheFile = () => join(home(), 'cache', 'dsh-usage-stats', 'usage.json')

  function readCache() {
    if (!existsSync(cacheFile())) return new Map()
    let parsed
    try {
      parsed = JSON.parse(readFileSync(cacheFile(), 'utf8'))
    } catch (error) {
      // 缓存只是省算力：读不动就整份重算并覆盖，报一声即可。
      ctx.logger?.warn?.(`dsh-usage-stats: 用量缓存无法读取，改为整体重算: ${error.message}`)
      return new Map()
    }
    if (parsed === null || typeof parsed !== 'object' || parsed.version !== CACHE_VERSION) return new Map()
    const sessions = new Map()
    const raw = parsed.sessions
    if (raw === null || typeof raw !== 'object') return sessions
    for (const [id, entry] of Object.entries(raw)) {
      if (entry === null || typeof entry !== 'object') continue
      if (!Number.isFinite(entry.size) || !Number.isFinite(entry.mtimeMs)) continue
      sessions.set(id, {
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        days: daysFromObject(entry.days),
        hours: hoursFrom(entry.hours),
        longestRun: Number.isFinite(entry.longestRun) ? entry.longestRun : 0,
      })
    }
    return sessions
  }

  function writeCache(sessions) {
    const document = { version: CACHE_VERSION, computedAt: Date.now(), sessions: {} }
    for (const [id, entry] of sessions) {
      document.sessions[id] = {
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        days: daysToObject(entry.days),
        hours: entry.hours,
        longestRun: entry.longestRun,
      }
    }
    const path = cacheFile()
    const temp = `${path}.${process.pid}.tmp`
    try {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(temp, JSON.stringify(document), 'utf8')
      renameSync(temp, path)
    } catch (error) {
      // 缓存写不进去不影响这一次的结果，报一声后继续。
      ctx.logger?.warn?.(`dsh-usage-stats: 用量缓存未写入: ${error.message}`)
    }
  }

  /** 用宿主自己的读取器读一个会话的事件。 */
  async function readEvents(sessionId) {
    const query = ctx.get('sessionQuery')
    if (query === null || query === undefined || typeof query.readSession !== 'function') return null
    let snapshot
    try {
      snapshot = await query.readSession(sessionId)
    } catch (error) {
      // 这两种错误表示日志读不动，或列目录与读取之间它消失了：
      // 这个会话这一轮跳过，下一轮再试。
      if (error?.code !== 'SESSION_QUERY_CORRUPT_SESSION' && error?.code !== 'SESSION_QUERY_SESSION_NOT_FOUND') throw error
      ctx.logger?.warn?.(`dsh-usage-stats: 会话 ${sessionId} 未计入用量统计: ${error.message}`)
      return null
    }
    const events = snapshot?.events
    return Array.isArray(events) ? events : null
  }

  /** 只重算日志变过的会话。 */
  async function compute() {
    const root = resolve(join(home(), 'sessions'))
    const logs = listSessionLogs(root)
    const cache = readCache()
    const sessions = new Map()
    let failed = 0
    for (const log of logs) {
      const cached = cache.get(log.id)
      if (cached !== undefined && cached.size === log.size && cached.mtimeMs === log.mtimeMs) {
        sessions.set(log.id, cached)
        continue
      }
      const events = await readEvents(log.id)
      if (events === null) {
        failed += 1
        if (cached !== undefined) sessions.set(log.id, cached)
        continue
      }
      const folded = foldSession(events)
      sessions.set(log.id, {
        size: log.size,
        mtimeMs: log.mtimeMs,
        days: folded.days,
        hours: folded.hours,
        longestRun: folded.longestRun,
      })
    }
    writeCache(sessions)
    const merged = mergeSessions(sessions)
    const summary = summarize(merged, 'local')
    if (sessions.size === 0 && failed > 0) {
      return { ...summary, unavailable: true, reason: 'session-query-unavailable' }
    }
    return { ...summary, sessions: logs.length, failed }
  }

  function refresh() {
    if (disposed) return Promise.resolve(null)
    if (pending !== null) return pending
    state = state === null ? { value: null, computing: true } : { ...state, computing: true }
    pending = compute().then(
      (value) => {
        pending = null
        if (disposed) return value
        state = { value, computing: false }
        return value
      },
      (error) => {
        pending = null
        if (!disposed) state = { value: state?.value ?? null, computing: false, error: String(error?.message ?? error) }
        return null
      },
    )
    return pending
  }

  return {
    /** 当前状态：一个值、一个「还在算」的标记，以及最近一次错误。 */
    snapshot() {
      const stale = state === null || state.value === null
        || state.value.computedAt === undefined
        || Date.now() - state.value.computedAt > TTL_MS
      return {
        value: state === null ? null : state.value,
        computing: state === null ? false : state.computing === true,
        error: state?.error,
        stale,
      }
    },
    refresh,
    dispose() {
      disposed = true
    },
  }
}

/**
 * 纯函数部分单独导出，供离线测试直接调用。
 * 运行时只经过 `createUsage`，这些名字不构成插件的对外接口。
 */
export {
  foldSession,
  mergeSessions,
  summarize,
  streaks,
  listSessionLogs,
  daysToObject,
  daysFromObject,
  pickBuckets,
  usageOf,
}
