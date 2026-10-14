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
