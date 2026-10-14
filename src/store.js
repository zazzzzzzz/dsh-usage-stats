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
