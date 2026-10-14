/**
 * 插件的宿主路由。
 *
 * 浏览器半边需要的那份汇总只有宿主算得出来，所以这里把它挂到宿主的 Web 服务上，
 * 路径是本插件自己的前缀 `/dsh-usage-stats`。
 *
 * 注册是逐条进行的：某个路径被别的插件占住时只报告那一条，其余照常注册——
 * 这里抛出去会让整个 fiber 失败，浏览器半边也会一起失效。
 */
import { createUsage } from './usage.js'

/** 本插件占用的路由前缀。 */
const ROUTE_PREFIX = '/dsh-usage-stats'
/** 用量汇总的读取路径。 */
const USAGE_PATH = `${ROUTE_PREFIX}/usage`

/**
 * 一条读取用户自己数据的路由必须先过的校验，返回 401 / 403 或 undefined。
 *
 * `webServer.register()` 交给插件路由的是原始请求：宿主的 `/api` 站在
 * Host/Origin 校验与浏览器会话 cookie 之后，插件路由默认不在那道墙后面。
 * 这里借用宿主自己的判断 `connection.requestRejection()`；
 * 该服务不存在的宿主上退回到只服务本机回环请求的替代实现。
 *
 * @param ctx - 宿主插件上下文。
 * @param req - node 请求。
 * @returns 401 / 403，或 undefined 表示可以放行。
 */
function refusalOf(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection === 'function') return connection.requestRejection(req)
  const host = req.headers.host
  if (host !== undefined) {
    if (!URL.canParse(`http://${host}`)) return 403
    const name = new URL(`http://${host}`).hostname
    if (name !== 'localhost' && name !== '[::1]' && !/^127\.\d+\.\d+\.\d+$/.test(name)) return 403
  }
  const site = req.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return 403
  const origin = req.headers.origin
  if (origin === undefined) return undefined
  if (!URL.canParse(origin)) return 403
  return new URL(origin).host === host ? undefined : 403
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.byteLength),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * 注册插件的宿主路由。
 *
 * @param ctx - 宿主插件上下文。
 * @param scope - 带 `webServer` 声明的 inject scope，或在不支持 inject 的宿主上就是 `ctx` 本身。
 */
export function registerRoutes(ctx, scope) {
  const report = (message, error) => ctx.logger?.warn?.(`dsh-usage-stats: ${message}: ${error?.message ?? error}`)

  scope.effect(() => {
    const disposers = []
    const usage = createUsage(ctx)

    const methodRefused = (req, res) => {
      if (req.method === 'GET') return false
      res.writeHead(405, { allow: 'GET' })
      res.end()
      return true
    }

    const fenceRefused = (req, res) => {
      const refused = refusalOf(ctx, req)
      if (refused === undefined) return false
      sendJson(res, refused, { ok: false, error: refused === 401 ? 'unauthorized' : 'forbidden' })
      return true
    }

    const register = (label, route) => {
      try {
        disposers.push(scope.webServer.register(route))
      } catch (error) {
        report(`${label} 路由不可用`, error)
      }
    }

    register('usage', {
      kind: 'exact',
      path: USAGE_PATH,
      handler: (req, res) => {
        // 只读，且只接受同源请求：答案是插件对用户自己会话历史的汇总。
        if (methodRefused(req, res)) return
        if (fenceRefused(req, res)) return
        let snapshot = usage.snapshot()
        if (snapshot.value === null || snapshot.computing || snapshot.stale) {
          // 冷启动立刻回一个「还在算」，界面据此继续轮询；聚合结果随后就到。
          void usage.refresh()
          snapshot = usage.snapshot()
        }
        sendJson(res, 200, {
          ok: true,
          value: snapshot.value,
          computing: snapshot.computing === true,
          ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
        })
      },
    })

    return () => {
      usage.dispose()
      for (const dispose of disposers) {
        try {
          dispose()
        } catch (error) {
          report('路由注销失败', error)
        }
      }
    }
  }, 'dsh-usage-stats: host routes')
}
