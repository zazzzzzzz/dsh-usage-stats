/**
 * 宿主路由的集成测试。
 *
 * 这条接缝是插件里唯一不能靠界面看出来的部分：路由挂在宿主的 Web 服务上，
 * 路径、方法、来源校验与「还在算」的应答都在这里定死。下面用一个桩 webServer
 * 把这些行为逐条断言，会话目录给一个空目录，所以不需要真实日志。
 *
 * 运行：node --test test/usage.test.mjs test/routes.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { registerRoutes } from '../host/routes.js'

const here = dirname(fileURLToPath(import.meta.url))
const scratch = join(here, '..', '.debug', 'routes-tmp')

/** 装好插件，返回被注册的路由与一个发请求的帮手。 */
function mount(options = {}) {
  const registered = []
  const disposers = []
  const warnings = []
  const home = join(scratch, 'home')
  mkdirSync(join(home, 'sessions'), { recursive: true })

  const ctx = {
    logger: { warn: (message) => warnings.push(message) },
    get(name) {
      if (name === 'dshHomePath') return (...segments) => join(home, ...segments)
      if (name === 'connection') return options.connection
      if (name === 'sessionQuery') return undefined
      return undefined
    },
  }
  const scope = {
    webServer: {
      register(route) {
        registered.push(route)
        return () => disposers.push(route.path)
      },
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
  }

  registerRoutes(ctx, scope)

  /** 发一个请求，拿回状态码与解析后的 JSON。 */
  const call = (method, headers = {}) => new Promise((resolve) => {
    const route = registered[0]
    const req = { method, url: route.path, headers }
    const res = {
      status: null,
      headers: null,
      writeHead(status, extra) { this.status = status; this.headers = extra ?? null },
      end(body) {
        resolve({
          status: this.status,
          headers: this.headers,
          body: body === undefined ? null : JSON.parse(Buffer.from(body).toString('utf8')),
        })
      },
    }
    route.handler(req, res)
  })

  return { registered, disposers, warnings, call }
}

test('注册的是一条 GET 精确路由，路径在本插件的前缀下', () => {
  const { registered, disposers } = mount()
  assert.equal(registered.length, 1)
  assert.equal(registered[0].kind, 'exact')
  assert.equal(registered[0].path, '/dsh-usage-stats/usage')
  assert.equal(typeof registered[0].handler, 'function')
  // 清理函数已交给 scope：跑一遍它，路由的注销函数才真正被调用。
  const teardown = disposers.find((entry) => typeof entry === 'function')
  assert.equal(typeof teardown, 'function')
  teardown()
  assert.ok(disposers.includes('/dsh-usage-stats/usage'), '注销时摘掉了路由')
  rmSync(scratch, { recursive: true, force: true })
})

test('冷启动先回「还在算」，随后回真正的汇总', async () => {
  const { call } = mount()
  const cold = await call('GET', { host: '127.0.0.1:19387' })
  assert.equal(cold.status, 200)
  assert.equal(cold.body.ok, true)
  assert.equal(cold.body.value, null, '还没有值时不把未知画成 0')
  assert.equal(cold.body.computing, true)

  // 汇总在后台跑，等它落地后再问一次。
  await new Promise((resolve) => setTimeout(resolve, 50))
  const warm = await call('GET', { host: '127.0.0.1:19387' })
  assert.equal(warm.status, 200)
  assert.equal(warm.body.ok, true)
  assert.equal(warm.body.computing, false)
  assert.ok(warm.body.value !== null, '空会话目录也要给出一个完整的汇总文档')
  assert.equal(warm.body.value.totals.tokens, 0)
  assert.equal(warm.body.value.totals.sessions, 0)
  assert.deepEqual(warm.body.value.days, [])
  assert.deepEqual(warm.body.value.models, [])
  assert.equal(warm.body.value.peak, null)
  assert.deepEqual(warm.body.value.streak, { current: 0, longest: 0 })
  assert.equal(warm.body.value.hours.length, 24)
  rmSync(scratch, { recursive: true, force: true })
})

test('非 GET 方法回 405 并声明允许的方法', async () => {
  const { call } = mount()
  const answer = await call('POST', { host: '127.0.0.1:19387' })
  assert.equal(answer.status, 405)
  assert.equal(answer.headers.allow, 'GET')
  rmSync(scratch, { recursive: true, force: true })
})

test('来源校验拒绝跨站与非常规 Host，放行本机回环请求', async () => {
  const { call } = mount()
  // 非回环 Host：403。
  assert.equal((await call('GET', { host: 'evil.example' })).status, 403)
  // 页面来源与 Host 不一致：403。
  const crossSite = await call('GET', { host: '127.0.0.1:19387', origin: 'http://evil.example' })
  assert.equal(crossSite.status, 403)
  assert.equal(crossSite.body.error, 'forbidden')
  // 跨站标记：403。
  assert.equal((await call('GET', { host: '127.0.0.1:19387', 'sec-fetch-site': 'cross-site' })).status, 403)
  // 同源：放行。
  const sameOrigin = await call('GET', { host: '127.0.0.1:19387', origin: 'http://127.0.0.1:19387' })
  assert.equal(sameOrigin.status, 200)
  rmSync(scratch, { recursive: true, force: true })
})

test('宿主自带来源校验时以它为准', async () => {
  const { call } = mount({ connection: { requestRejection: () => 401 } })
  const answer = await call('GET', { host: '127.0.0.1:19387' })
  assert.equal(answer.status, 401)
  assert.equal(answer.body.error, 'unauthorized')
  rmSync(scratch, { recursive: true, force: true })
})

test('路由路径被别的插件占用时只报告那一条，插件仍然装上', () => {
  const warnings = []
  const ctx = { logger: { warn: (message) => warnings.push(message) }, get: () => undefined }
  const scope = {
    webServer: { register() { throw new Error('path already taken') } },
    effect(fn) { return fn() },
  }
  assert.doesNotThrow(() => registerRoutes(ctx, scope))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /usage 路由不可用/)
})
