import { useState, useEffect, useMemo } from 'react'
import { Card, Row, Col, Statistic, Select, DatePicker, Spin, Alert, Table as AntTable, Tag } from 'antd'
import ReactECharts from 'echarts-for-react'
import { fetchArrowData, tableToArray } from '../utils/arrow'
import * as aq from 'arquero'
import dayjs, { type Dayjs } from 'dayjs'

const { RangePicker } = DatePicker

interface UserSkuLogRow {
  ts: string
  user_id: string
  sku_id: string
  event_type: 'view' | 'cart_add' | 'purchase'
  attrs: string | null
}

interface ParsedAttrs {
  cart_id?: string
  quantity?: number
  order_id?: string
  price?: number
  coupon?: string
  discount?: number
}

export default function UserSkuLogs() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rawData, setRawData] = useState<UserSkuLogRow[]>([])
  const [selectedEventType, setSelectedEventType] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])

  // 加载数据
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)

        // 限制加载50000条记录以提高性能
        const table = await fetchArrowData('/api/user-sku-logs?limit=50000')
        const data = tableToArray<UserSkuLogRow>(table)

        console.log('Loaded user-sku logs:', {
          rows: data.length,
          sample: data.slice(0, 3),
        })

        setRawData(data)
      } catch (err) {
        console.error('Failed to load user-sku logs:', err)
        setError(err instanceof Error ? err.message : '加载数据失败')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // 过滤数据
  const filteredData = useMemo(() => {
    let data = rawData

    if (selectedEventType) {
      data = data.filter(row => row.event_type === selectedEventType)
    }

    if (dateRange) {
      const [start, end] = dateRange
      data = data.filter(row => {
        const date = dayjs(row.ts)
        return date.isAfter(start.subtract(1, 'day')) && date.isBefore(end.add(1, 'day'))
      })
    }

    return data
  }, [rawData, selectedEventType, dateRange])

  // 使用Arquero进行数据分析（仅基于主干字段，不解析attrs）
  const aggregatedData = useMemo(() => {
    if (filteredData.length === 0) return null

    const dt = aq.from(filteredData)

    // 事件类型统计
    const eventStats = dt
      .groupby('event_type')
      .count()
      .objects() as Array<{ event_type: string; count: number }>

    // 按小时统计事件分布
    const hourlyData = filteredData.map(row => ({
      ...row,
      hour: dayjs(row.ts).format('YYYY-MM-DD HH:00'),
    }))

    const hourlyStats = aq
      .from(hourlyData)
      .groupby('hour', 'event_type')
      .count()
      .orderby('hour')
      .objects() as Array<{ hour: string; event_type: string; count: number }>

    // 计算漏斗转化率
    const viewCount = eventStats.find(d => d.event_type === 'view')?.count || 0
    const cartCount = eventStats.find(d => d.event_type === 'cart_add')?.count || 0
    const purchaseCount = eventStats.find(d => d.event_type === 'purchase')?.count || 0

    const cartRate = viewCount > 0 ? (cartCount / viewCount) * 100 : 0
    const purchaseRate = cartCount > 0 ? (purchaseCount / cartCount) * 100 : 0
    const overallRate = viewCount > 0 ? (purchaseCount / viewCount) * 100 : 0

    // Top SKU分析 - 先派生标记列
    const topSkus = dt
      .derive({
        is_view: (d: any) => d.event_type === 'view' ? 1 : 0,
        is_cart_add: (d: any) => d.event_type === 'cart_add' ? 1 : 0,
        is_purchase: (d: any) => d.event_type === 'purchase' ? 1 : 0,
      })
      .groupby('sku_id')
      .rollup({
        views: (d: any) => aq.op.sum(d.is_view),
        cart_adds: (d: any) => aq.op.sum(d.is_cart_add),
        purchases: (d: any) => aq.op.sum(d.is_purchase),
      })
      .orderby(aq.desc('purchases'))
      .slice(0, 10)
      .objects()

    return {
      eventStats,
      hourlyStats,
      funnel: {
        viewCount,
        cartCount,
        purchaseCount,
        cartRate,
        purchaseRate,
        overallRate,
      },
      topSkus,
    }
  }, [filteredData])

  // 事件分布饼图
  const eventPieOption = useMemo(() => {
    if (!aggregatedData) return null

    return {
      title: { text: '事件类型分布' },
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 'left' },
      series: [
        {
          name: '事件数量',
          type: 'pie',
          radius: '50%',
          data: aggregatedData.eventStats.map((d: any) => ({
            name: d.event_type,
            value: d.count,
          })),
        },
      ],
    }
  }, [aggregatedData])

  // 时间趋势图
  const trendChartOption = useMemo(() => {
    if (!aggregatedData) return null

    const hours = [...new Set(aggregatedData.hourlyStats.map((d: any) => d.hour))].sort()
    const eventTypes = ['view', 'cart_add', 'purchase']

    const series = eventTypes.map(type => ({
      name: type,
      type: 'line',
      data: hours.map(hour => {
        const stat = (aggregatedData.hourlyStats as Array<{ hour: string; event_type: string; count: number }>)
          .find(d => d.hour === hour && d.event_type === type)
        return stat ? stat.count : 0
      }),
    }))

    return {
      title: { text: '事件时间分布' },
      tooltip: { trigger: 'axis' },
      legend: { data: eventTypes },
      xAxis: {
        type: 'category',
        data: hours,
        axisLabel: {
          rotate: 45,
          interval: Math.floor(hours.length / 10),
        },
      },
      yAxis: { type: 'value' },
      series,
    }
  }, [aggregatedData])

  // 漏斗图
  const funnelChartOption = useMemo(() => {
    if (!aggregatedData) return null

    return {
      title: { text: '转化漏斗' },
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [
        {
          name: '转化漏斗',
          type: 'funnel',
          left: '10%',
          width: '80%',
          data: [
            { value: aggregatedData.funnel.viewCount, name: '浏览 (View)' },
            { value: aggregatedData.funnel.cartCount, name: '加购 (Cart Add)' },
            { value: aggregatedData.funnel.purchaseCount, name: '购买 (Purchase)' },
          ],
        },
      ],
    }
  }, [aggregatedData])

  // 明细表格列
  const columns = [
    {
      title: '时间',
      dataIndex: 'ts',
      key: 'ts',
      width: 180,
      render: (ts: string) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss'),
    },
    { title: '用户ID', dataIndex: 'user_id', key: 'user_id', width: 120 },
    { title: 'SKU ID', dataIndex: 'sku_id', key: 'sku_id', width: 120 },
    {
      title: '事件类型',
      dataIndex: 'event_type',
      key: 'event_type',
      width: 120,
      render: (type: string) => {
        const colors: Record<string, string> = {
          view: 'blue',
          cart_add: 'orange',
          purchase: 'green',
        }
        return <Tag color={colors[type]}>{type}</Tag>
      },
    },
    {
      title: '扩展属性',
      key: 'attrs',
      width: 100,
      render: (_: any, row: UserSkuLogRow) => {
        if (!row.attrs) return <Tag>无</Tag>

        // 懒加载：仅当行展开时才解析JSON
        if (!expandedRowKeys.includes(row.user_id + row.ts)) {
          return <Tag color="cyan">有（点击查看）</Tag>
        }

        try {
          const attrs: ParsedAttrs = JSON.parse(row.attrs)
          return (
            <div style={{ fontSize: '12px' }}>
              {Object.entries(attrs).map(([key, value]) => (
                <div key={key}>
                  <strong>{key}:</strong> {String(value)}
                </div>
              ))}
            </div>
          )
        } catch {
          return <Tag color="red">解析失败</Tag>
        }
      },
    },
  ]

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" tip="加载数据中..." />
      </div>
    )
  }

  if (error) {
    return <Alert message="错误" description={error} type="error" showIcon />
  }

  return (
    <div>
      <Card title="用户-SKU互动日志分析（稀疏数据）" style={{ marginBottom: 16 }}>
        <Alert
          message="性能优化说明"
          description="本页面采用主干分析策略：所有聚合计算仅基于主干字段（event_type、ts等），扩展属性（attrs）仅在点击明细行时按需解析，确保百万级数据的流畅分析。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <Select
              style={{ width: '100%' }}
              placeholder="选择事件类型"
              allowClear
              value={selectedEventType}
              onChange={setSelectedEventType}
              options={[
                { label: '全部', value: undefined },
                { label: 'View', value: 'view' },
                { label: 'Cart Add', value: 'cart_add' },
                { label: 'Purchase', value: 'purchase' },
              ]}
            />
          </Col>
          <Col span={12}>
            <RangePicker
              style={{ width: '100%' }}
              showTime
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
            />
          </Col>
        </Row>

        {aggregatedData && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Card>
                  <Statistic title="总事件数" value={filteredData.length} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic title="浏览→加购率" value={aggregatedData.funnel.cartRate.toFixed(2)} suffix="%" />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic title="加购→购买率" value={aggregatedData.funnel.purchaseRate.toFixed(2)} suffix="%" />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic title="整体转化率" value={aggregatedData.funnel.overallRate.toFixed(2)} suffix="%" />
                </Card>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                {eventPieOption && <ReactECharts option={eventPieOption} style={{ height: 350 }} />}
              </Col>
              <Col span={8}>
                {funnelChartOption && <ReactECharts option={funnelChartOption} style={{ height: 350 }} />}
              </Col>
              <Col span={8}>
                <Card title="Top 10 热门SKU" style={{ height: 350, overflow: 'auto' }}>
                  <AntTable
                    columns={[
                      { title: 'SKU', dataIndex: 'sku_id', key: 'sku_id', width: 100 },
                      { title: '购买', dataIndex: 'purchases', key: 'purchases', width: 60 },
                    ]}
                    dataSource={aggregatedData.topSkus}
                    rowKey="sku_id"
                    pagination={false}
                    size="small"
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={24}>
                {trendChartOption && <ReactECharts option={trendChartOption} style={{ height: 400 }} />}
              </Col>
            </Row>

            <Card title={`数据明细（共 ${filteredData.length} 条，已加载前50000条）`}>
              <AntTable
                columns={columns}
                dataSource={filteredData.slice(0, 1000)}
                rowKey={(row) => row.user_id + row.ts}
                pagination={{ pageSize: 20 }}
                scroll={{ y: 400 }}
                size="small"
                expandable={{
                  expandedRowKeys,
                  onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as string[]),
                  expandedRowRender: (record) => {
                    if (!record.attrs) return <p>无扩展属性</p>
                    try {
                      const attrs: ParsedAttrs = JSON.parse(record.attrs)
                      return <pre>{JSON.stringify(attrs, null, 2)}</pre>
                    } catch {
                      return <p style={{ color: 'red' }}>JSON解析失败</p>
                    }
                  },
                }}
              />
            </Card>
          </>
        )}
      </Card>
    </div>
  )
}
