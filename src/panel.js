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
