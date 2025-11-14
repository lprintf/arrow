import { useState, useEffect, useMemo } from 'react'
import { Card, Row, Col, Statistic, Select, DatePicker, Spin, Alert, Button } from 'antd'
import ReactECharts from 'echarts-for-react'
import { fetchArrowData, tableToArray } from '../utils/arrow'
import AdDetailTable from '../components/AdDetailTable'
import * as aq from 'arquero'
import dayjs, { type Dayjs } from 'dayjs'

const { RangePicker } = DatePicker

interface AdReportRow {
  date: string
  advertiser_id: string
  campaign_id: string
  campaign_type: string
  ad_set_id: string
  ad_id: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  gmv: number
}

interface ShardsMetadata {
  months: string[]
  total_records: number
  total_size_mb: number
}

export default function AdReport() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rawData, setRawData] = useState<AdReportRow[]>([])
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [metadata, setMetadata] = useState<ShardsMetadata | null>(null)
  const [loadedMonths, setLoadedMonths] = useState<string[]>([])

  // 辅助函数：根据日期范围计算需要的月份
  const getMonthsInRange = (start: Dayjs, end: Dayjs): string[] => {
    const months: string[] = []
    let current = start.startOf('month')
    const endMonth = end.startOf('month')

    while (current.isBefore(endMonth) || current.isSame(endMonth)) {
      months.push(current.format('YYYY-MM'))
      current = current.add(1, 'month')
    }

    return months
  }

  // 加载分片元数据
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/api/ad-report/shards/metadata')
        const data = await response.json()
        setMetadata(data)
      } catch (err) {
        console.error('Failed to load metadata:', err)
      }
    }
    loadMetadata()
  }, [])

  // 加载数据（默认只加载最后一个月）
  useEffect(() => {
    const loadData = async () => {
      if (!metadata) return

      try {
        setLoading(true)
        setError(null)

        // 默认只加载最后一个月
        const latestMonth = metadata.months[metadata.months.length - 1]
        const monthsToLoad = [latestMonth]

        console.log('Loading initial months:', monthsToLoad)

        const table = await fetchArrowData(
          `/api/ad-report/shards?months=${monthsToLoad.join(',')}`
        )
        const data = tableToArray<AdReportRow>(table)

        console.log('Loaded ad report data:', {
          months: monthsToLoad,
          rows: data.length,
          sample: data.slice(0, 3),
        })

        setRawData(data)
        setLoadedMonths(monthsToLoad)
      } catch (err) {
        console.error('Failed to load ad report:', err)
        setError(err instanceof Error ? err.message : '加载数据失败')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [metadata])

  // 监听日期范围变化，动态加载对应月份
  useEffect(() => {
    const loadMonthsForDateRange = async () => {
      if (!metadata || !dateRange) return

      const [start, end] = dateRange
      const requiredMonths = getMonthsInRange(start, end)

      // 过滤出需要加载的月份（还未加载的）
      const monthsToLoad = requiredMonths.filter(
        month => !loadedMonths.includes(month) && metadata.months.includes(month)
      )

      if (monthsToLoad.length === 0) {
        console.log('All required months already loaded')
        return
      }

      try {
        setLoading(true)
        console.log('Loading additional months for date range:', monthsToLoad)

        const table = await fetchArrowData(
          `/api/ad-report/shards?months=${monthsToLoad.join(',')}`
        )
        const newData = tableToArray<AdReportRow>(table)

        console.log('Loaded additional data:', {
          months: monthsToLoad,
          rows: newData.length,
        })

        // 合并新数据和已有数据
        setRawData(prev => [...prev, ...newData])
        setLoadedMonths(prev => [...prev, ...monthsToLoad].sort())
      } catch (err) {
        console.error('Failed to load additional months:', err)
        setError(err instanceof Error ? err.message : '加载数据失败')
      } finally {
        setLoading(false)
      }
    }

    loadMonthsForDateRange()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, metadata]) // 移除 loadedMonths 依赖，避免无限循环

  // 加载全部数据
  const loadAllMonths = async () => {
    if (!metadata) return

    const unloadedMonths = metadata.months.filter(m => !loadedMonths.includes(m))
    if (unloadedMonths.length === 0) {
      console.log('All months already loaded')
      return
    }

    try {
      setLoading(true)
      console.log('Loading all months:', unloadedMonths)

      const table = await fetchArrowData(
        `/api/ad-report/shards?months=${unloadedMonths.join(',')}`
      )
      const newData = tableToArray<AdReportRow>(table)

      console.log('Loaded all data:', {
        months: unloadedMonths,
        rows: newData.length,
      })

      setRawData(prev => [...prev, ...newData])
      setLoadedMonths(metadata.months)
    } catch (err) {
      console.error('Failed to load all months:', err)
      setError(err instanceof Error ? err.message : '加载数据失败')
    } finally {
      setLoading(false)
    }
  }

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
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>广告日报表分析（分片加载）</span>
            {metadata && (
              <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#666' }}>
                已加载: {loadedMonths.join(', ')} |
                共 {rawData.length.toLocaleString()} 条记录 /
                总计 {metadata.total_records.toLocaleString()} 条
                ({metadata.months.length} 个月份可用)
              </span>
            )}
          </div>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
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
              onChange={(dates) => {
                setDateRange(dates as [Dayjs, Dayjs] | null)
                if (dates && dates[0] && dates[1]) {
                  const [start, end] = dates
                  console.log('Date range selected:', {
                    start: start.format('YYYY-MM-DD'),
                    end: end.format('YYYY-MM-DD'),
                    monthsInRange: getMonthsInRange(start, end),
                  })
                }
              }}
              placeholder={['开始日期', '结束日期']}
              disabledDate={(current) => {
                if (!metadata) return true
                // 限制在可用数据范围内
                const firstMonth = metadata.months[0]
                const lastMonth = metadata.months[metadata.months.length - 1]
                const minDate = dayjs(firstMonth + '-01')
                const maxDate = dayjs(lastMonth + '-01').endOf('month')
                return current.isBefore(minDate, 'day') || current.isAfter(maxDate, 'day')
              }}
              format="YYYY-MM-DD"
            />
          </Col>
          <Col span={4}>
            <Button
              type="primary"
              onClick={loadAllMonths}
              disabled={!metadata || loadedMonths.length === metadata.months.length}
              loading={loading}
              block
            >
              加载全部数据
            </Button>
          </Col>
        </Row>

        {dateRange && (
          <Alert
            message={`选择日期范围: ${dateRange[0].format('YYYY-MM-DD')} 至 ${dateRange[1].format('YYYY-MM-DD')}`}
            description={`已自动加载对应月份的数据。当前显示 ${filteredData.length.toLocaleString()} 条记录。`}
            type="info"
            closable
            onClose={() => setDateRange(null)}
            style={{ marginBottom: 16 }}
          />
        )}

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

            <AdDetailTable data={filteredData} />
          </>
        )}
      </Card>
    </div>
  )
}
