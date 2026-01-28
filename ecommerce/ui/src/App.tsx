import { useState, useEffect, useCallback, CSSProperties } from 'react'
import './App.css'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApiResult {
  result?: unknown
  error?: string
  module?: string
  func?: string
  elapsed_ms?: number
}

interface HealthResponse {
  status: string
  modules_count: number
  exports_count: number
}

interface ModuleExport {
  name: string
  type: string
  pure: boolean
  arity: number
}

interface ModuleInfo {
  path: string
  exports: ModuleExport[]
}

// ─── API Helper ─────────────────────────────────────────────────────────────

function ensureFloat(val: number): number {
  if (Number.isInteger(val)) return val + 0.0001
  return val
}

async function callEndpoint(module: string, func: string, args: unknown[]): Promise<ApiResult> {
  const res = await fetch(`/api/${module}/${func}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  return res.json()
}

// ─── Brand ──────────────────────────────────────────────────────────────────

const BRAND = {
  primary: '#e73c17',
  primaryLight: '#f25d3b',
  primaryDark: '#c43010',
  primaryFaded: 'rgba(231, 60, 23, 0.08)',
  primaryFadedMore: 'rgba(231, 60, 23, 0.15)',
  secondary: '#314352',
  secondaryLight: '#3d5468',
  purple: '#6b46c1',
  purpleFaded: 'rgba(107,70,193,0.08)',
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const SIDEBAR_W = 240

const s = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  } as CSSProperties,

  header: {
    background: 'linear-gradient(135deg, #314352 0%, #1a202c 100%)',
    padding: '14px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `3px solid ${BRAND.primary}`,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  } as CSSProperties,

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  } as CSSProperties,

  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as CSSProperties,

  logoImg: { height: 32, width: 'auto' } as CSSProperties,

  logoText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: -0.5,
  } as CSSProperties,

  logoSub: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  } as CSSProperties,

  healthBadge: (ok: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    background: ok ? 'rgba(5, 150, 105, 0.15)' : 'rgba(220, 38, 38, 0.15)',
    color: ok ? '#34d399' : '#f87171',
    border: `1px solid ${ok ? 'rgba(5,150,105,0.3)' : 'rgba(220,38,38,0.3)'}`,
  }) as CSSProperties,

  dot: (ok: boolean) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: ok ? '#34d399' : '#f87171',
    animation: ok ? 'none' : 'pulse 1.5s infinite',
  }) as CSSProperties,

  // Body = sidebar + content
  body: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  } as CSSProperties,

  // Sidebar
  sidebar: {
    width: SIDEBAR_W,
    minWidth: SIDEBAR_W,
    background: '#1e293b',
    color: '#cbd5e1',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #334155',
    overflowY: 'auto',
  } as CSSProperties,

  sideSection: {
    padding: '16px 16px 12px',
    borderBottom: '1px solid #334155',
  } as CSSProperties,

  sideSectionLast: {
    padding: '16px 16px 12px',
  } as CSSProperties,

  sideLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: '#64748b',
    marginBottom: 8,
  } as CSSProperties,

  sideStatRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    fontSize: 12,
  } as CSSProperties,

  sideStatVal: {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    fontSize: 14,
  } as CSSProperties,

  sideNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  } as CSSProperties,

  sideNavBtn: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.15s ease',
    background: active ? BRAND.primary : 'transparent',
    color: active ? 'white' : '#94a3b8',
  }) as CSSProperties,

  sideModule: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: '#64748b',
    marginBottom: 3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,

  // Main content
  main: {
    flex: 1,
    padding: '24px 28px 60px',
    overflowY: 'auto',
    background: '#f6f8fa',
    minHeight: 0,
  } as CSSProperties,

  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 20,
  } as CSSProperties,

  card: (delay: number) => ({
    background: 'white',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    padding: 24,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)',
    animation: 'fadeInUp 0.4s ease both',
    animationDelay: `${delay * 80}ms`,
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
  }) as CSSProperties,

  cardTitle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  } as CSSProperties,

  funcName: {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    fontSize: 15,
    color: '#314352',
  } as CSSProperties,

  badge: (color: string, bg: string) => ({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    padding: '3px 8px',
    borderRadius: 4,
    color,
    background: bg,
  }) as CSSProperties,

  typeSig: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 16,
    lineHeight: 1.5,
  } as CSSProperties,

  modulePath: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: '#94a3b8',
    marginBottom: 16,
    letterSpacing: 0.3,
  } as CSSProperties,

  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    marginBottom: 16,
  } as CSSProperties,

  fieldRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  } as CSSProperties,

  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  } as CSSProperties,

  input: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1.5px solid #e2e8f0',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    background: '#f8fafc',
    color: '#1a202c',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  } as CSSProperties,

  textarea: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1.5px solid #e2e8f0',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    background: '#f8fafc',
    color: '#1a202c',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: 60,
    transition: 'border-color 0.2s, box-shadow 0.2s',
  } as CSSProperties,

  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1.5px solid #e2e8f0',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    background: '#f8fafc',
    color: '#1a202c',
    outline: 'none',
    cursor: 'pointer',
  } as CSSProperties,

  btnRun: (loading: boolean) => ({
    padding: '8px 20px',
    borderRadius: 8,
    border: 'none',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    cursor: loading ? 'wait' : 'pointer',
    transition: 'all 0.2s ease',
    background: loading ? '#94a3b8' : `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.primaryLight})`,
    color: 'white',
    boxShadow: loading ? 'none' : `0 2px 8px ${BRAND.primaryFadedMore}`,
  }) as CSSProperties,

  btnSecondary: (loading: boolean) => ({
    padding: '8px 20px',
    borderRadius: 8,
    border: 'none',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    cursor: loading ? 'wait' : 'pointer',
    transition: 'all 0.2s ease',
    background: loading ? '#94a3b8' : `linear-gradient(135deg, ${BRAND.secondary}, ${BRAND.secondaryLight})`,
    color: 'white',
    boxShadow: loading ? 'none' : '0 2px 8px rgba(49,67,82,0.2)',
  }) as CSSProperties,

  btnAI: (loading: boolean) => ({
    padding: '8px 20px',
    borderRadius: 8,
    border: 'none',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    cursor: loading ? 'wait' : 'pointer',
    transition: 'all 0.2s ease',
    background: loading ? '#94a3b8' : 'linear-gradient(135deg, #6b46c1, #805ad5)',
    color: 'white',
    boxShadow: loading ? 'none' : '0 2px 8px rgba(107,70,193,0.3)',
  }) as CSSProperties,

  resultBox: {
    marginTop: 12,
    animation: 'slideDown 0.3s ease both',
  } as CSSProperties,

  resultHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  } as CSSProperties,

  timingBadge: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    color: BRAND.primary,
    background: BRAND.primaryFaded,
    padding: '2px 8px',
    borderRadius: 4,
  } as CSSProperties,

  resultValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    fontWeight: 600,
    color: '#059669',
    background: '#ecfdf5',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid rgba(5,150,105,0.15)',
    wordBreak: 'break-all' as const,
  } as CSSProperties,

  resultError: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    color: '#dc2626',
    background: '#fef2f2',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid rgba(220,38,38,0.15)',
    wordBreak: 'break-all' as const,
  } as CSSProperties,

  codeBlock: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    lineHeight: 1.7,
    color: '#e2e8f0',
    background: '#0f172a',
    padding: '16px 20px',
    borderRadius: 10,
    overflowX: 'auto' as const,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    border: '1px solid #1e293b',
  } as CSSProperties,

  aiBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '16px 20px',
    background: '#fffbeb',
    border: '1px solid rgba(217,119,6,0.2)',
    borderRadius: 10,
    marginBottom: 20,
    animation: 'fadeInUp 0.4s ease both',
  } as CSSProperties,

  aiBannerIcon: { fontSize: 20, lineHeight: 1, flexShrink: 0 } as CSSProperties,

  aiBannerText: { fontSize: 13, color: '#92400e', lineHeight: 1.5 } as CSSProperties,

  sectionIntro: {
    marginBottom: 24,
    animation: 'fadeInUp 0.3s ease both',
  } as CSSProperties,

  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#314352',
    marginBottom: 4,
    letterSpacing: -0.3,
  } as CSSProperties,

  sectionDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 1.6,
  } as CSSProperties,

  footer: {
    padding: '12px 24px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: "'JetBrains Mono', monospace",
  } as CSSProperties,

  footerLink: {
    color: BRAND.primary,
    textDecoration: 'none',
    fontWeight: 600,
  } as CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
  } as CSSProperties,

  th: {
    padding: '8px 12px',
    textAlign: 'left' as const,
    background: '#f1f5f9',
    color: '#314352',
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    borderBottom: '2px solid #e2e8f0',
  } as CSSProperties,

  td: {
    padding: '6px 12px',
    borderBottom: '1px solid #f1f5f9',
    color: '#334155',
  } as CSSProperties,
}

// ─── Chart type per query ───────────────────────────────────────────────────

type ChartType = 'bar' | 'funnel' | 'kpi' | 'pie' | 'none'

interface QueryDef {
  name: string
  func: string
  chart: ChartType
  args: { name: string; type: 'int' | 'string'; default: string }[]
}

const GA4_QUERIES: QueryDef[] = [
  { name: 'Top Events', func: 'topEventsQuery', chart: 'bar', args: [{ name: 'limit', type: 'int', default: '10' }] },
  { name: 'Top Products by Revenue', func: 'topProductsByRevenueQuery', chart: 'bar', args: [{ name: 'limit', type: 'int', default: '10' }] },
  { name: 'Revenue by Category', func: 'revenueByCategoryQuery', chart: 'bar', args: [] },
  { name: 'Purchase Funnel', func: 'purchaseFunnelQuery', chart: 'funnel', args: [] },
  { name: 'Device Breakdown', func: 'deviceBreakdownQuery', chart: 'pie', args: [] },
  { name: 'Geo Distribution', func: 'geoDistributionQuery', chart: 'bar', args: [{ name: 'limit', type: 'int', default: '10' }] },
  { name: 'Session Metrics', func: 'sessionMetricsQuery', chart: 'kpi', args: [] },
  { name: 'Browser Breakdown', func: 'browserBreakdownQuery', chart: 'pie', args: [] },
  { name: 'Event Trend', func: 'eventTrendQuery', chart: 'bar', args: [{ name: 'eventName', type: 'string', default: 'page_view' }] },
  { name: 'Event Counts by Date', func: 'eventCountsByDateQuery', chart: 'bar', args: [{ name: 'startDate', type: 'string', default: '20210101' }, { name: 'endDate', type: 'string', default: '20211231' }] },
  { name: 'Daily Summary', func: 'dailySummaryQuery', chart: 'bar', args: [{ name: 'startDate', type: 'string', default: '20210101' }, { name: 'endDate', type: 'string', default: '20211231' }] },
  { name: 'Top Categories by Views', func: 'topCategoriesByViewsQuery', chart: 'bar', args: [{ name: 'limit', type: 'int', default: '10' }] },
]

// ─── AI Function Config ─────────────────────────────────────────────────────

interface AIFuncDef {
  name: string
  func: string
  description: string
  args: { name: string; placeholder: string; multiline?: boolean }[]
}

const AI_FUNCTIONS: AIFuncDef[] = [
  {
    name: 'Product Recommendations',
    func: 'getProductRecommendations',
    description: 'AI-powered product suggestions based on context',
    args: [
      { name: 'productName', placeholder: 'Laptop Pro' },
      { name: 'category', placeholder: 'Electronics' },
      { name: 'userPreferences', placeholder: 'portable, high performance' },
    ],
  },
  {
    name: 'Product Description',
    func: 'generateProductDescription',
    description: 'Generate compelling product copy',
    args: [
      { name: 'productName', placeholder: 'Ultra-Comfort Running Shoes' },
      { name: 'features', placeholder: 'breathable mesh, gel cushioning, arch support' },
    ],
  },
  {
    name: 'Review Analysis',
    func: 'analyzeReview',
    description: 'Sentiment analysis on customer reviews',
    args: [
      { name: 'reviewText', placeholder: 'Great product, fast shipping, but packaging was damaged...', multiline: true },
    ],
  },
  {
    name: 'Price Suggestion',
    func: 'suggestPricing',
    description: 'AI-driven competitive pricing strategy',
    args: [
      { name: 'productName', placeholder: 'Wireless Earbuds' },
      { name: 'category', placeholder: 'Audio' },
      { name: 'competitorPrices', placeholder: '$79, $99, $149' },
    ],
  },
]

// ─── Chart Components ───────────────────────────────────────────────────────

interface ParsedData {
  headers: string[]
  rows: string[][]
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(1)
}

const CHART_COLORS = [
  BRAND.primary, '#f59e0b', '#10b981', '#6366f1', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#ef4444', '#06b6d4',
  '#84cc16', '#a855f7', '#22d3ee', '#fb923c', '#4ade80',
]

function HBarChart({ data, labelCol, valueCol, title }: {
  data: ParsedData; labelCol: number; valueCol: number; title?: string
}) {
  const values = data.rows.map(r => parseFloat(r[valueCol]) || 0)
  const maxVal = Math.max(...values, 1)
  const labels = data.rows.map(r => r[labelCol])

  return (
    <div style={{ marginTop: 16, animation: 'fadeInUp 0.4s ease both' }}>
      {title && <div style={{ ...s.label, marginBottom: 10 }}>{title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {labels.slice(0, 15).map((label, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 130, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: '#64748b', textAlign: 'right', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
            }} title={label}>{label}</div>
            <div style={{ flex: 1, height: 22, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${(values[i] / maxVal) * 100}%`, height: '100%',
                background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}, ${CHART_COLORS[i % CHART_COLORS.length]}cc)`,
                borderRadius: 4, transition: 'width 0.6s ease',
                minWidth: values[i] > 0 ? 2 : 0,
              }} />
            </div>
            <div style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: '#314352', fontWeight: 600, minWidth: 60, textAlign: 'right',
            }}>{formatNumber(values[i])}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FunnelChart({ data }: { data: ParsedData }) {
  // Purchase funnel: single row with views → carts → checkouts → purchases
  if (data.rows.length === 0) return null
  const row = data.rows[0]
  const headers = data.headers.length > 0 ? data.headers : ['views', 'carts', 'checkouts', 'purchases']
  const values = row.map(v => parseFloat(v) || 0)
  const maxVal = Math.max(...values, 1)
  const funnelColors = ['#6366f1', '#8b5cf6', '#f59e0b', BRAND.primary]

  return (
    <div style={{ marginTop: 16, animation: 'fadeInUp 0.4s ease both' }}>
      <div style={{ ...s.label, marginBottom: 12 }}>Purchase Funnel</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        {values.map((val, i) => {
          const widthPct = Math.max((val / maxVal) * 100, 8)
          return (
            <div key={i} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: `${widthPct}%`, padding: '10px 16px', borderRadius: 8,
                background: funnelColors[i % funnelColors.length],
                color: 'white', textAlign: 'center', transition: 'width 0.6s ease',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
              }}>
                {formatNumber(val)}
              </div>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: 1,
                textTransform: 'uppercase', color: '#64748b', marginTop: 4,
              }}>{headers[i]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PieChart({ data, labelCol, valueCol }: {
  data: ParsedData; labelCol: number; valueCol: number
}) {
  const values = data.rows.map(r => parseFloat(r[valueCol]) || 0)
  const labels = data.rows.map(r => r[labelCol])
  const total = values.reduce((a, b) => a + b, 0) || 1

  // Build conic gradient segments
  let acc = 0
  const segments = values.map((val, i) => {
    const start = acc
    acc += (val / total) * 360
    return { start, end: acc, color: CHART_COLORS[i % CHART_COLORS.length], label: labels[i], val, pct: (val / total) * 100 }
  })

  const conicGrad = segments.map(seg => `${seg.color} ${seg.start}deg ${seg.end}deg`).join(', ')

  return (
    <div style={{ marginTop: 16, animation: 'fadeInUp 0.4s ease both' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          width: 140, height: 140, borderRadius: '50%',
          background: `conic-gradient(${conicGrad})`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)', flexShrink: 0,
        }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {segments.slice(0, 8).map((seg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <div style={{
                width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0,
              }} />
              <span style={{ color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
                {seg.label}
              </span>
              <span style={{ color: '#314352', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatNumber(seg.val)} ({seg.pct.toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KPICards({ data }: { data: ParsedData }) {
  if (data.rows.length === 0) return null
  const row = data.rows[0]
  const headers = data.headers.length > 0 ? data.headers : row.map((_, i) => `Metric ${i + 1}`)

  return (
    <div style={{ marginTop: 16, animation: 'fadeInUp 0.4s ease both' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(row.length, 4)}, 1fr)`, gap: 12 }}>
        {row.map((val, i) => (
          <div key={i} style={{
            background: 'white', borderRadius: 10, padding: '16px 20px',
            border: '1px solid #e2e8f0', textAlign: 'center',
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 800,
              color: CHART_COLORS[i % CHART_COLORS.length],
            }}>{formatNumber(parseFloat(val) || 0)}</div>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
              color: '#94a3b8', marginTop: 4,
            }}>{headers[i]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SmartChart({ data, chartType }: { data: ParsedData; chartType: ChartType }) {
  if (chartType === 'none' || data.rows.length === 0) return null

  if (chartType === 'funnel') return <FunnelChart data={data} />
  if (chartType === 'kpi') return <KPICards data={data} />

  // Find label (string) and value (numeric) columns
  // Date-like values (20210115) should be treated as labels, not numbers
  const isDateLike = (v: string) => /^20\d{6}$/.test(v)
  const isTrulyNumeric = (col: number) =>
    data.rows.every(r => !isNaN(parseFloat(r[col])) && r[col] !== '' && !isDateLike(r[col]))

  // Find first truly numeric column, preferring cols > 0
  let valueCol = data.rows[0]?.findIndex((_v, i) => i > 0 && isTrulyNumeric(i)) ?? -1
  if (valueCol < 0 && data.rows[0] && isTrulyNumeric(0)) valueCol = 0

  // Label column: use col 0 if valueCol > 0, otherwise col 1
  let labelCol = valueCol > 0 ? 0 : (data.rows[0]?.length > 1 ? 1 : -1)
  if (valueCol === 0 && data.rows[0]?.length > 1) labelCol = 1

  if (labelCol < 0 || valueCol < 0 || labelCol === valueCol) return null

  if (chartType === 'pie') {
    return <PieChart data={data} labelCol={labelCol} valueCol={valueCol} />
  }

  // Default: bar chart
  const title = data.headers.length > 0 && data.headers[labelCol] && data.headers[valueCol]
    ? `${data.headers[labelCol]} vs ${data.headers[valueCol]}`
    : undefined
  return <HBarChart data={data} labelCol={labelCol} valueCol={valueCol} title={title} />
}

// ─── Components ─────────────────────────────────────────────────────────────

function ContractCard({ name, module, sig, fields, delay }: {
  name: string; module: string; sig: string
  fields: { name: string; type: 'float' | 'int'; default: string }[]
  delay: number
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.name, f.default]))
  )
  const [result, setResult] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true); setResult(null)
    try {
      const args = fields.map(f => {
        const v = parseFloat(values[f.name])
        return f.type === 'float' ? ensureFloat(v) : Math.floor(v)
      })
      setResult(await callEndpoint(module, name, args))
    } catch { setResult({ error: 'Network error' }) }
    setLoading(false)
  }

  return (
    <div style={s.card(delay)} onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.borderColor = BRAND.primary
      ;(e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px ${BRAND.primaryFaded}`
    }} onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'
      ;(e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)'
    }}>
      <div style={s.cardTitle}>
        <span style={s.funcName}>{name}</span>
        <span style={s.badge(BRAND.primary, BRAND.primaryFaded)}>pure</span>
      </div>
      <div style={s.typeSig}>{sig}</div>
      <div style={s.modulePath}>POST /api/{module}/{name}</div>
      <div style={s.fieldGroup}>
        {fields.map(f => (
          <div key={f.name} style={s.fieldRow}>
            <span style={{ ...s.label, minWidth: 80 }}>{f.name}</span>
            <input style={s.input} type="number" step={f.type === 'float' ? '0.01' : '1'}
              value={values[f.name]}
              onChange={e => setValues({ ...values, [f.name]: e.target.value })}
              onFocus={e => { e.target.style.borderColor = BRAND.primary; e.target.style.boxShadow = `0 0 0 3px ${BRAND.primaryFaded}` }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
              onKeyDown={e => e.key === 'Enter' && run()}
            />
          </div>
        ))}
      </div>
      <button style={s.btnRun(loading)} onClick={run} disabled={loading}>
        {loading ? '...' : 'Run'}
      </button>
      {result && (
        <div style={s.resultBox}>
          <div style={s.resultHeader}>
            <span style={s.label}>{result.error ? 'Error' : 'Result'}</span>
            {result.elapsed_ms !== undefined && <span style={s.timingBadge}>{result.elapsed_ms}ms</span>}
          </div>
          {result.error
            ? <div style={s.resultError}>{result.error}</div>
            : <div style={s.resultValue}>{JSON.stringify(result.result)}</div>}
        </div>
      )}
    </div>
  )
}

interface ParsedQueryResult { headers: string[]; rows: string[][] }

function parseQueryResult(raw: unknown): ParsedQueryResult | null {
  let obj: any = raw

  // Unwrap AILANG Result type: {__tag: "Ok", fields: [...]}
  if (typeof obj === 'object' && obj !== null && obj.__tag === 'Ok' && Array.isArray(obj.fields)) {
    obj = obj.fields[0]
  }

  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj)
    } catch { return null }
  }

  if (typeof obj === 'object' && obj !== null && Array.isArray(obj.rows)) {
    let headers = (obj.headers || obj.schema || []) as string[]
    const rows = obj.rows as string[][]

    // If schema is empty but we have rows, infer headers from first row
    if (headers.length === 0 && rows.length > 0) {
      headers = rows[0].map((_v, i) => `col_${i}`)
    }

    return { headers, rows }
  }

  return null
}

function AnalyticsSection({ bqAvailable }: { bqAvailable: boolean }) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [argValues, setArgValues] = useState<Record<string, string>>({})
  const [sqlResult, setSqlResult] = useState<ApiResult | null>(null)
  const [bqResult, setBqResult] = useState<ApiResult | null>(null)
  const [loadingSQL, setLoadingSQL] = useState(false)
  const [loadingBQ, setLoadingBQ] = useState(false)
  const [copied, setCopied] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [projectDetected, setProjectDetected] = useState(false)

  const query = GA4_QUERIES[selectedIdx]

  useEffect(() => {
    if (bqAvailable && !projectId) {
      callEndpoint('ecommerce/services/gcp_auth', 'getDefaultProject', [null])
        .then(res => {
          if (res.result && typeof res.result === 'string') {
            const match = String(res.result).match(/Ok\("(.+?)"\)/) || String(res.result).match(/^"?([^"]+)"?$/)
            if (match) { setProjectId(match[1]); setProjectDetected(true) }
          }
        })
        .catch(() => {})
    }
  }, [bqAvailable])

  useEffect(() => {
    const defaults: Record<string, string> = {}
    query.args.forEach(a => { defaults[a.name] = a.default })
    setArgValues(defaults)
    setSqlResult(null)
    setBqResult(null)
  }, [selectedIdx])

  const generateSQL = async () => {
    setLoadingSQL(true); setSqlResult(null); setBqResult(null)
    try {
      const args = query.args.length === 0
        ? [null]
        : query.args.map(a => a.type === 'int' ? parseInt(argValues[a.name]) : argValues[a.name])
      setSqlResult(await callEndpoint('ecommerce/services/ga4_queries', query.func, args))
    } catch { setSqlResult({ error: 'Network error' }) }
    setLoadingSQL(false)
  }

  const runOnBigQuery = async () => {
    if (!sqlResult?.result) return
    if (!projectId.trim()) {
      setBqResult({ error: 'Please enter a GCP Project ID above before running queries.' })
      return
    }
    setLoadingBQ(true); setBqResult(null)
    try {
      setBqResult(await callEndpoint('ecommerce/services/bigquery', 'queryWithAuth', [projectId.trim(), String(sqlResult.result)]))
    } catch { setBqResult({ error: 'Network error' }) }
    setLoadingBQ(false)
  }

  const copySQL = () => {
    if (sqlResult?.result) {
      navigator.clipboard.writeText(String(sqlResult.result))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  const sql = sqlResult?.result ? String(sqlResult.result) : null
  const bqData = bqResult?.result ? parseQueryResult(bqResult.result) : null
  const bqError = bqResult?.error || null
  const isEffectError = bqError && (
    bqError.includes('effect context') || bqError.includes('capability') || bqError.includes('not available')
  )

  return (
    <>
      <div style={s.sectionIntro}>
        <h2 style={s.sectionTitle}>GA4 Analytics Queries</h2>
        <p style={s.sectionDesc}>
          Pure SQL builder functions for the public GA4 ecommerce dataset.
          {bqAvailable ? ' Generate SQL, then run it live against BigQuery.' : ' Generate SQL and copy it to BigQuery Console.'}
        </p>
      </div>

      <div style={{ ...s.card(0), maxWidth: 960 }}>
        <div style={s.cardTitle}>
          <span style={s.funcName}>{query.func}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={s.badge(BRAND.purple, BRAND.purpleFaded)}>sql</span>
            {query.chart !== 'none' && <span style={s.badge('#059669', 'rgba(5,150,105,0.08)')}>{query.chart}</span>}
          </div>
        </div>
        <div style={s.modulePath}>POST /api/ecommerce/services/ga4_queries/{query.func}</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ ...s.label, marginBottom: 6 }}>
            GCP Project ID {projectDetected && <span style={{ color: '#059669', fontWeight: 400, textTransform: 'none' }}>(auto-detected)</span>}
          </div>
          <input style={s.input} type="text" placeholder="my-gcp-project" value={projectId}
            onChange={e => { setProjectId(e.target.value); setProjectDetected(false) }}
            onFocus={e => { e.target.style.borderColor = BRAND.purple; e.target.style.boxShadow = '0 0 0 3px rgba(107,70,193,0.1)' }}
            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ ...s.label, marginBottom: 6 }}>Query</div>
          <select style={s.select} value={selectedIdx} onChange={e => setSelectedIdx(parseInt(e.target.value))}>
            {GA4_QUERIES.map((q, i) => <option key={q.func} value={i}>{q.name}</option>)}
          </select>
        </div>

        {query.args.length > 0 && (
          <div style={s.fieldGroup}>
            {query.args.map(a => (
              <div key={a.name} style={s.fieldRow}>
                <span style={{ ...s.label, minWidth: 80 }}>{a.name}</span>
                <input style={s.input} type={a.type === 'int' ? 'number' : 'text'}
                  value={argValues[a.name] || ''}
                  onChange={e => setArgValues({ ...argValues, [a.name]: e.target.value })}
                  onFocus={e => { e.target.style.borderColor = BRAND.purple; e.target.style.boxShadow = '0 0 0 3px rgba(107,70,193,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
                  onKeyDown={e => e.key === 'Enter' && generateSQL()}
                />
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={s.btnRun(loadingSQL)} onClick={generateSQL} disabled={loadingSQL}>
            {loadingSQL ? '...' : '1. Generate SQL'}
          </button>
          {sql && (
            <>
              <button style={s.btnSecondary(loadingBQ)} onClick={runOnBigQuery} disabled={loadingBQ}>
                {loadingBQ ? 'Querying...' : '2. Run on BigQuery'}
              </button>
              <button style={{
                padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: copied ? '#ecfdf5' : 'white', color: copied ? '#059669' : '#64748b',
                transition: 'all 0.2s',
              }} onClick={copySQL}>{copied ? 'Copied!' : 'Copy SQL'}</button>
            </>
          )}
        </div>

        {/* Chart - show first if we have BigQuery data */}
        {bqData && query.chart !== 'none' && (
          <div style={{ ...s.resultBox, marginTop: 16 }}>
            <div style={s.resultHeader}>
              <span style={s.label}>Visualization</span>
              {bqResult?.elapsed_ms !== undefined && <span style={s.timingBadge}>{bqResult.elapsed_ms}ms</span>}
            </div>
            <SmartChart data={bqData} chartType={query.chart} />
          </div>
        )}

        {sqlResult && (
          <div style={s.resultBox}>
            <div style={s.resultHeader}>
              <span style={s.label}>{sqlResult.error ? 'Error' : 'Generated SQL'}</span>
              {sqlResult.elapsed_ms !== undefined && <span style={s.timingBadge}>{sqlResult.elapsed_ms}ms</span>}
            </div>
            {sqlResult.error
              ? <div style={s.resultError}>{sqlResult.error}</div>
              : <pre style={s.codeBlock}>{formatSQL(String(sqlResult.result))}</pre>}
          </div>
        )}

        {bqResult && (
          <div style={{ ...s.resultBox, marginTop: 16 }}>
            <div style={s.resultHeader}>
              <span style={s.label}>{bqError ? 'BigQuery Error' : 'BigQuery Results'}</span>
              {bqResult.elapsed_ms !== undefined && <span style={s.timingBadge}>{bqResult.elapsed_ms}ms</span>}
            </div>
            {bqError ? (
              isEffectError ? (
                <div style={{ ...s.aiBanner, background: '#fef2f2', borderColor: 'rgba(220,38,38,0.15)', marginBottom: 0 }}>
                  <span style={s.aiBannerIcon}>!</span>
                  <div style={{ ...s.aiBannerText, color: '#991b1b' }}>
                    <strong>Missing capabilities.</strong> Start the server with <code style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                      background: 'rgba(0,0,0,0.04)', padding: '1px 5px', borderRadius: 3,
                    }}>--caps IO,AI,FS,Net</code> to enable BigQuery queries.
                    <br /><br />
                    <strong>Alternatively:</strong> Copy the SQL above and run it in{' '}
                    <a href="https://console.cloud.google.com/bigquery" target="_blank" rel="noopener"
                      style={{ color: '#dc2626', fontWeight: 600 }}>BigQuery Console</a>.
                  </div>
                </div>
              ) : <div style={s.resultError}>{bqError}</div>
            ) : bqData ? (
              <>
                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <table style={s.table}>
                    {bqData.headers.length > 0 && (
                      <thead><tr>{bqData.headers.map((h, i) => <th key={i} style={s.th}>{h}</th>)}</tr></thead>
                    )}
                    <tbody>
                      {bqData.rows.slice(0, 20).map((row, ri) => (
                        <tr key={ri} style={{ background: ri % 2 === 0 ? 'white' : '#fafbfc' }}>
                          {row.map((cell, ci) => <td key={ci} style={s.td}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {bqData.rows.length > 20 && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, fontStyle: 'italic' }}>
                    Showing 20 of {bqData.rows.length} rows
                  </div>
                )}
              </>
            ) : (
              <pre style={{ ...s.codeBlock, whiteSpace: 'pre-wrap' }}>
                {typeof bqResult.result === 'string' ? bqResult.result : JSON.stringify(bqResult.result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function formatSQL(sql: string): string {
  return sql
    .replace(/\bSELECT\b/gi, '\nSELECT')
    .replace(/\bFROM\b/gi, '\nFROM')
    .replace(/\bWHERE\b/gi, '\nWHERE')
    .replace(/\bGROUP BY\b/gi, '\nGROUP BY')
    .replace(/\bORDER BY\b/gi, '\nORDER BY')
    .replace(/\bLIMIT\b/gi, '\nLIMIT')
    .replace(/\bAND\b/gi, '\n  AND')
    .replace(/\bUNNEST/gi, '\n  UNNEST')
    .trim()
}

function AICard({ def, aiAvailable, delay }: { def: AIFuncDef; aiAvailable: boolean; delay: number }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(def.args.map(a => [a.name, '']))
  )
  const [result, setResult] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true); setResult(null)
    try {
      const args = def.args.map(a => values[a.name] || a.placeholder)
      setResult(await callEndpoint('ecommerce/services/recommendations', def.func, args))
    } catch { setResult({ error: 'Network error — is the server running?' }) }
    setLoading(false)
  }

  const isEffectError = result?.error && (
    result.error.includes('effect context') || result.error.includes('capability') || result.error.includes('not available')
  )

  return (
    <div style={{ ...s.card(delay), opacity: aiAvailable ? 1 : 0.7 }} onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.borderColor = '#6b46c1'
      ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(107,70,193,0.1)'
    }} onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'
      ;(e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)'
    }}>
      <div style={s.cardTitle}>
        <span style={s.funcName}>{def.func}</span>
        <span style={s.badge('#6b46c1', 'rgba(107,70,193,0.08)')}>AI</span>
      </div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{def.description}</div>
      <div style={s.modulePath}>POST /api/ecommerce/services/recommendations/{def.func}</div>
      <div style={s.fieldGroup}>
        {def.args.map(a => (
          <div key={a.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={s.label}>{a.name}</span>
            {a.multiline ? (
              <textarea style={s.textarea} placeholder={a.placeholder} value={values[a.name]}
                onChange={e => setValues({ ...values, [a.name]: e.target.value })}
                onFocus={e => { e.target.style.borderColor = '#6b46c1'; e.target.style.boxShadow = '0 0 0 3px rgba(107,70,193,0.1)' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
              />
            ) : (
              <input style={s.input} placeholder={a.placeholder} value={values[a.name]}
                onChange={e => setValues({ ...values, [a.name]: e.target.value })}
                onFocus={e => { e.target.style.borderColor = '#6b46c1'; e.target.style.boxShadow = '0 0 0 3px rgba(107,70,193,0.1)' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
                onKeyDown={e => e.key === 'Enter' && run()}
              />
            )}
          </div>
        ))}
      </div>
      <button style={s.btnAI(loading)} onClick={run} disabled={loading}>
        {loading ? 'Generating...' : 'Generate'}
      </button>
      {result && (
        <div style={s.resultBox}>
          <div style={s.resultHeader}>
            <span style={s.label}>{result.error ? 'Error' : 'AI Response'}</span>
            {result.elapsed_ms !== undefined && <span style={s.timingBadge}>{result.elapsed_ms}ms</span>}
          </div>
          {result.error
            ? <div style={s.resultError}>
                {isEffectError
                  ? <><strong>Missing capabilities.</strong> Start the server with <code>--caps IO,AI,FS,Net</code> and an AI provider flag (<code>--ai claude-haiku-4-5</code> or <code>--ai-stub</code>).</>
                  : result.error}
              </div>
            : <pre style={{ ...s.codeBlock, background: '#1a1033', border: '1px solid #2d1b69', whiteSpace: 'pre-wrap' }}>
                {typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}
              </pre>}
        </div>
      )}
    </div>
  )
}

// ─── App ────────────────────────────────────────────────────────────────────

type Tab = 'contracts' | 'analytics' | 'ai'

function App() {
  const [tab, setTab] = useState<Tab>('contracts')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [modules, setModules] = useState<ModuleInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  const aiAvailable = modules.some(m => m.path.includes('recommendations'))
  const bqAvailable = modules.some(m => m.path.includes('bigquery'))

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/_health')
      setHealth(await res.json()); setError(null)
    } catch { setHealth(null); setError('Cannot connect to AILANG API server') }
  }, [])

  const fetchModules = useCallback(async () => {
    try {
      const res = await fetch('/api/_meta/modules')
      const data = await res.json()
      setModules(data.modules || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchHealth(); fetchModules()
    const interval = setInterval(fetchHealth, 15000)
    return () => clearInterval(interval)
  }, [fetchHealth, fetchModules])

  const isOk = health?.status === 'ok'
  const totalExports = modules.reduce((sum, m) => sum + m.exports.length, 0)

  return (
    <div style={s.shell}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logo}>
            <img src="/sunholo-logo.svg" alt="Sunholo" style={s.logoImg} />
            <div style={s.logoText}>AILANG <span style={{ fontWeight: 400, color: '#94a3b8' }}>Ecommerce</span></div>
          </div>
          <span style={s.logoSub}>API Explorer</span>
        </div>
        <div style={s.healthBadge(isOk)}>
          <div style={s.dot(isOk)} />
          {isOk ? `${health!.modules_count} modules · ${health!.exports_count} endpoints` : error || 'Disconnected'}
        </div>
      </header>

      <div style={s.body}>
        {/* Sidebar */}
        <aside style={s.sidebar}>
          {/* Stats */}
          <div style={s.sideSection}>
            <div style={s.sideLabel}>Server Status</div>
            <div style={s.sideStatRow}>
              <span style={{ color: '#94a3b8' }}>Modules</span>
              <span style={{ ...s.sideStatVal, color: 'white' }}>{modules.length}</span>
            </div>
            <div style={s.sideStatRow}>
              <span style={{ color: '#94a3b8' }}>Endpoints</span>
              <span style={{ ...s.sideStatVal, color: 'white' }}>{totalExports}</span>
            </div>
            <div style={s.sideStatRow}>
              <span style={{ color: '#94a3b8' }}>AI</span>
              <span style={{ ...s.sideStatVal, color: aiAvailable ? '#a78bfa' : '#475569' }}>
                {aiAvailable ? 'Active' : 'Off'}
              </span>
            </div>
            <div style={s.sideStatRow}>
              <span style={{ color: '#94a3b8' }}>BigQuery</span>
              <span style={{ ...s.sideStatVal, color: bqAvailable ? BRAND.primaryLight : '#475569' }}>
                {bqAvailable ? 'Active' : 'Off'}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <div style={s.sideSection}>
            <div style={s.sideLabel}>Navigation</div>
            <div style={s.sideNav}>
              <button style={s.sideNavBtn(tab === 'contracts')} onClick={() => setTab('contracts')}>
                Contracts
              </button>
              <button style={s.sideNavBtn(tab === 'analytics')} onClick={() => setTab('analytics')}>
                Analytics
              </button>
              <button style={s.sideNavBtn(tab === 'ai')} onClick={() => setTab('ai')}>
                AI {!aiAvailable && <span style={{ fontSize: 9, opacity: 0.5 }}>(off)</span>}
              </button>
            </div>
          </div>

          {/* Loaded modules */}
          <div style={s.sideSectionLast}>
            <div style={s.sideLabel}>Loaded Modules</div>
            {modules.map((m, i) => (
              <div key={i} style={s.sideModule} title={m.path}>
                {m.path.split('/').pop()} <span style={{ color: '#475569' }}>({m.exports.length})</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main style={s.main}>
          {/* Error state */}
          {!isOk && (
            <div style={{ ...s.aiBanner, background: '#fef2f2', borderColor: 'rgba(220,38,38,0.2)' }}>
              <span style={s.aiBannerIcon}>!</span>
              <div style={{ ...s.aiBannerText, color: '#991b1b' }}>
                <strong>Server not reachable.</strong> Start the AILANG API server:
                <pre style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, marginTop: 8,
                  padding: '8px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 6,
                }}>
                  ailang serve-api --port 8092 --caps IO,AI,FS,Net --ai-stub \{'\n'}  ecommerce/contracts_demo.ail \{'\n'}  ecommerce/services/ga4_queries.ail \{'\n'}  ecommerce/services/bigquery.ail \{'\n'}  ecommerce/services/gcp_auth.ail \{'\n'}  ecommerce/api/handlers.ail \{'\n'}  ecommerce/data/products.ail \{'\n'}  ecommerce/services/recommendations.ail
                </pre>
              </div>
            </div>
          )}

          {/* Contracts Tab */}
          {tab === 'contracts' && (
            <>
              <div style={s.sectionIntro}>
                <h2 style={s.sectionTitle}>Design-by-Contract Functions</h2>
                <p style={s.sectionDesc}>
                  Ecommerce functions with formal <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>requires</code> / <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>ensures</code> contracts.
                </p>
              </div>
              <div style={s.cardGrid}>
                <ContractCard name="applyDiscount" module="ecommerce/contracts_demo" sig="(float, float) -> float"
                  fields={[{ name: 'price', type: 'float', default: '99.99' }, { name: 'discountPct', type: 'float', default: '15.5' }]} delay={0} />
                <ContractCard name="validateQuantity" module="ecommerce/contracts_demo" sig="int -> int"
                  fields={[{ name: 'qty', type: 'int', default: '5' }]} delay={1} />
                <ContractCard name="calculateTotal" module="ecommerce/contracts_demo" sig="(float, int) -> float"
                  fields={[{ name: 'unitPrice', type: 'float', default: '29.99' }, { name: 'quantity', type: 'int', default: '3' }]} delay={2} />
                <ContractCard name="clampQuantity" module="ecommerce/contracts_demo" sig="(int, int, int) -> int"
                  fields={[{ name: 'qty', type: 'int', default: '150' }, { name: 'minQty', type: 'int', default: '1' }, { name: 'maxQty', type: 'int', default: '100' }]} delay={3} />
              </div>
            </>
          )}

          {/* Analytics Tab */}
          {tab === 'analytics' && <AnalyticsSection bqAvailable={bqAvailable} />}

          {/* AI Tab */}
          {tab === 'ai' && (
            <>
              <div style={s.sectionIntro}>
                <h2 style={s.sectionTitle}>AI-Powered Recommendations</h2>
                <p style={s.sectionDesc}>
                  Functions using AILANG's <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>std/ai</code> effect.
                  Each call uses exactly 1 AI operation via the configured provider.
                </p>
              </div>
              {!aiAvailable && (
                <div style={s.aiBanner}>
                  <span style={s.aiBannerIcon}>!</span>
                  <div style={s.aiBannerText}>
                    <strong>AI module not loaded.</strong> Start with capabilities and an AI provider:
                    <pre style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12, marginTop: 8,
                      padding: '8px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 6,
                    }}>
                      ailang serve-api --caps IO,AI,FS,Net --ai claude-haiku-4-5 \{'\n'}  ecommerce/services/recommendations.ail ...
                    </pre>
                  </div>
                </div>
              )}
              <div style={s.cardGrid}>
                {AI_FUNCTIONS.map((def, i) => (
                  <AICard key={def.func} def={def} aiAvailable={aiAvailable} delay={i} />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer style={s.footer}>
        <span>AILANG serve-api · Ecommerce Demo</span>
        <a href="https://ailang.sunholo.com" target="_blank" rel="noopener" style={s.footerLink}>ailang.sunholo.com</a>
      </footer>
    </div>
  )
}

export default App
