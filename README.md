# dsh-usage-stats

DeepSeek Harness 左侧栏的模型 Token 用量统计面板。

点侧栏里的「使用统计」，中间区域显示这份看板：累计 Token 数、峰值 Token 数、最长聊天时长、
当前与最长连续使用天数、Token 活动热力图、每日分模型趋势折线，以及按模型分列的用量占比。

## 它显示什么

| 区块 | 内容 |
|---|---|
| 累计数字 | 全部历史累计 Token、单日峰值 Token、最长单次会话时长、当前与历史最长连续使用天数 |
| Token 活动 | 按天的活动热力图，可切换「每日 / 每周 / 累计」三种口径；指针停在某一天上显示当天用量与轮消息数 |
| 时间范围 | 近 7 日 / 近 30 日 / 全部，决定趋势图与模型占比看哪一段 |
| 每日 Token 趋势图 | 范围内每个模型一条折线；指针移上去画出竖线与当天的点，并列出当天合计与分模型明细 |
| 模型用量 | 环形图与排名列表，含每个模型的占比与 Token 数 |

顶部五个数字始终描述全部历史，不随时间范围变化。

「最长聊天时长」量的是**单次连续活动**最长的一段，不是会话从建立到最后的跨度：
会话里的活动时间排好序，两次活动相隔超过 1 小时就算断开、另起一段，取最长的那一段。
会话可以隔几天再回来接着聊，用首末时间相减会把中间的空档也算进去（跨一周的会话会报成 170 多个小时），
这不是「聊了多久」。阈值写在 `host/usage.js` 的 `IDLE_GAP_MS`。

## 数据从哪来

宿主没有发布「按天分桶的全局用量」这样的服务：`tokenUsage` 投影只覆盖单个会话，
会话列表也只带每个会话自己的合计。所以插件的宿主半边自己读会话日志：

- 用宿主的 `sessionQuery.readSession()` 读取每个会话的完整事件（会话日志是多帧 zstd，
  `node:zlib` 只解第一帧，解码必须交给宿主的读取器）；
- 折叠 `assistant/message` 与 `assistant/attempt` 上携带的使用量样本，
  同一 `turn`/`step` 上的重试替换而不是叠加，四个桶 input / output / cacheRead / cacheWrite 互不重叠；
- 在这之上补日期与小时两个维度，让界面能画热力图与趋势线，并按范围重新求和。

自算结果按「日志大小 + 修改时间」缓存在 `$DSH_HOME/cache/dsh-usage-stats/usage.json`，
热启动只重读变过的日志。汇总结果有 60 秒保鲜期，过期后下一次请求会在后台重算。

汇总通过私有路由 `GET /dsh-usage-stats/usage` 交给界面，该路由只接受同源只读请求，
并与宿主的 `/api` 使用同一道来源校验。

### 刷新时机

面板挂载时取一次，之后每 20 秒取一次；窗口重新可见或重新获得焦点时立即取一次。
面板被切走即停止，不留后台轮询。

宿主侧的汇总有 30 秒保鲜期：保鲜期内直接返回上一次的结果，过期后的第一次请求会在后台重算，
界面先拿到旧值、稍后自动补上新值。重算只重读「大小或修改时间变了」的会话日志，
所以这个频率的代价是一遍目录遍历加上当前会话日志的一次读取。

## 安装

插件是一个普通的 cordis bundle：包放进 profile 的 `node_modules`，再让 profile 认得它。
本机开发时用 `link:` 依赖最省事——源码改了不用重新拷贝。

以桌面 profile（`%USERPROFILE%\.dsh\profiles\desktop`）为例：

1. 在 profile 的 `package.json` 里加依赖并挂进 bundle 清单：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-claude-style",
        "dsh-usage-stats"
      ]
    }
  },
  "dependencies": {
    "dsh-usage-stats": "link:D:/BigModel/DSH_PLUGIN/dsh-usage-stats"
  }
}
```

2. 装依赖：

```powershell
cd $env:USERPROFILE\.dsh\profiles\desktop
pnpm install
```

3. 重启 DSH。插件包内的 `cordis.patch.yml` 会自己把 `ui-usage-stats` 这一行插进 Web 客户端清单，
   不需要另外改 profile 的 `cordis.patch.yml`。

如果不想走 bundle 清单，也可以只把包拷进 `node_modules`，再在 profile 的 `cordis.patch.yml` 末尾加一条：

```yaml
- id: ui-usage-stats
  name: dsh-usage-stats
  disabled: false
```

两种方式都需要重启 DSH 才会装载：profile 的 bundle 清单与 patch 文件在启动时读取。

## 开发

```sh
node scripts/build.mjs      # src/ → lib/client.js
node scripts/build.mjs --check
node --test test/usage.test.mjs test/routes.test.mjs
```

`test/` 覆盖两处不能靠界面看出来的接缝：宿主半边的折叠规则（重试替换、按天与按模型分桶、
连续天数、缓存往返、会话日志遍历），以及宿主路由（路径、方法、来源校验、冷启动应答）。

`lib/client.js` 是拼装产物，不要手改。源码在 `src/` 下，片段共享同一个作用域，
不使用 import/export，拼装顺序由 `scripts/build.mjs` 的 `FRAGMENTS` 决定。
不引入任何运行时依赖与打包器：DSH 的浏览器模块加载器没有相对 require，
插件 bundle 必须是一个自包含脚本。

宿主半边在 `host/` 下，是普通的 ESM：`index.js` 负责挂载，`usage.js` 负责汇总，
`routes.js` 负责路由，`home-path.js` 解析 harness home。

## 许可

MIT
