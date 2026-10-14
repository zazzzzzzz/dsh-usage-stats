/**
 * 客户端半边的拼装脚本。
 *
 * 为什么不用打包器：DSH 的浏览器模块加载器没有相对 require，也没有资源 URL，
 * 插件 bundle 必须是一个自包含的脚本——外层调用 `window.__ModuleLoader__.load()`
 * 注册 factory，`react` 由加载器的模块图解析。这里就把 src/ 下的片段按固定顺序
 * 原样拼接进那层外壳，产物是唯一可执行文件 lib/client.js，不引入任何依赖。
 *
 * 片段共享同一个作用域：它们之间不用 import/export，靠拼装顺序决定声明先后。
 *
 * 用法：
 *   node scripts/build.mjs           拼装并写出 lib/client.js
 *   node scripts/build.mjs --check   只做校验，不写文件
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

/** 插件包名，同时是浏览器模块加载器里的 id。 */
const PACKAGE_NAME = 'dsh-usage-stats'

/** 拼装顺序即声明顺序，构建脚本拒绝清单之外的源文件。 */
const FRAGMENTS = [
  'src/constants.js',
  'src/format.js',
  'src/store.js',
  'src/icon.js',
  'src/charts.js',
  'src/panel.js',
  'src/styles.js',
  'src/entry.js',
]

/** 入口必须导出的函数名：加载器调用它安装这个插件。 */
const ENTRY_EXPORT = 'apply'

const failures = []

function fail(message) {
  failures.push(message)
}

function readFragment(relative) {
  const path = join(root, relative)
  if (!existsSync(path)) {
    fail(`缺少源文件 ${relative}`)
    return ''
  }
  return readFileSync(path, 'utf8')
}

/**
 * 片段共享一个作用域，模块级的 import/export 会让拼装结果语法错误或语义错位，
 * 所以在拼装前直接拒绝。
 */
function checkFragment(relative, source) {
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\s*(import|export)\s/.test(line)) {
      fail(`${relative}:${index + 1} 片段不能使用 import/export: ${line.trim()}`)
    }
    if (line.includes('%%') && /%%[A-Z_]+%%/.test(line)) {
      fail(`${relative}:${index + 1} 存在未替换的占位符: ${line.trim()}`)
    }
  }
}

const sources = FRAGMENTS.map((relative) => {
  const source = readFragment(relative)
  if (source !== '') checkFragment(relative, source)
  return { relative, source }
})

const banner = `/**
 * dsh-usage-stats —— 左侧栏「使用统计」面板的客户端半边。
 *
 * 生成文件，请勿手工修改。源码在 src/ 下，由 node scripts/build.mjs 拼装。
 *
 * 片段拼装顺序：
${FRAGMENTS.map((relative) => ` *   - ${relative}`).join('\n')}
 */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_NAME)},
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    // React 从模块加载器的模块图里取，这样界面组件不需要宿主半边。
    var React = require('react')

`

const footer = `
    exports.${ENTRY_EXPORT} = ${ENTRY_EXPORT}
    return module.exports
  },
})
`

const body = sources.map(({ relative, source }) => `\n/* ---- ${relative} ---- */\n${source.trimEnd()}\n`).join('')
const output = banner + body + footer

if (!new RegExp(`^\\s*function\\s+${ENTRY_EXPORT}\\s*\\(`, 'm').test(output)) {
  fail(`拼装结果里找不到 ${ENTRY_EXPORT}(ctx)，加载器将无法安装本插件`)
}

const checkOnly = process.argv.includes('--check')

if (failures.length > 0) {
  console.error('构建失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

if (checkOnly) {
  console.log(`校验通过：${FRAGMENTS.length} 个片段，${output.length} 字节`)
} else {
  const target = join(root, 'lib', 'client.js')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, output, 'utf8')
  console.log(`已写出 lib/client.js：${FRAGMENTS.length} 个片段，${output.length} 字节`)
}
