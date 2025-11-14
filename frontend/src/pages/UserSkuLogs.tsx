import { useState, useEffect, useMemo } from 'react'
import { Card, Row, Col, Statistic, Select, DatePicker, Spin, Alert, Table as AntTable, Tag, Dropdown, Button, Checkbox, Space, InputNumber, Modal, Input } from 'antd'
import { SettingOutlined, EyeOutlined, ColumnWidthOutlined, PushpinOutlined, ReloadOutlined } from '@ant-design/icons'
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

interface ColumnConfig {
  key: string
  label: string
  visible: boolean
  width: number
  fixed?: 'left' | 'right' | false
  sortable?: boolean
  isCustom?: boolean
  expression?: string  // 自定义列的计算表达式
}

interface ViewConfig {
  id: string
  name: string
  columns: ColumnConfig[]
  createdAt: string
}

interface FilterCondition {
  id: string
  field: string
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'between'
  value: any
  value2?: any  // 用于 between 操作
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'ts', label: '时间', visible: true, width: 180, fixed: 'left', sortable: true },
  { key: 'user_id', label: '用户ID', visible: true, width: 120, fixed: false, sortable: false },
  { key: 'sku_id', label: 'SKU ID', visible: true, width: 120, fixed: false, sortable: false },
  { key: 'event_type', label: '事件类型', visible: true, width: 120, fixed: false, sortable: false },
  { key: 'attrs', label: '扩展属性', visible: true, width: 100, fixed: false, sortable: false },
]

export default function UserSkuLogs() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rawData, setRawData] = useState<UserSkuLogRow[]>([])
  const [selectedEventType, setSelectedEventType] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])

  // 列配置状态
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>(DEFAULT_COLUMNS)
  const [settingsVisible, setSettingsVisible] = useState(false)

  // 自定义列状态
  const [customColumnModalVisible, setCustomColumnModalVisible] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [newColumnExpression, setNewColumnExpression] = useState('')

  // 视图管理状态
  const [savedViews, setSavedViews] = useState<ViewConfig[]>([])
  const [viewModalVisible, setViewModalVisible] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  // 高级筛选状态
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([])
  const [filterModalVisible, setFilterModalVisible] = useState(false)

  // 从 localStorage 加载已保存的视图
  useEffect(() => {
    const stored = localStorage.getItem('userSkuLogs_savedViews')
    if (stored) {
      try {
        setSavedViews(JSON.parse(stored))
      } catch {
        console.error('Failed to parse saved views')
      }
    }
  }, [])

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

  // 应用高级筛选
  const advancedFilteredData = useMemo(() => {
    if (filterConditions.length === 0) return filteredData

    return filteredData.filter(row => {
      return filterConditions.every(condition => {
        const fieldValue = (row as any)[condition.field]

        switch (condition.operator) {
          case 'equals':
            return fieldValue === condition.value
          case 'contains':
            return String(fieldValue).toLowerCase().includes(String(condition.value).toLowerCase())
          case 'greaterThan':
            return fieldValue > condition.value
          case 'lessThan':
            return fieldValue < condition.value
          case 'between':
            return fieldValue >= condition.value && fieldValue <= condition.value2
          default:
            return true
        }
      })
    })
  }, [filteredData, filterConditions])

  // 使用Arquero进行数据分析（仅基于主干字段，不解析attrs）
  const aggregatedData = useMemo(() => {
    if (advancedFilteredData.length === 0) return null

    const dt = aq.from(advancedFilteredData)

    // 事件类型统计
    const eventStats = dt
      .groupby('event_type')
      .count()
      .objects() as Array<{ event_type: string; count: number }>

    // 按小时统计事件分布
    const hourlyData = advancedFilteredData.map(row => ({
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
  }, [advancedFilteredData])

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

  // 列配置管理函数
  const toggleColumnVisibility = (key: string) => {
    setColumnConfigs(prev =>
      prev.map(col => col.key === key ? { ...col, visible: !col.visible } : col)
    )
  }

  const updateColumnWidth = (key: string, width: number) => {
    setColumnConfigs(prev =>
      prev.map(col => col.key === key ? { ...col, width } : col)
    )
  }

  const toggleColumnFixed = (key: string) => {
    setColumnConfigs(prev =>
      prev.map(col => {
        if (col.key === key) {
          const newFixed = col.fixed === false ? 'left' : col.fixed === 'left' ? 'right' : false
          return { ...col, fixed: newFixed }
        }
        return col
      })
    )
  }

  const resetColumns = () => {
    setColumnConfigs(DEFAULT_COLUMNS)
  }

  // 自定义列管理函数
  const evaluateExpression = (expression: string, row: UserSkuLogRow): any => {
    try {
      // 解析 attrs JSON（如果存在）
      let attrs: ParsedAttrs = {}
      if (row.attrs) {
        try {
          attrs = JSON.parse(row.attrs)
        } catch {
          // JSON解析失败，使用空对象
        }
      }

      // 创建安全的计算上下文
      const context = {
        user_id: row.user_id,
        sku_id: row.sku_id,
        event_type: row.event_type,
        ts: row.ts,
        attrs: attrs,
        // 辅助函数
        Math: Math,
        Date: Date,
      }

      // 使用 Function 构造器执行表达式（受限环境）
      const func = new Function(...Object.keys(context), `return ${expression}`)
      return func(...Object.values(context))
    } catch (error) {
      console.error('Expression evaluation failed:', error)
      return 'Error'
    }
  }

  const addCustomColumn = () => {
    if (!newColumnName.trim() || !newColumnExpression.trim()) {
      alert('请输入列名和表达式')
      return
    }

    const newColumn: ColumnConfig = {
      key: `custom_${Date.now()}`,
      label: newColumnName,
      visible: true,
      width: 150,
      fixed: false,
      sortable: false,
      isCustom: true,
      expression: newColumnExpression,
    }

    setColumnConfigs(prev => [...prev, newColumn])
    setCustomColumnModalVisible(false)
    setNewColumnName('')
    setNewColumnExpression('')
  }

  const removeCustomColumn = (key: string) => {
    setColumnConfigs(prev => prev.filter(col => col.key !== key))
  }

  // 视图管理函数
  const saveCurrentView = () => {
    if (!newViewName.trim()) {
      alert('请输入视图名称')
      return
    }

    const newView: ViewConfig = {
      id: `view_${Date.now()}`,
      name: newViewName,
      columns: columnConfigs,
      createdAt: new Date().toISOString(),
    }

    const updatedViews = [...savedViews, newView]
    setSavedViews(updatedViews)
    localStorage.setItem('userSkuLogs_savedViews', JSON.stringify(updatedViews))

    setViewModalVisible(false)
    setNewViewName('')
    alert(`视图 "${newViewName}" 已保存`)
  }

  const loadView = (viewId: string) => {
    const view = savedViews.find(v => v.id === viewId)
    if (view) {
      setColumnConfigs(view.columns)
      alert(`已加载视图 "${view.name}"`)
    }
  }

  const deleteView = (viewId: string) => {
    const updatedViews = savedViews.filter(v => v.id !== viewId)
    setSavedViews(updatedViews)
    localStorage.setItem('userSkuLogs_savedViews', JSON.stringify(updatedViews))
  }

  // 高级筛选管理函数
  const addFilterCondition = () => {
    const newCondition: FilterCondition = {
      id: `filter_${Date.now()}`,
      field: 'event_type',
      operator: 'equals',
      value: '',
    }
    setFilterConditions(prev => [...prev, newCondition])
  }

  const updateFilterCondition = (id: string, updates: Partial<FilterCondition>) => {
    setFilterConditions(prev =>
      prev.map(cond => cond.id === id ? { ...cond, ...updates } : cond)
    )
  }

  const removeFilterCondition = (id: string) => {
    setFilterConditions(prev => prev.filter(cond => cond.id !== id))
  }

  const clearAllFilters = () => {
    setFilterConditions([])
  }

  // 明细表格列（基于配置动态生成）
  const columns = useMemo(() => {
    return columnConfigs
      .filter(config => config.visible)
      .map(config => {
        const baseColumn: any = {
          title: config.label,
          dataIndex: config.key,
          key: config.key,
          width: config.width,
          fixed: config.fixed || undefined,
        }

        // 根据列类型添加自定义渲染
        if (config.key === 'ts') {
          baseColumn.render = (ts: string) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss')
          baseColumn.sorter = (a: UserSkuLogRow, b: UserSkuLogRow) =>
            new Date(a.ts).getTime() - new Date(b.ts).getTime()
        } else if (config.key === 'event_type') {
          baseColumn.render = (type: string) => {
            const colors: Record<string, string> = {
              view: 'blue',
              cart_add: 'orange',
              purchase: 'green',
            }
            return <Tag color={colors[type]}>{type}</Tag>
          }
        } else if (config.key === 'attrs') {
          baseColumn.render = (_: any, row: UserSkuLogRow) => {
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
          }
        }

        // 自定义列的渲染
        if (config.isCustom && config.expression) {
          baseColumn.render = (_: any, row: UserSkuLogRow) => {
            const result = evaluateExpression(config.expression!, row)
            return <span>{String(result)}</span>
          }
        }

        return baseColumn
      })
  }, [columnConfigs, expandedRowKeys])

  // 列设置菜单
  const columnSettingsMenu = (
    <div style={{
      padding: '12px',
      width: 320,
      maxHeight: 500,
      overflowY: 'auto',
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      boxShadow: '0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 9px 28px 8px rgba(0, 0, 0, 0.05)'
    }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
          <EyeOutlined style={{ marginRight: 8 }} />
          列可见性
        </div>
        <Space direction="vertical" style={{ width: '100%' }}>
          {columnConfigs.map(col => (
            <div key={col.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Checkbox
                checked={col.visible}
                onChange={() => toggleColumnVisibility(col.key)}
              >
                {col.label}
                {col.isCustom && <Tag color="purple" style={{ marginLeft: 4 }}>自定义</Tag>}
              </Checkbox>
              {col.isCustom && (
                <Button
                  size="small"
                  danger
                  type="text"
                  onClick={() => removeCustomColumn(col.key)}
                >
                  删除
                </Button>
              )}
            </div>
          ))}
        </Space>
        <Button
          size="small"
          type="dashed"
          block
          style={{ marginTop: 8 }}
          onClick={() => setCustomColumnModalVisible(true)}
        >
          + 添加自定义列
        </Button>
      </div>

      <div style={{ marginBottom: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
          <ColumnWidthOutlined style={{ marginRight: 8 }} />
          列宽度
        </div>
        <Space direction="vertical" style={{ width: '100%' }}>
          {columnConfigs.filter(col => col.visible).map(col => (
            <div key={col.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ flex: 1 }}>{col.label}</span>
              <InputNumber
                size="small"
                min={80}
                max={400}
                value={col.width}
                onChange={(value) => updateColumnWidth(col.key, value || 120)}
                style={{ width: 80 }}
              />
            </div>
          ))}
        </Space>
      </div>

      <div style={{ marginBottom: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
          <PushpinOutlined style={{ marginRight: 8 }} />
          列固定
        </div>
        <Space direction="vertical" style={{ width: '100%' }}>
          {columnConfigs.filter(col => col.visible).map(col => (
            <div key={col.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ flex: 1 }}>{col.label}</span>
              <Tag
                color={col.fixed === 'left' ? 'blue' : col.fixed === 'right' ? 'green' : 'default'}
                style={{ cursor: 'pointer', minWidth: 60, textAlign: 'center' }}
                onClick={() => toggleColumnFixed(col.key)}
              >
                {col.fixed === 'left' ? '左固定' : col.fixed === 'right' ? '右固定' : '不固定'}
              </Tag>
            </div>
          ))}
        </Space>
      </div>

      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>视图管理</div>
        {savedViews.length === 0 ? (
          <div style={{ color: '#999', fontSize: '12px', marginBottom: 8 }}>暂无保存的视图</div>
        ) : (
          <Space direction="vertical" style={{ width: '100%', marginBottom: 8 }}>
            {savedViews.map(view => (
              <div key={view.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{ flex: 1, cursor: 'pointer', color: '#1890ff' }}
                  onClick={() => loadView(view.id)}
                >
                  {view.name}
                </span>
                <Button
                  size="small"
                  danger
                  type="text"
                  onClick={() => deleteView(view.id)}
                >
                  删除
                </Button>
              </div>
            ))}
          </Space>
        )}
        <Button
          size="small"
          type="dashed"
          block
          onClick={() => setViewModalVisible(true)}
        >
          保存当前视图
        </Button>
      </div>

      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
        <Button
          icon={<ReloadOutlined />}
          onClick={resetColumns}
          block
          type="default"
        >
          重置为默认
        </Button>
      </div>
    </div>
  )

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
                  <Statistic title="总事件数" value={advancedFilteredData.length} />
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

            <Card
              title={`数据明细（共 ${advancedFilteredData.length} 条，已加载前50000条）`}
              extra={
                <Space>
                  {filterConditions.length > 0 && (
                    <Tag color="orange">
                      {filterConditions.length} 个筛选条件
                      <Button
                        type="link"
                        size="small"
                        onClick={clearAllFilters}
                        style={{ padding: '0 4px' }}
                      >
                        清除
                      </Button>
                    </Tag>
                  )}
                  <Button
                    onClick={() => setFilterModalVisible(true)}
                    type={filterConditions.length > 0 ? 'primary' : 'default'}
                  >
                    高级筛选
                  </Button>
                  <Dropdown
                    overlay={columnSettingsMenu}
                    trigger={['click']}
                    open={settingsVisible}
                    onOpenChange={setSettingsVisible}
                  >
                    <Button icon={<SettingOutlined />} type="text">
                      列设置
                    </Button>
                  </Dropdown>
                </Space>
              }
            >
              <AntTable
                columns={columns}
                dataSource={advancedFilteredData.slice(0, 1000)}
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

      {/* 自定义列创建模态框 */}
      <Modal
        title="添加自定义列"
        open={customColumnModalVisible}
        onOk={addCustomColumn}
        onCancel={() => {
          setCustomColumnModalVisible(false)
          setNewColumnName('')
          setNewColumnExpression('')
        }}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>列名</label>
          <Input
            placeholder="例如：转化率"
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>计算表达式</label>
          <Input.TextArea
            placeholder="例如：event_type === 'purchase' ? 1 : 0&#10;&#10;可用变量：user_id, sku_id, event_type, ts, attrs, Math, Date"
            value={newColumnExpression}
            onChange={(e) => setNewColumnExpression(e.target.value)}
            rows={4}
          />
        </div>

        <Alert
          message="表达式示例"
          description={
            <div>
              <div>• <code>event_type === 'purchase' ? 1 : 0</code> - 购买事件标记</div>
              <div>• <code>attrs.price || 0</code> - 获取价格（如果存在）</div>
              <div>• <code>attrs.quantity * (attrs.price || 0)</code> - 计算总金额</div>
              <div>• <code>new Date(ts).getHours()</code> - 提取小时数</div>
            </div>
          }
          type="info"
          style={{ marginTop: 16 }}
        />
      </Modal>

      {/* 视图保存模态框 */}
      <Modal
        title="保存当前视图"
        open={viewModalVisible}
        onOk={saveCurrentView}
        onCancel={() => {
          setViewModalVisible(false)
          setNewViewName('')
        }}
        width={400}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>视图名称</label>
          <Input
            placeholder="例如：我的常用视图"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
          />
        </div>

        <Alert
          message="提示"
          description="当前列配置（包括可见性、宽度、固定、自定义列）将被保存到此视图中"
          type="info"
        />
      </Modal>

      {/* 高级筛选模态框 */}
      <Modal
        title="高级筛选"
        open={filterModalVisible}
        onOk={() => setFilterModalVisible(false)}
        onCancel={() => setFilterModalVisible(false)}
        width={700}
        footer={[
          <Button key="clear" onClick={clearAllFilters} danger>
            清除所有筛选
          </Button>,
          <Button key="close" type="primary" onClick={() => setFilterModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {filterConditions.map(condition => (
            <Card key={condition.id} size="small" style={{ backgroundColor: '#f5f5f5' }}>
              <Row gutter={8} align="middle">
                <Col span={6}>
                  <Select
                    value={condition.field}
                    onChange={(value) => updateFilterCondition(condition.id, { field: value })}
                    style={{ width: '100%' }}
                    options={[
                      { label: '用户ID', value: 'user_id' },
                      { label: 'SKU ID', value: 'sku_id' },
                      { label: '事件类型', value: 'event_type' },
                      { label: '时间', value: 'ts' },
                    ]}
                  />
                </Col>
                <Col span={5}>
                  <Select
                    value={condition.operator}
                    onChange={(value) => updateFilterCondition(condition.id, { operator: value })}
                    style={{ width: '100%' }}
                    options={[
                      { label: '等于', value: 'equals' },
                      { label: '包含', value: 'contains' },
                      { label: '大于', value: 'greaterThan' },
                      { label: '小于', value: 'lessThan' },
                      { label: '范围', value: 'between' },
                    ]}
                  />
                </Col>
                <Col span={condition.operator === 'between' ? 5 : 10}>
                  <Input
                    value={condition.value}
                    onChange={(e) => updateFilterCondition(condition.id, { value: e.target.value })}
                    placeholder="值"
                  />
                </Col>
                {condition.operator === 'between' && (
                  <Col span={5}>
                    <Input
                      value={condition.value2 || ''}
                      onChange={(e) => updateFilterCondition(condition.id, { value2: e.target.value })}
                      placeholder="值2"
                    />
                  </Col>
                )}
                <Col span={3}>
                  <Button
                    danger
                    type="text"
                    onClick={() => removeFilterCondition(condition.id)}
                  >
                    删除
                  </Button>
                </Col>
              </Row>
            </Card>
          ))}

          <Button
            type="dashed"
            block
            onClick={addFilterCondition}
          >
            + 添加筛选条件
          </Button>
        </Space>

        <Alert
          message="筛选说明"
          description={
            <div>
              <div>• 所有筛选条件使用 AND 逻辑组合</div>
              <div>• "包含" 操作不区分大小写</div>
              <div>• "范围" 操作为闭区间 [值1, 值2]</div>
            </div>
          }
          type="info"
          style={{ marginTop: 16 }}
        />
      </Modal>
    </div>
  )
}
