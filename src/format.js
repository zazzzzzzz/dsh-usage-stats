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
