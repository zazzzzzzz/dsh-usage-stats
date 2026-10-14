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
