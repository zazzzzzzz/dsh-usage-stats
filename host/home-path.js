/**
 * 解析 harness home 目录下的一个路径。
 *
 * 宿主通过 `dshHomePath` 服务发布自己的 home 目录，该服务会把收到的片段拼起来；
 * 服务不存在时退回 `$DSH_HOME`，再退回 `~/.dsh`。这样无论宿主怎么配置，
 * 会话日志与缓存都落在同一个目录下。
 *
 * @param ctx - 宿主插件上下文。
 * @param segments - harness home 之下的路径片段。
 * @returns 解析后的绝对路径。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export function harnessPath(ctx, ...segments) {
  const resolvePath = ctx.get('dshHomePath')
  if (typeof resolvePath === 'function') return resolvePath(...segments)
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), ...segments)
}
