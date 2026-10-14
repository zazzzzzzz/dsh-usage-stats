/**
 * 宿主半边折叠逻辑的离线测试。
 *
 * 这些用例覆盖的是「一条结算算多少 token、算到哪一天、算给哪个模型」这类
 * 不能靠肉眼在界面上核对的东西，事件形状照引擎自己的 `assistant/message` /
 * `assistant/attempt` / `llm/retry-started` 契约构造。
 *
 * 运行：node --test test/
 */
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  daysFromObject,
  daysToObject,
  foldSession,
  listSessionLogs,
  mergeSessions,
  pickBuckets,
  streaks,
  summarize,
  usageOf,
} from '../host/usage.js'

const here = dirname(fileURLToPath(import.meta.url))
/** 测试用的临时目录，构建产物与源码都不放这里。 */
const scratch = join(here, '..', '.debug', 'test-tmp')

/** 本地时间构造一个时刻：测试依赖本地日历日与小时，所以不能用 UTC 字面量。 */
function at(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
}

/** 一条带使用量的落定助手消息。 */
function assistantMessage(time, turn, step, usage, model = 'deepseek/deepseek-v4-flash') {
  return {
    type: 'assistant/message',
    time,
    data: {
      turn,
      step,
      usage,
      stream: [],
      message: { role: 'assistant', source: { kind: 'model', provider: 'cc', model } },
    },
  }
}

/** 一条只带流内使用量样本的尝试。 */
function assistantAttempt(time, turn, step, usage) {
  return {
    type: 'assistant/attempt',
    time,
    data: { turn, step, stream: [{ type: 'chunk', time, chunk: { type: 'usage', usage } }] },
  }
}

function retryStarted(time, turn, step) {
  return { type: 'llm/retry-started', time, data: { turn, step } }
}

/** 把一批事件折成一个会话，再并成全局结果。 */
function rollup(eventsBySession) {
  const sessions = new Map()
  let index = 0
  for (const events of eventsBySession) {
    const folded = foldSession(events)
    sessions.set(`session-${index}`, {
      size: 1,
      mtimeMs: 1,
      days: folded.days,
      hours: folded.hours,
      longestRun: folded.longestRun,
    })
    index += 1
  }
  return summarize(mergeSessions(sessions), 'local')
}

test('usageOf 优先取 assistant/message 上的 usage，其次取流里最后一个 usage 块', () => {
  const direct = usageOf(assistantMessage(1, 1, 1, { inputTokens: 7 }))
  assert.equal(direct.inputTokens, 7)

  const fromStream = usageOf({
    type: 'assistant/attempt',
    time: 1,
    data: {
      turn: 1,
      step: 1,
      stream: [
        { type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 1 } } },
        { type: 'chunk', chunk: { type: 'text-delta', text: 'x' } },
        { type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 9 } } },
      ],
    },
  })
  assert.equal(fromStream.inputTokens, 9, '取的是最后一个 usage 块')

  assert.equal(usageOf({ type: 'assistant/message', time: 1, data: { turn: 1, step: 1, stream: [] } }), undefined)
  assert.equal(usageOf({ type: 'user/message', time: 1, data: {} }), undefined)
})

test('四个桶相加，未报告的桶按 0 计', () => {
  const buckets = pickBuckets({ inputTokens: 10, outputTokens: 4, cacheReadTokens: 300 })
  assert.deepEqual(buckets, { input: 10, output: 4, cacheRead: 300, cacheWrite: 0, calls: 1 })
})

test('同一天多条结算累加，并记到该结算所在的小时上', () => {
  const day = at(2026, 9, 14, 10, 30)
  const later = at(2026, 9, 14, 15, 5)
  const folded = foldSession([
    assistantMessage(day, 1, 1, { inputTokens: 100, outputTokens: 10, cacheReadTokens: 5, cacheWriteTokens: 2 }),
    assistantMessage(later, 2, 1, { inputTokens: 50, outputTokens: 20 }),
  ])
  const entry = folded.days.get('2026-09-14')
  assert.equal(entry.input, 150)
  assert.equal(entry.output, 30)
  assert.equal(entry.cacheRead, 5)
  assert.equal(entry.cacheWrite, 2)
  assert.equal(entry.calls, 2)
  assert.equal(folded.hours[10], 1)
  assert.equal(folded.hours[15], 1)
  assert.equal(folded.hours[11], 0)
})

test('重试后的再次结算算作新的一次尝试，两次都计入', () => {
  // 引擎的 turn 折叠把重试后的尝试一并累加（失败的尝试同样消耗了 token），
  // 所以这里断言两次都在，而不是被后一次覆盖。
  const folded = foldSession([
    assistantMessage(at(2026, 9, 14, 10), 1, 1, { inputTokens: 100, outputTokens: 10 }),
    retryStarted(at(2026, 9, 14, 10, 1), 1, 1),
    assistantMessage(at(2026, 9, 14, 10, 2), 1, 1, { inputTokens: 120, outputTokens: 12 }),
  ])
  const entry = folded.days.get('2026-09-14')
  assert.equal(entry.input, 220)
  assert.equal(entry.output, 22)
  assert.equal(entry.calls, 2)
})

test('同一 turn/step 上后到的样本替换先前的，而不是叠加', () => {
  const folded = foldSession([
    assistantMessage(at(2026, 9, 14, 10), 1, 1, { inputTokens: 100, outputTokens: 10 }),
    assistantMessage(at(2026, 9, 14, 10, 1), 1, 1, { inputTokens: 120, outputTokens: 8 }),
  ])
  const entry = folded.days.get('2026-09-14')
  assert.equal(entry.input, 120)
  assert.equal(entry.output, 8)
  assert.equal(entry.calls, 1)
})

test('同一 turn/step 上完全相同的样本只计一次', () => {
  const usage = { inputTokens: 100, outputTokens: 10 }
  const folded = foldSession([
    assistantMessage(at(2026, 9, 14, 10), 1, 1, usage),
    assistantMessage(at(2026, 9, 14, 10, 1), 1, 1, usage),
  ])
  const entry = folded.days.get('2026-09-14')
  assert.equal(entry.input, 100)
  assert.equal(entry.calls, 1)
})

test('assistant/attempt 从流里取样本并计入', () => {
  const folded = foldSession([
    assistantAttempt(at(2026, 9, 14, 9), 1, 1, { inputTokens: 5, outputTokens: 1 }),
  ])
  const entry = folded.days.get('2026-09-14')
  assert.equal(entry.input, 5)
  assert.equal(entry.output, 1)
})

test('跨本地日历日分成两行，模型分别归到各自那天', () => {
  const folded = foldSession([
    assistantMessage(at(2026, 9, 14, 23, 30), 1, 1, { inputTokens: 10 }, 'deepseek/deepseek-v4-flash'),
    assistantMessage(at(2026, 9, 15, 0, 30), 2, 1, { inputTokens: 20 }, 'z-ai/glm-5.3-flash'),
  ])
  assert.deepEqual([...folded.days.keys()].sort(), ['2026-09-14', '2026-09-15'])
  assert.deepEqual([...folded.days.get('2026-09-14').models.keys()], ['deepseek/deepseek-v4-flash'])
  assert.deepEqual([...folded.days.get('2026-09-15').models.keys()], ['z-ai/glm-5.3-flash'])
})

test('连续活动时长：一小时以内的停顿仍算同一场', () => {
  const folded = foldSession([
    assistantMessage(at(2026, 9, 14, 9, 0), 1, 1, { inputTokens: 1 }),
    // 每次隔五十分钟，都在阈值之内，于是连成一场。
    assistantMessage(at(2026, 9, 14, 9, 50), 2, 1, { inputTokens: 1 }),
    assistantMessage(at(2026, 9, 14, 10, 40), 3, 1, { inputTokens: 1 }),
  ])
  assert.equal(folded.longestRun, 100 * 60 * 1000)
})

test('连续活动时长：边界落在 1 小时，差一分钟就分成两场', () => {
  const justInside = foldSession([
    assistantMessage(at(2026, 9, 14, 9, 0), 1, 1, { inputTokens: 1 }),
    assistantMessage(at(2026, 9, 14, 10, 0), 2, 1, { inputTokens: 1 }),
  ])
  assert.equal(justInside.longestRun, 60 * 60 * 1000, '正好一小时仍算同一场')

  const justOutside = foldSession([
    assistantMessage(at(2026, 9, 14, 9, 0), 1, 1, { inputTokens: 1 }),
    assistantMessage(at(2026, 9, 14, 10, 1), 2, 1, { inputTokens: 1 }),
  ])
  assert.equal(justOutside.longestRun, 0, '超过一小时就断开')
})

test('连续活动时长：超过阈值的停顿把会话切成两段，取最长的一段', () => {
  const events = []
  // 第一场：9:00 起每十分钟一条，共三条 —— 二十分钟。
  for (let index = 0; index < 3; index += 1) {
    events.push(assistantMessage(at(2026, 9, 14, 9, index * 10), index + 1, 1, { inputTokens: 1 }))
  }
  // 停三个小时再回来。
  // 第二场：12:20 起每十分钟一条，共七条 —— 一小时。
  for (let index = 0; index < 7; index += 1) {
    events.push(assistantMessage(at(2026, 9, 14, 12, 20 + index * 10), index + 10, 1, { inputTokens: 1 }))
  }
  const folded = foldSession(events)
  assert.equal(folded.longestRun, 60 * 60 * 1000, '取的是第二场那一小时')
})

test('连续活动时长：隔天回来接着聊的会话不算一次连续活动', () => {
  const folded = foldSession([
    assistantMessage(at(2026, 10, 7, 20, 0), 1, 1, { inputTokens: 1 }),
    assistantMessage(at(2026, 10, 15, 10, 0), 2, 1, { inputTokens: 1 }),
  ])
  assert.equal(folded.longestRun, 0, '相隔一周不能报成「聊了 172 小时」')
})

test('连续活动时长：只有一条事件时为 0', () => {
  const folded = foldSession([assistantMessage(at(2026, 9, 14, 9, 0), 1, 1, { inputTokens: 1 })])
  assert.equal(folded.longestRun, 0)
  assert.equal(foldSession([]).longestRun, 0)
})

test('连续活动时长：簿记事件不参与，「会话标题」这类定期写入不会拉长时长', () => {
  const events = []
  // 一周里每天被后台机制写一条簿记事件，但人只来聊过一次。
  for (let day = 7; day <= 14; day += 1) {
    events.push({ type: 'session/title', time: at(2026, 10, day, 12), data: { title: 'x' } })
    events.push({ type: 'goal/change', time: at(2026, 10, day, 13), data: {} })
    events.push({ type: 'schedule/change', time: at(2026, 10, day, 14), data: {} })
  }
  events.push(assistantMessage(at(2026, 10, 7, 12, 0), 1, 1, { inputTokens: 1 }))
  const folded = foldSession(events)
  assert.equal(folded.longestRun, 0, '簿记把事件铺满了一周，但没有任何一场真正的活动')

  // 同一天里真干了两条，时长只按这两条算。
  const withWork = foldSession([
    ...events,
    assistantMessage(at(2026, 10, 7, 12, 30), 2, 1, { inputTokens: 1 }),
  ])
  assert.equal(withWork.longestRun, 30 * 60 * 1000)
})

test('连续活动时长：事件时间乱序也能正确分段', () => {
  const folded = foldSession([
    assistantMessage(at(2026, 9, 14, 9, 20), 2, 1, { inputTokens: 1 }),
    assistantMessage(at(2026, 9, 14, 9, 0), 1, 1, { inputTokens: 1 }),
    assistantMessage(at(2026, 9, 14, 14, 0), 3, 1, { inputTokens: 1 }),
  ])
  assert.equal(folded.longestRun, 20 * 60 * 1000)
})

test('并表按天汇总会话数、模型与小时，并挑出最长的一次连续活动', () => {
  const short = [assistantMessage(at(2026, 9, 14, 10), 1, 1, { inputTokens: 10 }, 'model-a')]
  // 九点到九点十分，十分钟一场。
  const long = [
    assistantMessage(at(2026, 9, 14, 9, 0), 1, 1, { inputTokens: 20 }, 'model-b'),
    assistantMessage(at(2026, 9, 14, 9, 10), 2, 1, { inputTokens: 30 }, 'model-a'),
  ]
  const value = rollup([short, long])

  assert.equal(value.totals.input, 60)
  assert.equal(value.totals.tokens, 60)
  assert.equal(value.totals.sessions, 2)
  assert.equal(value.days.length, 1)
  assert.equal(value.days[0].sessions, 2, '同一天两个会话')
  assert.deepEqual(value.days[0].models, { 'model-a': 40, 'model-b': 20 })
  assert.equal(value.peak.date, '2026-09-14')
  assert.equal(value.peak.tokens, 60)
  assert.equal(value.duration.longestMs, 10 * 60 * 1000, '取的是那十分钟的一场')
  // 模型按用量降序，榜首是最多的那个。
  assert.deepEqual(value.models.map((model) => model.id), ['model-a', 'model-b'])
})

test('连续天数：当前从今天或昨天往回数，最长取历史最长的一段', () => {
  const today = new Date()
  const key = (offset) => {
    const date = new Date(today)
    date.setDate(date.getDate() - offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  // 今天、昨天、前天连续三天；再往前隔一天有两天。
  const current = streaks([key(0), key(1), key(2), key(4), key(5)])
  assert.equal(current.current, 3)
  assert.equal(current.longest, 3)

  // 今天没有活动，昨天有：仍算连续。
  const yesterday = streaks([key(1), key(2)])
  assert.equal(yesterday.current, 2)

  // 最近一次活动在一周前：当前连续归零，最长保留。
  const stale = streaks([key(7), key(8), key(9)])
  assert.equal(stale.current, 0)
  assert.equal(stale.longest, 3)

  assert.deepEqual(streaks([]), { current: 0, longest: 0 })
})

test('缓存文档往返后桶、小时与模型都保持不变', () => {
  const folded = foldSession([
    assistantMessage(at(2026, 9, 14, 10), 1, 1, { inputTokens: 3, outputTokens: 4, cacheReadTokens: 5 }, 'model-a'),
  ])
  const restored = daysFromObject(daysToObject(folded.days))
  const before = folded.days.get('2026-09-14')
  const after = restored.get('2026-09-14')
  assert.equal(after.input, before.input)
  assert.equal(after.cacheRead, before.cacheRead)
  assert.equal(after.calls, before.calls)
  assert.deepEqual(after.hours, before.hours)
  assert.equal(after.models.get('model-a').input, 3)

  assert.equal(daysFromObject(null).size, 0)
  assert.equal(daysFromObject({ '2026-09-14': null }).size, 0)
})

test('会话日志遍历取最新一代日志并报出指纹', () => {
  const root = join(scratch, 'sessions')
  rmSync(scratch, { recursive: true, force: true })
  const sessionDir = join(root, '--D-BigModel--', 'session-aaaa')
  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(join(sessionDir, 'session.v0.jsonl.zstd'), 'old')
  writeFileSync(join(sessionDir, 'session.v4.jsonl.zstd'), 'newest-generation')
  // 非日志文件应当被忽略。
  writeFileSync(join(sessionDir, 'notes.txt'), 'ignore me')

  const logs = listSessionLogs(root)
  assert.equal(logs.length, 1)
  assert.equal(logs[0].id, 'session-aaaa')
  assert.ok(logs[0].path.endsWith('session.v4.jsonl.zstd'), '选的是版本号最大的一代')
  assert.equal(logs[0].size, 'newest-generation'.length)
  assert.ok(Number.isFinite(logs[0].mtimeMs))

  assert.deepEqual(listSessionLogs(join(scratch, 'missing')), [])
  rmSync(scratch, { recursive: true, force: true })
})
