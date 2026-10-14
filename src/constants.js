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
