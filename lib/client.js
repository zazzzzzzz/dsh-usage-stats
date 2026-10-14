/**
 * dsh-usage-stats —— 左侧栏「使用统计」面板的客户端半边。
 *
 * 生成文件，请勿手工修改。源码在 src/ 下，由 node scripts/build.mjs 拼装。
 *
 * 片段拼装顺序：
 *   - src/constants.js
 *   - src/format.js
 *   - src/store.js
 *   - src/icon.js
 *   - src/charts.js
 *   - src/panel.js
 *   - src/styles.js
 *   - src/entry.js
 */
window.__ModuleLoader__.load({
  id: "dsh-usage-stats",
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    // React 从模块加载器的模块图里取，这样界面组件不需要宿主半边。
    var React = require('react')


/* ---- src/constants.js ---- */
    /**
     * 面板用到的固定值：路由、席位、范围与调色板。
     *
     * 这些名字同时被宿主半边和样式表引用，改这里之前先确认两边都跟得上。
     */

    /** 宿主半边提供的汇总路由。 */
    const USAGE_ROUTE = '/dsh-usage-stats/usage'
    /** 侧栏的「全局面板入口」列表席位。 */
    const PANEL_SLOT = 'sidebar.panellist'
    /** 布局里按面板 id 分派的主区域键控席位。 */
    const MAIN_SLOT = 'main'
    /** 本插件在侧栏里的条目 id，同时也是主面板的键。 */
    const PANEL_ID = 'usage-stats'
    /** 侧栏条目排序：落在会话浏览之上、账户与设置之下。 */
    const PANEL_ORDER = 25
    /** 侧栏条目文案。 */
    const PANEL_TITLE = '使用统计'
    /** 注入样式表的元素 id。 */
    const STYLE_ID = 'dsh-usage-stats-style'

    /** 宿主还在汇总时的轮询间隔与次数上限。 */
    const POLL_MS = 700
    const POLL_MAX = 24
    /**
     * 面板开着时的定时刷新间隔。
     *
     * 宿主那边有 30 秒的保鲜期，所以这里比它略短一点：既能尽快看到新用量，
     * 又不会每次请求都真的重算一遍会话日志。窗口重新获得焦点时另有一次立即刷新。
     */
    const REFRESH_MS = 20_000

    /** 时间范围选项；days 为 0 表示全部。 */
    const RANGES = [
      { id: '7d', label: '近 7 日', days: 7 },
      { id: '30d', label: '近 30 日', days: 30 },
      { id: 'all', label: '全部', days: 0 },
    ]
    const DEFAULT_RANGE = '30d'

    /** 活动热力图的三种口径。 */
    const HEAT_MODES = [
      { id: 'day', label: '每日' },
      { id: 'week', label: '每周' },
      { id: 'total', label: '累计' },
    ]
    const DEFAULT_HEAT_MODE = 'day'
    /** 热力图始终铺满一整年：53 列，最后一列只到今天所在的那一天。 */
    const HEAT_COLUMNS = 53
    /** 格子边长按卡片宽度反推，再夹在这个区间里；间距固定。 */
    const HEAT_CELL_MIN = 7
    const HEAT_CELL_MAX = 18
    const HEAT_GAP = 3
    /** 一天的热度分四档。 */
    const HEAT_STEPS = 4

    /** 折线图与环形图的配色，按用量排名依次取用。 */
    const SERIES_COLORS = ['#4f8ef7', '#22c55e', '#a855f7', '#ef4444', '#f59e0b', '#14b8a6', '#ec4899', '#84cc16']
    /** 环形图与图例里单独列出的模型数量，其余合并成一行。 */
    const MAX_SERIES = 5
    const OTHER_LABEL = '其他模型'

/* ---- src/format.js ---- */
    /**
     * 数字与时间的显示格式。
     *
     * 面向中文界面：Token 用「亿 / 万」计数，日期用「9月14日」，
     * 时长用「7 小时 50 分钟」。
     */

    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    /** 本地日历日，与宿主半边按天分桶用的键一致。 */
    function dayKey(date) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    }

    /** 把 `YYYY-MM-DD` 还原成本地零点的 Date。 */
    function parseDay(day) {
      const parts = String(day).split('-')
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    }

    /** 今天的日期键。 */
    function todayKey() {
      return dayKey(new Date())
    }

    /** 去掉小数点后多余的 0，让「1.0 亿」显示成「1 亿」。 */
    function trimZero(value) {
      const fixed = value >= 100 ? value.toFixed(0) : value.toFixed(1)
      return fixed.replace(/\.0$/, '')
    }

    /** Token 数：49.7 亿 / 7.6 亿 / 3456 万 / 842。 */
    function formatTokens(value, spaced) {
      const count = Math.max(0, Number(value) || 0)
      const gap = spaced === false ? '' : ' '
      if (count >= 1e8) return trimZero(count / 1e8) + gap + '亿'
      if (count >= 1e4) return trimZero(count / 1e4) + gap + '万'
      return String(Math.round(count))
    }

    /** 千分位整数，用于 Token 明细行。 */
    function formatCount(value) {
      const count = Math.max(0, Math.round(Number(value) || 0))
      return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    /** 时长：7 小时 50 分钟 / 12 分钟 / 45 秒；超过一天改用天与小时。 */
    function formatDuration(ms) {
      const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
      if (seconds < 60) return `${seconds} 秒`
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return `${minutes} 分钟`
      const hours = Math.floor(minutes / 60)
      const rest = minutes % 60
      if (hours >= 24) {
        const days = Math.floor(hours / 24)
        const restHours = hours % 24
        return restHours === 0 ? `${days} 天` : `${days} 天 ${restHours} 小时`
      }
      return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`
    }

    /** 日期：9月14日。 */
    function formatDayLabel(day) {
      const date = parseDay(day)
      return `${date.getMonth() + 1}月${date.getDate()}日`
    }

    /** 带年份的日期：2026年9月14日。悬浮提示里用完整形式，避免跨年时看不出来。 */
    function formatDayFull(day) {
      const date = parseDay(day)
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    }

    /** 月份：10月。 */
    function formatMonthLabel(day) {
      const date = parseDay(day)
      return `${date.getMonth() + 1}月`
    }

    /** 百分比：64% / 2.6%。 */
    function formatPercent(part, whole) {
      const total = Number(whole) || 0
      if (total <= 0) return '0%'
      const value = (Number(part) || 0) / total * 100
      if (value >= 10) return `${value.toFixed(0)}%`
      if (value >= 1) return `${value.toFixed(1)}%`
      if (value > 0) return `${value.toFixed(2)}%`
      return '0%'
    }

    /** 模型名：`deepseek/deepseek-v4-flash` 这类 id 原样显示。 */
    function modelLabel(id) {
      return String(id)
    }

    /** 模型名对应的稳定颜色：按排名取色，同一个模型在同一份数据里颜色固定。 */
    function seriesColor(index) {
      return SERIES_COLORS[index % SERIES_COLORS.length]
    }

/* ---- src/store.js ---- */
    /**
     * 面板的数据取用与派生。
     *
     * 数据只有一个来源：宿主半边的汇总路由。冷启动时路由先回一个
     * `computing`，面板保持骨架并继续轮询，直到真正的数值落地——
     * 所以首屏永远不等聚合，也永远不会把「还没到」画成 0。
     *
     * 拿到全局汇总之后，界面要的两份视图都在这里派生：
     * 选定时间范围的裁剪（趋势图与模型占比用），以及活动热力图的网格。
     */

    /**
     * 汇总的存取：路由的答案、轮询，以及订阅。
     * @returns 读取状态、发起加载、订阅变化与停止的方法。
     */
    function createUsageStore() {
      const state = { value: null, computing: false, error: null, loading: false, polls: 0 }
      const listeners = []
      let timer = null
      let disposed = false

      function emit() {
        const snapshot = listeners.slice()
        for (let index = 0; index < snapshot.length; index += 1) snapshot[index]()
      }

      function subscribe(listener) {
        listeners.push(listener)
        return () => {
          const index = listeners.indexOf(listener)
          if (index !== -1) listeners.splice(index, 1)
        }
      }

      function stopPolling() {
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
      }

      /**
       * 读取一次汇总。`computing` 会安排下一次轮询，所以宿主一算完面板就补上。
       * @param force - 为真时忽略「已有数值就不重取」的短路。
       */
      function load(force) {
        if (disposed || state.loading) return
        if (force !== true && state.value !== null && state.computing !== true) return
        state.loading = true
        fetch(USAGE_ROUTE, { credentials: 'same-origin', headers: { accept: 'application/json' } })
          .then((response) => (response !== null && response.ok === true ? response.json() : null))
          .then((body) => {
            state.loading = false
            if (disposed) return
            if (body === null || body.ok !== true) {
              state.error = 'unavailable'
              emit()
              return
            }
            state.value = body.value === undefined ? null : body.value
            state.computing = body.computing === true
            state.error = body.error === undefined ? null : body.error
            emit()
            if (state.computing && state.polls < POLL_MAX) {
              state.polls += 1
              stopPolling()
              timer = setTimeout(() => {
                timer = null
                load(true)
              }, POLL_MS)
            }
          })
          .catch(() => {
            state.loading = false
            if (disposed) return
            state.error = 'unavailable'
            emit()
          })
      }

      return {
        state() { return state },
        subscribe,
        load,
        stop() {
          disposed = true
          stopPolling()
          listeners.length = 0
        },
      }
    }

    /** 选定范围的起始日期键；「全部」没有起点。 */
    function rangeStartKey(days) {
      if (!days) return null
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      start.setDate(start.getDate() - (days - 1))
      return dayKey(start)
    }

    /**
     * 把全局汇总裁剪成选定范围的视图。
     *
     * 顶部那排累计数字与连续天数说的是全部历史，不随范围变化；
     * 时间范围只决定趋势图与模型占比看哪一段。
     *
     * @param value - 宿主半边返回的汇总文档。
     * @param days - 范围天数，0 表示全部。
     */
    function windowView(value, days) {
      if (value === null || value === undefined || !Array.isArray(value.days)) return null
      const start = rangeStartKey(days)
      const rows = start === null ? value.days : value.days.filter((row) => row.date >= start)
      const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, tokens: 0 }
      const byModel = new Map()
      let peak = null
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]
        totals.input += Number(row.input) || 0
        totals.output += Number(row.output) || 0
        totals.cacheRead += Number(row.cacheRead) || 0
        totals.cacheWrite += Number(row.cacheWrite) || 0
        totals.calls += Number(row.calls) || 0
        const tokens = Number(row.tokens) || 0
        totals.tokens += tokens
        if (peak === null || tokens > peak.tokens) peak = { date: row.date, tokens }
        const models = row.models
        if (models === null || models === undefined) continue
        for (const id in models) {
          byModel.set(id, (byModel.get(id) || 0) + (Number(models[id]) || 0))
        }
      }
      const models = []
      byModel.forEach((tokens, id) => { models.push({ id, tokens }) })
      models.sort((left, right) => right.tokens - left.tokens)
      return { rows, totals, models, peak, activeDays: rows.length }
    }

    /**
     * 活动热力图的网格。
     *
     * 列是周、行是星期（周日在最上面）。最后一列放今天，所以第一列是它往前数
     * `columns - 1` 周的那个周日——这样正好 `columns` 列，不会多出一列被裁掉，
     * 最后一列则只到今天（今天之前的星期几不画未来）。
     *
     * 同一份数据有三种口径：当天、所在周的合计，以及到那天为止的累计。
     *
     * @param days - 按天分桶的行。
     * @param columns - 列数。
     * @param mode - `day` / `week` / `total`。
     */
    function heatGrid(days, columns, mode) {
      const width = Math.max(1, Math.floor(columns))
      const byDay = {}
      const callsByDay = {}
      const list = Array.isArray(days) ? days : []
      for (let index = 0; index < list.length; index += 1) {
        byDay[list[index].date] = Number(list[index].tokens) || 0
        callsByDay[list[index].date] = Number(list[index].calls) || 0
      }
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const start = new Date(today)
      start.setDate(start.getDate() - start.getDay() - (width - 1) * 7)

      const raw = []
      for (const cursor = new Date(start); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
        const key = dayKey(cursor)
        raw.push({ date: key, tokens: byDay[key] || 0, calls: callsByDay[key] || 0 })
      }

      const weekSums = []
      for (let index = 0; index < raw.length; index += 1) {
        const week = Math.floor(index / 7)
        weekSums[week] = (weekSums[week] || 0) + raw[index].tokens
      }

      const cells = []
      let running = 0
      let peak = 0
      for (let index = 0; index < raw.length; index += 1) {
        const week = Math.floor(index / 7)
        running += raw[index].tokens
        let value = raw[index].tokens
        if (mode === 'week') value = weekSums[week] || 0
        else if (mode === 'total') value = running
        if (value > peak) peak = value
        cells.push({ date: raw[index].date, tokens: raw[index].tokens, calls: raw[index].calls, value, week, level: 0 })
      }
      const lastDate = raw.length === 0 ? null : raw[raw.length - 1].date
      for (let index = 0; index < cells.length; index += 1) {
        if (cells[index].value <= 0 || peak <= 0) continue
        cells[index].level = Math.max(1, Math.min(HEAT_STEPS, Math.ceil(cells[index].value / peak * HEAT_STEPS)))
      }

      // 每一列顶部标一次月份：只在月份与上一列不同时标，避免挤成一团。
      const monthLabels = []
      let previousMonth = null
      for (let column = 0; column < width; column += 1) {
        const index = column * 7
        if (index >= cells.length) break
        const label = formatMonthLabel(cells[index].date)
        if (label !== previousMonth) {
          monthLabels.push({ week: column, label })
          previousMonth = label
        }
      }
      return { cells, columns: width, peak, monthLabels, lastDate }
    }

/* ---- src/icon.js ---- */
    /**
     * 侧栏条目图标。
     *
     * 侧栏把注册进 `sidebar.panellist` 的组件渲染在一枚 16–18px 的格子里，
     * 并把 `size` 与 `active`（该面板是否正在显示）作为 props 交给它。
     * 颜色用 `currentColor`，因此选中态由侧栏自己的样式决定。
     */
    function UsageIcon(props) {
      const size = Number(props?.size) || 18
      return React.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, [
        // 三条柱子：用量统计的直观形状。
        React.createElement('line', { key: 'a', x1: 6, y1: 20, x2: 6, y2: 13 }),
        React.createElement('line', { key: 'b', x1: 12, y1: 20, x2: 12, y2: 7 }),
        React.createElement('line', { key: 'c', x1: 18, y1: 20, x2: 18, y2: 10 }),
        React.createElement('line', { key: 'd', x1: 3, y1: 20.5, x2: 21, y2: 20.5, strokeWidth: 1.4 }),
      ])
    }

/* ---- src/charts.js ---- */
    /**
     * 三张图：活动热力图、每日分模型趋势折线、模型占比环形图。
     *
     * 全部是手绘 SVG，没有第三方图表依赖——插件的 bundle 必须是自包含的。
     * 配色与字号交给样式表，图形本身只负责几何。
     *
     * 两张带日期的图把指针位置报给面板（`onHover`），由面板统一画悬浮提示：
     * 热力图报当天那一格，折线图报指针最近的那一天。
     */

    /** 环形图的半径与环宽（热力图格子的边长与间距在 constants.js）。 */
    const DONUT_RADIUS = 62
    const DONUT_WIDTH = 26

    /**
     * 活动热力图：列是周，行是星期（周日在最上），月份标在网格下方。
     *
     * 格子的边长由面板按卡片宽度算好传进来，所以网格横向铺满卡片；
     * 列数取自网格本身，不另行推算，免得最后那一列画到画布外面去。
     *
     * @param props.grid - `heatGrid()` 的产物。
     * @param props.cell - 格子边长（像素）。
     * @param props.gap - 列间距；面板会把剩余宽度摊进来，让网格正好铺满。
     * @param props.onHover - 指针进入某一天时收到 `{ cell }`，离开时收到 null。
     */
    function UsageHeatmap(props) {
      const grid = props.grid
      if (grid === null || grid.cells.length === 0) {
        return React.createElement('p', { className: 'dus-empty' }, '暂无活动记录')
      }
      const cell = Math.max(4, Number(props.cell) || 11)
      const gap = Math.max(1, Number(props.gap) || HEAT_GAP)
      const step = cell + gap
      const width = grid.columns * step - HEAT_GAP
      const gridHeight = 7 * step - HEAT_GAP
      const height = gridHeight + 20

      const shapes = []
      for (let index = 0; index < grid.cells.length; index += 1) {
        const day = grid.cells[index]
        shapes.push(React.createElement('rect', {
          key: day.date,
          className: `dus-heat-cell dus-heat-l${day.level}`,
          x: day.week * step,
          y: (index % 7) * step,
          width: cell,
          height: cell,
          rx: Math.max(2, cell * 0.22),
          onMouseEnter: (event) => props.onHover({ cell: day }, event),
          onMouseMove: (event) => props.onHover({ cell: day }, event),
          onMouseLeave: () => props.onHover(null),
        }))
      }

      for (let index = 0; index < grid.monthLabels.length; index += 1) {
        const entry = grid.monthLabels[index]
        shapes.push(React.createElement('text', {
          key: `m${entry.week}`,
          className: 'dus-heat-month',
          x: entry.week * step,
          y: gridHeight + 14,
        }, entry.label))
      }

      return React.createElement('div', { className: 'dus-heat-wrap' },
        React.createElement('svg', {
          className: 'dus-heat',
          width,
          height,
          viewBox: `0 0 ${width} ${height}`,
          role: 'img',
          'aria-label': `Token 活动热力图，共 ${grid.cells.length} 天`,
        }, shapes),
      )
    }

    /**
     * 每日 Token 趋势折线。
     *
     * 每个模型一条线，横轴是范围内的日期，纵轴按所有线里的最大值定标。
     * 指针落在图上时画出竖线、标出当天各条线上的点，并把当天明细报给面板。
     *
     * @param props.rows - 范围内的按天行。
     * @param props.series - `{ id, color, values }`，values 与 rows 等长。
     * @param props.onHover - 收到 `{ index, row }` 或 null。
     */
    function UsageTrendChart(props) {
      const rows = props.rows
      const series = props.series
      const width = Math.max(320, Number(props.width) || 640)
      const height = 240
      const svgRef = React.useRef(null)
      const [active, setActive] = React.useState(-1)

      if (rows === null || rows.length === 0) {
        return React.createElement('p', { className: 'dus-empty' }, '该范围内没有用量记录')
      }

      const padLeft = 48
      const padRight = 12
      const padTop = 14
      const padBottom = 28
      const plotW = Math.max(1, width - padLeft - padRight)
      const plotH = Math.max(1, height - padTop - padBottom)

      let max = 0
      for (let s = 0; s < series.length; s += 1) {
        const values = series[s].values
        for (let v = 0; v < values.length; v += 1) {
          if (values[v] > max) max = values[v]
        }
      }
      if (max <= 0) max = 1

      const xAt = (index) => (rows.length === 1
        ? padLeft + plotW / 2
        : padLeft + index * (plotW / (rows.length - 1)))
      const yAt = (value) => padTop + (1 - value / max) * plotH

      const parts = []
      // 横向网格线与纵轴刻度：0 / 1/4 / 1/2 / 3/4 / 满量程。
      for (let tick = 0; tick <= 4; tick += 1) {
        const value = max * tick / 4
        const y = yAt(value)
        parts.push(React.createElement('line', {
          key: `g${tick}`,
          className: 'dus-grid',
          x1: padLeft,
          y1: y,
          x2: padLeft + plotW,
          y2: y,
        }))
        parts.push(React.createElement('text', {
          key: `t${tick}`,
          className: 'dus-axis',
          x: padLeft - 8,
          y: y + 4,
          textAnchor: 'end',
        }, formatTokens(value, false)))
      }

      for (let s = 0; s < series.length; s += 1) {
        const line = series[s]
        const points = []
        for (let index = 0; index < line.values.length; index += 1) {
          points.push(`${xAt(index).toFixed(1)},${yAt(line.values[index]).toFixed(1)}`)
        }
        parts.push(React.createElement('polyline', {
          key: `p${line.id}`,
          className: 'dus-line',
          points: points.join(' '),
          stroke: line.color,
        }))
      }

      // 横轴日期：最多标六个，避免和邻座挤在一起。
      const stride = Math.max(1, Math.ceil(rows.length / 6))
      for (let index = 0; index < rows.length; index += stride) {
        parts.push(React.createElement('text', {
          key: `x${rows[index].date}`,
          className: 'dus-axis',
          x: xAt(index),
          y: height - 8,
          textAnchor: 'middle',
        }, formatDayLabel(rows[index].date)))
      }

      // 指针所在的那一天：竖线加每条线上的点，压在最上层。
      if (active >= 0 && active < rows.length) {
        const x = xAt(active)
        parts.push(React.createElement('line', {
          key: 'cross',
          className: 'dus-crosshair',
          x1: x,
          y1: padTop,
          x2: x,
          y2: padTop + plotH,
        }))
        for (let s = 0; s < series.length; s += 1) {
          parts.push(React.createElement('circle', {
            key: `d${series[s].id}`,
            className: 'dus-point',
            cx: x,
            cy: yAt(series[s].values[active]),
            r: 3.2,
            fill: series[s].color,
          }))
        }
      }

      /** 指针横坐标换算成最近的一天的下标；SVG 被 CSS 缩放过，所以先折算回 viewBox 坐标。 */
      const pick = (event) => {
        const node = svgRef.current
        if (node === null) return -1
        const rect = node.getBoundingClientRect()
        if (rect.width <= 0) return -1
        const local = (event.clientX - rect.left) * (width / rect.width)
        const span = plotW
        const ratio = (local - padLeft) / span
        const index = Math.round(ratio * (rows.length - 1))
        return Math.max(0, Math.min(rows.length - 1, index))
      }

      const onMove = (event) => {
        const index = pick(event)
        if (index < 0) return
        if (index !== active) setActive(index)
        props.onHover({ index, row: rows[index] }, event)
      }

      const onLeave = () => {
        setActive(-1)
        props.onHover(null)
      }

      return React.createElement('svg', {
        ref: svgRef,
        className: 'dus-trend',
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': '每日 Token 趋势图',
        onMouseMove: onMove,
        onMouseLeave: onLeave,
      }, parts)
    }

    /**
     * 模型用量环形图。
     *
     * 排名前几位各自成段，其余合并成「其他模型」。用描边圆环加 dasharray 画弧，
     * 比手算路径短，也不会有接缝。
     */
    function UsageDonut(props) {
      const models = props.models
      const total = props.total
      const size = 190
      const center = size / 2
      const circumference = 2 * Math.PI * DONUT_RADIUS

      const slices = []
      let rest = 0
      for (let index = 0; index < models.length; index += 1) {
        if (index < MAX_SERIES) slices.push({ id: models[index].id, tokens: models[index].tokens, color: seriesColor(index) })
        else rest += models[index].tokens
      }
      if (rest > 0) slices.push({ id: OTHER_LABEL, tokens: rest, color: '#94a3b8' })
      const sum = slices.reduce((carry, slice) => carry + slice.tokens, 0)

      const arcs = []
      let offset = 0
      for (let index = 0; index < slices.length; index += 1) {
        const slice = slices[index]
        const share = sum <= 0 ? 0 : slice.tokens / sum
        const length = share * circumference
        arcs.push(React.createElement('circle', {
          key: slice.id,
          className: 'dus-arc',
          cx: center,
          cy: center,
          r: DONUT_RADIUS,
          stroke: slice.color,
          strokeWidth: DONUT_WIDTH,
          strokeDasharray: `${Math.max(0, length - 2)} ${circumference - Math.max(0, length - 2)}`,
          strokeDashoffset: -offset,
          transform: `rotate(-90 ${center} ${center})`,
        }))
        offset += length
      }

      return React.createElement('svg', {
        className: 'dus-donut',
        width: size,
        height: size,
        viewBox: `0 0 ${size} ${size}`,
        role: 'img',
        'aria-label': '模型用量占比',
      }, [
        React.createElement('circle', {
          key: 'track',
          className: 'dus-donut-track',
          cx: center,
          cy: center,
          r: DONUT_RADIUS,
          strokeWidth: DONUT_WIDTH,
        }),
        ...arcs,
        React.createElement('text', {
          key: 'value',
          className: 'dus-donut-value',
          x: center,
          y: center - 2,
          textAnchor: 'middle',
        }, formatTokens(total === undefined ? sum : total, false)),
        React.createElement('text', {
          key: 'unit',
          className: 'dus-donut-unit',
          x: center,
          y: center + 16,
          textAnchor: 'middle',
        }, 'tokens'),
      ])
    }

/* ---- src/panel.js ---- */
    /**
     * 主面板：左侧栏「使用统计」条目对应的内容区。
     *
     * 版面照着用量看板该有的样子组织，从上到下依次是：
     *   1. 标题行
     *   2. 五个累计数字（累计 Token、峰值 Token、最长聊天时长、当前/最长连续天数）
     *   3. Token 活动热力图，带每日 / 每周 / 累计三种口径
     *   4. 时间范围选择
     *   5. 每日 Token 趋势折线（按模型分色）
     *   6. 模型用量环形图与排名列表
     *
     * 数据只有宿主半边一个来源；它在算的时候这里保持骨架，不把未知画成 0。
     */

    /**
     * 全局共用一个汇总存取：面板被切走再切回来时，上一份数值立刻可用，
     * 不必等一次网络往返。
     */
    let usageStore = null
    function sharedUsageStore() {
      if (usageStore === null) usageStore = createUsageStore()
      return usageStore
    }

    /**
     * 订阅汇总，并在面板挂载期间保持刷新。
     *
     * 三种取数时机：挂载时取一次、之后每 `REFRESH_MS` 取一次、
     * 以及窗口重新可见或获得焦点时立即取一次（合上盖子再回来不必干等一个周期）。
     * 面板一卸载就把定时器摘掉——切到别的面板后不该继续问。
     */
    function useUsage() {
      const store = sharedUsageStore()
      const [, bump] = React.useReducer((count) => count + 1, 0)
      React.useEffect(() => {
        const off = store.subscribe(bump)
        store.load(true)
        const timer = setInterval(() => store.load(true), REFRESH_MS)
        const wake = () => {
          if (document.visibilityState === 'visible') store.load(true)
        }
        document.addEventListener('visibilitychange', wake)
        window.addEventListener('focus', wake)
        return () => {
          off()
          clearInterval(timer)
          document.removeEventListener('visibilitychange', wake)
          window.removeEventListener('focus', wake)
        }
      }, [store])
      return store.state()
    }

    /**
     * 量一个元素的**内容**宽度（扣掉左右内边距），返回 `[width, attach]`，把 `attach` 接到它的 ref 上。
     *
     * 用回调 ref 而不是 useRef：有些元素要等数据到位才挂载（热力图所在的卡片就是），
     * 只依赖 ref 对象的效果在挂载时量到的是空元素，之后再也不会重算。
     * 而 `clientWidth` 是含内边距的，图表要的是可用内容宽度，所以这里顺手扣掉。
     */
    function useElementWidth() {
      const [node, setNode] = React.useState(null)
      const [width, setWidth] = React.useState(0)
      const attach = React.useCallback((element) => { setNode(element) }, [])
      React.useEffect(() => {
        if (node === null || node === undefined) return undefined
        const update = () => {
          const style = window.getComputedStyle(node)
          const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
          setWidth(Math.max(0, node.clientWidth - padding))
        }
        update()
        if (typeof ResizeObserver !== 'function') {
          window.addEventListener('resize', update)
          return () => window.removeEventListener('resize', update)
        }
        const observer = new ResizeObserver(update)
        observer.observe(node)
        return () => observer.disconnect()
      }, [node])
      return [width, attach]
    }

    /** 一个分段选择器：范围、口径都用它。 */
    function UsagePills(props) {
      return React.createElement('div', { className: 'dus-pills', role: 'group', 'aria-label': props.label },
        props.options.map((option) => React.createElement('button', {
          key: option.id,
          type: 'button',
          className: option.id === props.value ? 'dus-pill dus-pill-on' : 'dus-pill',
          'aria-pressed': option.id === props.value,
          onClick: () => props.onPick(option.id),
        }, option.label)),
      )
    }

    /** 一个累计数字：上面是大号数值，下面是说明。 */
    function UsageStat(props) {
      return React.createElement('div', { className: 'dus-stat' },
        React.createElement('div', { className: 'dus-stat-value', title: props.title || '' }, props.value),
        React.createElement('div', { className: 'dus-stat-label' }, props.label),
      )
    }

    /** 标题行右边的小标签。 */
    function UsageBadge(props) {
      return React.createElement('span', { className: 'dus-badge' }, props.children)
    }

    /** 一块面板卡片：标题 + 可选右上角控件 + 内容。`bodyRef` 用来量内容的实际宽度。 */
    function UsageCard(props) {
      return React.createElement('section', { className: 'dus-card' },
        React.createElement('header', { className: 'dus-card-head' },
          React.createElement('h3', { className: 'dus-card-title' }, props.title),
          props.aside === undefined ? null : React.createElement('div', { className: 'dus-card-aside' }, props.aside),
        ),
        React.createElement('div', { className: 'dus-card-body', ref: props.bodyRef }, props.children),
      )
    }

    /** 加载中的骨架：一条条灰块。 */
    function UsageSkeleton() {
      return React.createElement('div', { className: 'dus-skeleton' },
        React.createElement('div', { className: 'dus-skeleton-block dus-skeleton-tall' }),
        React.createElement('div', { className: 'dus-skeleton-block' }),
        React.createElement('div', { className: 'dus-skeleton-block' }),
      )
    }

    /**
     * 模型排名的显示行：前几位各自一行，其余并成「其他模型」。
     * 颜色按排名取，与折线图共用同一套顺序。
     */
    function modelRows(models) {
      const rows = []
      let rest = 0
      for (let index = 0; index < models.length; index += 1) {
        if (index < MAX_SERIES) rows.push({ id: models[index].id, tokens: models[index].tokens, color: seriesColor(index) })
        else rest += models[index].tokens
      }
      if (rest > 0) rows.push({ id: OTHER_LABEL, tokens: rest, color: '#94a3b8' })
      if (rows.length === 0) return rows
      const total = rows.reduce((carry, row) => carry + row.tokens, 0)
      return rows.map((row) => ({ ...row, share: total <= 0 ? 0 : row.tokens / total }))
    }

    /** 模型排名列表：一行一个模型，含占比与一条细进度条。 */
    function UsageModelList(props) {
      const rows = props.rows
      if (rows.length === 0) {
        return React.createElement('ul', { className: 'dus-model-list' },
          React.createElement('li', { className: 'dus-empty' }, '该范围内没有用量记录'))
      }
      const items = rows.map((row) => React.createElement('li', { key: row.id, className: 'dus-model-row' },
        React.createElement('div', { className: 'dus-model-head' },
          React.createElement('span', { className: 'dus-model-name' },
            React.createElement('i', { className: 'dus-dot', style: { background: row.color } }),
            modelLabel(row.id)),
          React.createElement('span', { className: 'dus-model-share' }, formatPercent(row.tokens, props.total))),
        React.createElement('div', { className: 'dus-model-tokens' },
          `${formatTokens(row.tokens, false)} tokens`),
        React.createElement('div', { className: 'dus-model-bar' },
          React.createElement('span', {
            style: { width: `${Math.max(2, row.share * 100).toFixed(2)}%`, background: row.color },
          }))))
      return React.createElement('ul', { className: 'dus-model-list' }, items)
    }

    /**
     * 热力图某一格的悬浮内容。
     *
     * 摘要始终给这一格当天的量与轮消息数；切到「每周 / 累计」时额外说明这一格的口径，
     * 否则同一格在不同口径下数字会变，看不出来差在哪。
     */
    function heatTip(cell, mode) {
      return {
        key: `heat:${cell.date}:${mode}`,
        title: formatDayFull(cell.date),
        summary: cell.calls > 0
          ? `${formatTokens(cell.tokens, false)} tokens · ${cell.calls} 轮消息`
          : '无活动',
        extra: mode === 'week'
          ? `本周合计 ${formatTokens(cell.value, true)} tokens`
          : (mode === 'total' ? `累计至此 ${formatTokens(cell.value, true)} tokens` : null),
        rows: [],
      }
    }

    /**
     * 折线图某一天的悬浮内容：先给当天合计，再把当天的模型明细按用量排开。
     * 前几位之外仍留在图外的模型并成「其他模型」。
     */
    function trendTip(row, series) {
      const models = row.models === null || row.models === undefined ? {} : row.models
      const rows = []
      let rest = 0
      for (let index = 0; index < series.length; index += 1) {
        const value = Number(models[series[index].id]) || 0
        if (value > 0) rows.push({ id: series[index].id, color: series[index].color, tokens: value })
      }
      for (const id in models) {
        let known = false
        for (let index = 0; index < series.length; index += 1) {
          if (series[index].id === id) known = true
        }
        if (!known) rest += Number(models[id]) || 0
      }
      if (rest > 0) rows.push({ id: OTHER_LABEL, color: '#94a3b8', tokens: rest })
      rows.sort((left, right) => right.tokens - left.tokens)
      return {
        key: `trend:${row.date}`,
        title: `${formatDayLabel(row.date)} · ${formatTokens(row.tokens, false)} tokens`,
        summary: `${row.calls} 轮消息 · ${row.sessions} 个会话`,
        extra: null,
        rows,
      }
    }

    /**
     * 悬浮提示卡片：标题、一行摘要、可选的口径说明，以及分模型明细。
     * 位置由面板直接写 transform，这里不参与计算。
     */
    function UsageTip(props) {
      const tip = props.tip
      const body = []
      if (tip.summary !== null && tip.summary !== undefined) {
        body.push(React.createElement('div', { key: 'sum', className: 'dus-tip-sum' }, tip.summary))
      }
      if (tip.extra !== null && tip.extra !== undefined) {
        body.push(React.createElement('div', { key: 'extra', className: 'dus-tip-extra' }, tip.extra))
      }
      if (tip.rows.length > 0) {
        body.push(React.createElement('ul', { key: 'rows', className: 'dus-tip-list' },
          tip.rows.map((row) => React.createElement('li', { key: row.id, className: 'dus-tip-row' },
            React.createElement('i', { className: 'dus-dot', style: { background: row.color } }),
            React.createElement('span', { className: 'dus-tip-name' }, modelLabel(row.id)),
            React.createElement('span', { className: 'dus-tip-value' }, formatTokens(row.tokens, false))))))
      }
      return React.createElement('div', { className: 'dus-tip', ref: props.nodeRef },
        React.createElement('div', { className: 'dus-tip-title' }, tip.title),
        body)
    }

    /** 主面板组件。 */
    function UsagePanel() {
      const state = useUsage()
      const [range, setRange] = React.useState(DEFAULT_RANGE)
      const [heatMode, setHeatMode] = React.useState(DEFAULT_HEAT_MODE)
      // 两张图各自量自己所在卡片正文的可用宽度，格子与折线都按它来定尺寸。
      const [heatWidth, attachHeatBody] = useElementWidth()
      const [trendWidth, attachTrendBody] = useElementWidth()
      /** 悬浮提示的内容；位置不走 state，直接写元素的 transform，避免每次移动都重画整块面板。 */
      const [tip, setTip] = React.useState(null)
      const tipRef = React.useRef(null)
      const tipKeyRef = React.useRef(null)
      const pointerRef = React.useRef({ x: 0, y: 0 })

      const value = state.value
      const ready = value !== null && value !== undefined && value.totals !== undefined

      let rangeDays = 0
      for (let index = 0; index < RANGES.length; index += 1) {
        if (RANGES[index].id === range) rangeDays = RANGES[index].days
      }
      const view = ready ? windowView(value, rangeDays) : null
      // 热力图固定 53 列铺满一年。先按最小列间距算出格子能有多大并夹进可读区间，
      // 剩下的宽度再摊进列间距，于是网格正好铺满正文，不溢出也不留空档。
      const heatSpan = Math.max(320, heatWidth) - 2
      const heatCell = Math.max(HEAT_CELL_MIN, Math.min(
        HEAT_CELL_MAX,
        Math.floor((heatSpan - (HEAT_COLUMNS - 1) * HEAT_GAP) / HEAT_COLUMNS),
      ))
      const heatGap = Math.max(2, (heatSpan - HEAT_COLUMNS * heatCell) / (HEAT_COLUMNS - 1))
      const grid = ready ? heatGrid(value.days, HEAT_COLUMNS, heatMode) : null
      const rows = view === null ? null : view.rows
      const series = view === null ? [] : view.models.slice(0, MAX_SERIES).map((model, index) => ({
        id: model.id,
        color: seriesColor(index),
        values: view.rows.map((row) => (row.models === null || row.models === undefined ? 0 : Number(row.models[model.id]) || 0)),
      }))
      const legend = view === null ? [] : modelRows(view.models)

      /** 把提示挪到指针右下角；贴近视口边缘时翻到另一侧。 */
      const placeTip = () => {
        const node = tipRef.current
        if (node === null || node === undefined) return
        const gap = 14
        const box = node.getBoundingClientRect()
        let x = pointerRef.current.x + gap
        let y = pointerRef.current.y + gap
        if (x + box.width > window.innerWidth - 8) x = pointerRef.current.x - box.width - gap
        if (y + box.height > window.innerHeight - 8) y = pointerRef.current.y - box.height - gap
        node.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`
      }

      /**
       * 图表把指针位置报上来。
       * 内容变了才改 state；只是同一天内挪动时只挪提示，不重画面板。
       */
      const handleHover = (payload, event) => {
        if (event !== undefined && event !== null) pointerRef.current = { x: event.clientX, y: event.clientY }
        if (payload === null || payload === undefined) {
          tipKeyRef.current = null
          setTip(null)
          return
        }
        const content = payload.cell !== undefined
          ? heatTip(payload.cell, heatMode)
          : trendTip(payload.row, series)
        if (content.key !== tipKeyRef.current) {
          tipKeyRef.current = content.key
          setTip(content)
        } else {
          placeTip()
        }
      }

      // 内容换过之后，节点要等这一帧渲染完才有尺寸，所以在这里定位。
      React.useEffect(() => {
        if (tip !== null) placeTip()
      })

      const stats = ready
        ? [
          { label: '累计 Token 数', value: formatTokens(value.totals.tokens, true), title: `${formatCount(value.totals.tokens)} Token` },
          { label: '峰值 Token 数', value: value.peak === null ? '—' : formatTokens(value.peak.tokens, true), title: value.peak === null ? '' : formatDayLabel(value.peak.date) },
          {
            label: '最长聊天时长',
            value: value.duration.longestMs > 0 ? formatDuration(value.duration.longestMs) : '—',
            title: '单次连续活动最长的一段：两次活动相隔超过 1 小时即算断开，会话隔天回来接着聊不会累加'
              + (value.duration.sessionId === null || value.duration.sessionId === undefined
                ? ''
                : `；来自 ${value.duration.sessionId}`),
          },
          { label: '当前连续天数', value: `${value.streak.current} 天` },
          { label: '最长连续天数', value: `${value.streak.longest} 天` },
        ]
        : null

      const children = []
      children.push(React.createElement('header', { key: 'head', className: 'dus-head' },
        React.createElement('h2', { className: 'dus-title' }, PANEL_TITLE),
        React.createElement(UsageBadge, { key: 'badge' }, '应用用量'),
      ))

      if (state.error !== null && state.error !== undefined && !ready) {
        children.push(React.createElement('div', { key: 'error', className: 'dus-error' },
          '用量数据暂时不可用：宿主半边未能给出汇总结果。'))
      }

      if (!ready) {
        children.push(React.createElement(UsageSkeleton, { key: 'skeleton' }))
      } else {
        children.push(React.createElement('div', { key: 'stats', className: 'dus-stats' },
          stats.map((stat) => React.createElement(UsageStat, { key: stat.label, ...stat }))))

        children.push(React.createElement(UsageCard, {
          key: 'heat',
          title: 'Token 活动',
          bodyRef: attachHeatBody,
          aside: React.createElement(UsagePills, {
            label: '热力图口径',
            options: HEAT_MODES,
            value: heatMode,
            onPick: setHeatMode,
          }),
        }, React.createElement(UsageHeatmap, { grid, cell: heatCell, gap: heatGap, onHover: handleHover })))

        children.push(React.createElement('div', { key: 'range', className: 'dus-range' },
          React.createElement('span', { className: 'dus-range-label' }, '时间范围'),
          React.createElement(UsagePills, {
            label: '时间范围',
            options: RANGES,
            value: range,
            onPick: setRange,
          })))

        children.push(React.createElement(UsageCard, {
          key: 'trend',
          title: '每日 Token 趋势图',
          bodyRef: attachTrendBody,
        },
          React.createElement('div', { className: 'dus-legend' },
            series.length === 0
              ? React.createElement('span', { className: 'dus-empty' }, '该范围内没有按模型归集的用量')
              : series.map((line) => React.createElement('span', { key: line.id, className: 'dus-legend-item' },
                React.createElement('i', { className: 'dus-dot', style: { background: line.color } }),
                modelLabel(line.id)))),
          React.createElement(UsageTrendChart, {
            rows,
            series,
            width: Math.max(320, trendWidth),
            onHover: handleHover,
          })))

        children.push(React.createElement(UsageCard, { key: 'models', title: '模型用量' },
          React.createElement('div', { className: 'dus-models' },
            React.createElement('div', { className: 'dus-models-chart' },
              React.createElement(UsageDonut, { models: view.models, total: view.totals.tokens })),
            React.createElement(UsageModelList, { rows: legend, total: view.totals.tokens }))))
      }

      if (state.computing) {
        children.push(React.createElement('p', { key: 'computing', className: 'dus-note' }, '正在读取历史会话，数字稍后补齐…'))
      }

      return React.createElement('div', { className: 'dus-root' },
        React.createElement('div', { className: 'dus-scroll' },
          React.createElement('div', { className: 'dus-page' }, children)),
        tip === null ? null : React.createElement(UsageTip, { tip, nodeRef: tipRef }))
    }

/* ---- src/styles.js ---- */
    /**
     * 面板的样式。
     *
     * 颜色全部走 DSH 的主题 token，因此跟随浅色 / 深色自动切换；
     * 只有图表配色是固定的，因为那些颜色承担的是「区分不同模型」的语义。
     * 所有选择器都带 `dus-` 前缀，不会碰到宿主的界面。
     */
    const CSS = `
.dus-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--dsw-alias-bg-base);
    color: var(--dsw-alias-label-primary);
}

.dus-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
}

.dus-page {
    max-width: 1120px;
    margin: 0 auto;
    padding: 30px 32px 56px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

/* 标题行 */
.dus-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 2px;
}

.dus-title {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.2px;
}

.dus-badge {
    font-size: 11px;
    line-height: 18px;
    padding: 0 9px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);
    color: var(--dsw-alias-label-secondary);
}

/* 五个累计数字 */
.dus-stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    border: 1px solid var(--dsw-alias-border-l1);
    border-radius: 12px;
    background: var(--dsw-alias-bg-layer-1);
    overflow: hidden;
}

.dus-stat {
    padding: 18px 20px;
    text-align: center;
    border-left: 1px solid var(--dsw-alias-border-l1);
}

.dus-stat:first-child {
    border-left: none;
}

.dus-stat-value {
    font-size: 21px;
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.dus-stat-label {
    margin-top: 5px;
    font-size: 12px;
    color: var(--dsw-alias-label-secondary);
}

/* 卡片 */
.dus-card {
    border: 1px solid var(--dsw-alias-border-l1);
    border-radius: 12px;
    background: var(--dsw-alias-bg-layer-1);
    overflow: hidden;
}

.dus-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 18px;
    border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.dus-card-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
}

.dus-card-aside {
    display: flex;
    align-items: center;
    gap: 8px;
}

.dus-card-body {
    padding: 16px 18px;
}

/* 分段选择器 */
.dus-pills {
    display: inline-flex;
    padding: 2px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}

.dus-pill {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--dsw-alias-label-secondary);
    font: inherit;
    font-size: 12px;
    line-height: 20px;
    padding: 2px 12px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
}

.dus-pill:hover {
    color: var(--dsw-alias-label-primary);
}

.dus-pill-on,
.dus-pill-on:hover {
    background: var(--dsw-alias-bg-layer-2);
    color: var(--dsw-alias-label-primary);
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
}

/* 热力图 */
.dus-heat-wrap {
    overflow-x: auto;
    overflow-y: hidden;
}

.dus-heat {
    display: block;
}

.dus-heat-cell {
    fill: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);
}

.dus-heat-l1 { fill: color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent); }
.dus-heat-l2 { fill: color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, transparent); }
.dus-heat-l3 { fill: color-mix(in srgb, var(--dsw-alias-brand-primary) 72%, transparent); }
.dus-heat-l4 { fill: var(--dsw-alias-brand-primary); }

.dus-heat-month {
    fill: var(--dsw-alias-label-secondary);
    font-size: 11px;
}

/* 时间范围一行 */
.dus-range {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 2px 4px;
}

.dus-range-label {
    font-size: 12px;
    color: var(--dsw-alias-label-secondary);
}

/* 折线图 */
.dus-trend {
    display: block;
    max-width: 100%;
}

.dus-grid {
    stroke: var(--dsw-alias-border-l1);
    stroke-width: 1;
    shape-rendering: crispEdges;
}

.dus-axis {
    fill: var(--dsw-alias-label-secondary);
    font-size: 11px;
}

.dus-line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
}

.dus-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    margin-bottom: 10px;
}

.dus-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--dsw-alias-label-secondary);
}

.dus-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    flex: none;
}

/* 模型用量 */
.dus-models {
    display: flex;
    align-items: center;
    gap: 28px;
}

.dus-models-chart {
    flex: none;
}

.dus-donut {
    display: block;
}

.dus-arc {
    fill: none;
    stroke-linecap: butt;
}

.dus-donut-track {
    fill: none;
    stroke: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
}

.dus-donut-value {
    fill: var(--dsw-alias-label-primary);
    font-size: 22px;
    font-weight: 600;
}

.dus-donut-unit {
    fill: var(--dsw-alias-label-secondary);
    font-size: 11px;
}

.dus-model-list {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.dus-model-row {
    min-width: 0;
}

.dus-model-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
}

.dus-model-name {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dus-model-share {
    font-size: 12px;
    color: var(--dsw-alias-label-secondary);
    flex: none;
}

.dus-model-tokens {
    margin-top: 3px;
    font-size: 11px;
    color: var(--dsw-alias-label-secondary);
}

.dus-model-bar {
    margin-top: 5px;
    height: 3px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
    overflow: hidden;
}

.dus-model-bar span {
    display: block;
    height: 100%;
    border-radius: 2px;
}

/* 悬浮提示 */
.dus-tip {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 40;
    pointer-events: none;
    min-width: 150px;
    max-width: 260px;
    padding: 9px 12px;
    border: 1px solid var(--dsw-alias-border-l2);
    border-radius: 9px;
    background: var(--dsw-alias-bg-overlay);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
    color: var(--dsw-alias-label-primary);
}

.dus-tip-title {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
}

.dus-tip-sum {
    margin-top: 3px;
    font-size: 12px;
    color: var(--dsw-alias-label-secondary);
    white-space: nowrap;
}

.dus-tip-extra {
    margin-top: 2px;
    font-size: 11px;
    color: var(--dsw-alias-label-secondary);
    white-space: nowrap;
}

.dus-tip-list {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.dus-tip-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
}

.dus-tip-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--dsw-alias-label-secondary);
}

.dus-tip-value {
    flex: none;
    font-variant-numeric: tabular-nums;
}

/* 折线图上的指针位置 */
.dus-crosshair {
    stroke: var(--dsw-alias-border-l2);
    stroke-width: 1;
    stroke-dasharray: 3 3;
}

.dus-point {
    stroke: var(--dsw-alias-bg-layer-1);
    stroke-width: 1.5;
}

/* 状态 */
.dus-empty {
    margin: 0;
    font-size: 12px;
    color: var(--dsw-alias-label-secondary);
}

.dus-note {
    margin: 0;
    font-size: 12px;
    color: var(--dsw-alias-label-secondary);
}

.dus-error {
    border: 1px solid var(--dsw-alias-state-error-primary);
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 12px;
    color: var(--dsw-alias-state-error-primary);
}

.dus-skeleton {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.dus-skeleton-block {
    height: 120px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
    animation: dus-pulse 1.4s ease-in-out infinite;
}

.dus-skeleton-tall {
    height: 96px;
}

@keyframes dus-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
}

@media (prefers-reduced-motion: reduce) {
    .dus-skeleton-block { animation: none; }
}

@media (max-width: 900px) {
    .dus-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dus-stat:nth-child(3) { border-left: none; }
    .dus-models { flex-direction: column; align-items: stretch; }
}
`

/* ---- src/entry.js ---- */
    /**
     * 插件的安装入口。
     *
     * 两件事：
     *   1. 把自己的样式表注入文档；
     *   2. 往两个席位各注册一个条目——`sidebar.panellist` 里的侧栏图标，
     *      以及 `main` 上以同一个 id 为键的主面板。
     *
     * 注册一律走 `slots.inject`：它等的是席位的「声明」，而不是某个具体插件。
     * 侧栏外壳与布局 owner 谁先加载都能装上，宿主换掉它们这个插件也照旧。
     */
    function apply(ctx) {
      // 样式表先注入。注册失败时留一份没用的样式表，代价远小于反过来。
      const previous = document.getElementById(STYLE_ID)
      if (previous !== null && previous.parentElement !== null) previous.parentElement.removeChild(previous)
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.dataset.usageStats = 'style'
      style.textContent = CSS
      document.head.appendChild(style)

      ctx.effect(() => () => {
        const el = document.getElementById(STYLE_ID)
        if (el !== null) el.remove()
        // 停掉轮询再丢掉引用：否则插件被停用后，上一代的定时器还在跑。
        if (usageStore !== null) usageStore.stop()
        usageStore = null
      }, 'dsh-usage-stats: 样式表')

      if (typeof ctx.inject !== 'function') return
      ctx.inject(['slots'], (scope) => {
        const slots = scope.get('slots')
        if (slots === undefined || slots === null || typeof slots.inject !== 'function') return

        // 侧栏条目：列表席位按 id 认条目，`label` 同时是可见文字、无障碍名称与收起时的提示。
        scope.effect(() => slots.inject(PANEL_SLOT, () => slots.register({
          name: PANEL_SLOT,
          id: PANEL_ID,
          order: PANEL_ORDER,
          label: PANEL_TITLE,
        }, UsageIcon)), 'dsh-usage-stats: 侧栏条目')

        // 主面板：键控席位按 key 分派，key 与侧栏条目的 id 相同，点条目即切到这个面板。
        scope.effect(() => slots.inject(MAIN_SLOT, () => slots.register({
          name: MAIN_SLOT,
          key: PANEL_ID,
        }, UsagePanel)), 'dsh-usage-stats: 主面板')
      })
    }

    exports.apply = apply
    return module.exports
  },
})
