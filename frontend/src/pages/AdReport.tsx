import { useState, useEffect, useMemo } from 'react'
import { Card, Row, Col, Statistic, Select, DatePicker, Spin, Alert, Table as AntTable } from 'antd'
import ReactECharts from 'echarts-for-react'
import { fetchArrowData, tableToArray } from '../utils/arrow'
import * as aq from 'arquero'
import dayjs, { type Dayjs } from 'dayjs'

const { RangePicker } = DatePicker

interface AdReportRow {
  date: string
  advertiser_id: number
  campaign_id: number
  campaign_type: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  gmv: number
}

export default function AdReport() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rawData, setRawData] = useState<AdReportRow[]>([])
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)

  // 加载数据
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)

        const table = await fetchArrowData('/api/ad-report')
        const data = tableToArray<AdReportRow>(table)

        console.log('Loaded ad report data:', {
          rows: data.length,
          sample: data.slice(0, 3),
        })

        setRawData(data)
      } catch (err) {
        console.error('Failed to load ad report:', err)
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

    if (selectedType) {
      data = data.filter(row => row.campaign_type === selectedType)
    }

    if (dateRange) {
      const [start, end] = dateRange
      data = data.filter(row => {
        const date = dayjs(row.date)
        return date.isAfter(start.subtract(1, 'day')) && date.isBefore(end.add(1, 'day'))
      })
    }

    return data
  }, [rawData, selectedType, dateRange])

  // 使用Arquero进行数据聚合
  const aggregatedData = useMemo(() => {
    if (filteredData.length === 0) return null

    const dt = aq.from(filteredData)

    // 按日期聚合
    const dailyStats = dt
      .groupby('date')
      .rollup({
        impressions: aq.op.sum('impressions'),
        clicks: aq.op.sum('clicks'),
        cost: aq.op.sum('cost'),
        conversions: aq.op.sum('conversions'),
        gmv: aq.op.sum('gmv'),
      })
      .orderby('date')
      .objects()

    // 按计划类型聚合
    const typeStats = dt
      .groupby('campaign_type')
      .rollup({
        impressions: aq.op.sum('impressions'),
        clicks: aq.op.sum('clicks'),
        cost: aq.op.sum('cost'),
        conversions: aq.op.sum('conversions'),
        gmv: aq.op.sum('gmv'),
      })
      .objects()

    // 计算总览指标
    const totals = dt
      .rollup({
        totalImpressions: aq.op.sum('impressions'),
        totalClicks: aq.op.sum('clicks'),
        totalCost: aq.op.sum('cost'),
        totalConversions: aq.op.sum('conversions'),
        totalGmv: aq.op.sum('gmv'),
      })
      .object(0) as {
        totalImpressions: number
        totalClicks: number
        totalCost: number
        totalConversions: number
        totalGmv: number
      }

    // 计算衍生指标
    const ctr = (totals.totalClicks / totals.totalImpressions) * 100
    const cvr = (totals.totalConversions / totals.totalClicks) * 100
    const roi = (totals.totalGmv / totals.totalCost - 1) * 100

    return {
      dailyStats,
      typeStats,
      totals: {
        ...totals,
        ctr,
        cvr,
        roi,
      },
    }
  }, [filteredData])

  // 趋势图表配置
  const trendChartOption = useMemo(() => {
    if (!aggregatedData) return null

    const { dailyStats } = aggregatedData

    return {
      title: { text: '每日趋势' },
      tooltip: { trigger: 'axis' },
      legend: { data: ['曝光量', '点击量', '转化量', 'GMV'] },
      xAxis: {
        type: 'category',
        data: dailyStats.map((d: any) => d.date),
      },
      yAxis: [
        { type: 'value', name: '曝光/点击/转化' },
        { type: 'value', name: 'GMV', position: 'right' },
      ],
      series: [
        {
          name: '曝光量',
          type: 'line',
          data: dailyStats.map((d: any) => d.impressions),
        },
        {
          name: '点击量',
          type: 'line',
          data: dailyStats.map((d: any) => d.clicks),
        },
        {
          name: '转化量',
          type: 'line',
          data: dailyStats.map((d: any) => d.conversions),
        },
        {
          name: 'GMV',
          type: 'line',
          yAxisIndex: 1,
          data: dailyStats.map((d: any) => d.gmv.toFixed(2)),
        },
      ],
    }
  }, [aggregatedData])

  // 计划类型分布图表配置
  const typeChartOption = useMemo(() => {
    if (!aggregatedData) return null

    const { typeStats } = aggregatedData

    return {
      title: { text: '计划类型分布' },
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 'left' },
      series: [
        {
          name: 'GMV',
          type: 'pie',
          radius: '50%',
          data: typeStats.map((d: any) => ({
            name: d.campaign_type,
            value: d.gmv.toFixed(2),
          })),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    }
  }, [aggregatedData])

  // 明细表格列
  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '计划类型', dataIndex: 'campaign_type', key: 'campaign_type', width: 100 },
    { title: '曝光量', dataIndex: 'impressions', key: 'impressions', width: 100 },
    { title: '点击量', dataIndex: 'clicks', key: 'clicks', width: 100 },
    { title: '花费', dataIndex: 'cost', key: 'cost', width: 100, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '转化量', dataIndex: 'conversions', key: 'conversions', width: 100 },
    { title: 'GMV', dataIndex: 'gmv', key: 'gmv', width: 120, render: (v: number) => `¥${v.toFixed(2)}` },
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
      <Card title="广告日报表分析（密集数据）" style={{ marginBottom: 16 }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <Select
              style={{ width: '100%' }}
              placeholder="选择计划类型"
              allowClear
              value={selectedType}
              onChange={setSelectedType}
              options={[
                { label: '全部', value: undefined },
                { label: 'Search', value: 'search' },
                { label: 'Display', value: 'display' },
                { label: 'Video', value: 'video' },
                { label: 'Shopping', value: 'shopping' },
              ]}
            />
          </Col>
          <Col span={12}>
            <RangePicker
              style={{ width: '100%' }}
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
                  <Statistic title="总曝光量" value={aggregatedData.totals.totalImpressions} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic title="总点击量" value={aggregatedData.totals.totalClicks} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic title="点击率" value={aggregatedData.totals.ctr.toFixed(2)} suffix="%" />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic title="ROI" value={aggregatedData.totals.roi.toFixed(2)} suffix="%" />
                </Card>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={16}>
                {trendChartOption && <ReactECharts option={trendChartOption} style={{ height: 400 }} />}
              </Col>
              <Col span={8}>
                {typeChartOption && <ReactECharts option={typeChartOption} style={{ height: 400 }} />}
              </Col>
            </Row>

            <Card title={`数据明细（共 ${filteredData.length} 条）`}>
              <AntTable
                columns={columns}
                dataSource={filteredData}
                rowKey={(row) => `${row.date}-${row.campaign_id}`}
                pagination={{ pageSize: 10 }}
                scroll={{ y: 400 }}
                size="small"
              />
            </Card>
          </>
        )}
      </Card>
    </div>
  )
}
