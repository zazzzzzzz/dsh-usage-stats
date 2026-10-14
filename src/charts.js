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
