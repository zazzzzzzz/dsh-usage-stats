/**
 * 用量统计插件的宿主半边。
 *
 * 浏览器半边读不到会话日志，也读不到 harness home，所以跨会话的用量汇总必须在这里算，
 * 再通过一条私有路由交给界面。本文件只负责挂载；汇总逻辑在 usage.js，路由在 routes.js。
 *
 * 注册是防御性的：宿主没有 Web 服务、或路由前缀已被别的插件占用时，
 * 这个插件仍然要能激活——宿主半边一旦抛错，整个 fiber 连同浏览器半边一起失效。
 * 浏览器半边在拿不到数据时会自己显示不可用状态。
 */
import { registerRoutes } from './routes.js'

export const name = 'dsh-usage-stats'

/**
 * 注册插件的宿主表面。
 * @param ctx - 宿主插件上下文。
 */
export function apply(ctx) {
  // 一律通过 inject 注册，不直接挂在裸 ctx 上：`ctx.get()` 只是宽松读取，
  // 而处理函数里对 `scope.webServer` 的属性访问受 fiber 的 inject 声明约束。
  // inject() 会等服务就绪并把带声明的 scope 交给注册函数，因此启动时应用
  // 与热重载都能注册成功；没有 Web 服务的宿主会在这里等待，插件其余部分照常。
  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], (scope) => { registerRoutes(ctx, scope) })
  else registerRoutes(ctx, ctx)
}
