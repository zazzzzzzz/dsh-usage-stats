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
