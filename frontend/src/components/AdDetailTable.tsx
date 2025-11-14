import { useState, useMemo } from 'react'
import { Card, Tabs, Table, Modal, Button, Space, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import ReactECharts from 'echarts-for-react'
import * as aq from 'arquero'

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

interface AggregatedRow {
  id: string
  name: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  gmv: number
  ctr: number
  cvr: number
  roi: number
  // 用于筛选的关联字段
  advertiser_id?: string
  campaign_id?: string
  ad_set_id?: string
}

interface DetailData {
  date: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  gmv: number
}

interface AdDetailTableProps {
  data: AdReportRow[]
}

export default function AdDetailTable({ data }: AdDetailTableProps) {
  const [activeTab, setActiveTab] = useState('ad_account')

  // 对话框状态
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<AggregatedRow | null>(null)
  const [selectedRecordDetails, setSelectedRecordDetails] = useState<DetailData[]>([])

  // 各层级选中状态
  const [selectedAdAccounts, setSelectedAdAccounts] = useState<React.Key[]>([])
  const [selectedCampaigns, setSelectedCampaigns] = useState<React.Key[]>([])
  const [selectedAdSets, setSelectedAdSets] = useState<React.Key[]>([])
  const [selectedAds, setSelectedAds] = useState<React.Key[]>([])

  // ad_account 层级数据聚合
  const adAccountData = useMemo(() => {
    if (data.length === 0) return []

    const dt = aq.from(data)
    const aggregated = dt
      .groupby('advertiser_id')
      .rollup({
        impressions: aq.op.sum('impressions'),
        clicks: aq.op.sum('clicks'),
        cost: aq.op.sum('cost'),
        conversions: aq.op.sum('conversions'),
        gmv: aq.op.sum('gmv'),
      })
      .objects()

    return aggregated.map((row: any) => ({
      id: row.advertiser_id,
      name: `账户 ${row.advertiser_id}`,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      conversions: row.conversions,
      gmv: row.gmv,
      ctr: (row.clicks / row.impressions) * 100,
      cvr: (row.conversions / row.clicks) * 100,
      roi: (row.gmv / row.cost - 1) * 100,
    })) as AggregatedRow[]
  }, [data])

  // campaign 层级数据聚合
  const campaignData = useMemo(() => {
    if (data.length === 0) return []

    // 如果选中了 ad_account，只显示这些账户下的 campaigns
    let filteredData = data
    if (selectedAdAccounts.length > 0) {
      filteredData = data.filter(row => selectedAdAccounts.includes(row.advertiser_id))
    }

    const dt = aq.from(filteredData)
    const aggregated = dt
      .groupby('campaign_id', 'campaign_type', 'advertiser_id')
      .rollup({
        impressions: aq.op.sum('impressions'),
        clicks: aq.op.sum('clicks'),
        cost: aq.op.sum('cost'),
        conversions: aq.op.sum('conversions'),
        gmv: aq.op.sum('gmv'),
      })
      .objects()

    return aggregated.map((row: any) => ({
      id: row.campaign_id,
      name: `Campaign ${row.campaign_id} (${row.campaign_type})`,
      advertiser_id: row.advertiser_id,
      campaign_id: row.campaign_id,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      conversions: row.conversions,
      gmv: row.gmv,
      ctr: (row.clicks / row.impressions) * 100,
      cvr: (row.conversions / row.clicks) * 100,
      roi: (row.gmv / row.cost - 1) * 100,
    })) as AggregatedRow[]
  }, [data, selectedAdAccounts])

  // ad_set 层级数据聚合（使用真实数据）
  const adSetData = useMemo(() => {
    if (data.length === 0) return []

    // 应用完整的筛选链条
    let filteredData = data

    // 1. 首先应用 Ad Account 筛选
    if (selectedAdAccounts.length > 0) {
      filteredData = filteredData.filter(row => selectedAdAccounts.includes(row.advertiser_id))
    }

    // 2. 然后应用 Campaign 筛选
    if (selectedCampaigns.length > 0) {
      filteredData = filteredData.filter(row => selectedCampaigns.includes(row.campaign_id))
    }

    const dt = aq.from(filteredData)
    const aggregated = dt
      .groupby('ad_set_id', 'campaign_id')
      .rollup({
        impressions: aq.op.sum('impressions'),
        clicks: aq.op.sum('clicks'),
        cost: aq.op.sum('cost'),
        conversions: aq.op.sum('conversions'),
        gmv: aq.op.sum('gmv'),
      })
      .objects()

    return aggregated.map((row: any) => ({
      id: row.ad_set_id,
      name: `Ad Set ${row.ad_set_id}`,
      campaign_id: row.campaign_id,
      ad_set_id: row.ad_set_id,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      conversions: row.conversions,
      gmv: row.gmv,
      ctr: (row.clicks / row.impressions) * 100,
      cvr: (row.conversions / row.clicks) * 100,
      roi: (row.gmv / row.cost - 1) * 100,
    })) as AggregatedRow[]
  }, [data, selectedAdAccounts, selectedCampaigns])

  // ad 层级数据聚合（使用真实数据）
  const adData = useMemo(() => {
    if (data.length === 0) return []

    // 应用完整的筛选链条
    let filteredData = data

    // 1. 首先应用 Ad Account 筛选
    if (selectedAdAccounts.length > 0) {
      filteredData = filteredData.filter(row => selectedAdAccounts.includes(row.advertiser_id))
    }

    // 2. 然后应用 Campaign 筛选
    if (selectedCampaigns.length > 0) {
      filteredData = filteredData.filter(row => selectedCampaigns.includes(row.campaign_id))
    }

    // 3. 应用 Ad Set 筛选
    if (selectedAdSets.length > 0) {
      filteredData = filteredData.filter(row => selectedAdSets.includes(row.ad_set_id))
    }

    const dt = aq.from(filteredData)
    const aggregated = dt
      .groupby('ad_id', 'ad_set_id', 'campaign_id')
      .rollup({
        impressions: aq.op.sum('impressions'),
        clicks: aq.op.sum('clicks'),
        cost: aq.op.sum('cost'),
        conversions: aq.op.sum('conversions'),
        gmv: aq.op.sum('gmv'),
      })
      .objects()

    return aggregated.map((row: any) => ({
      id: row.ad_id,
      name: `Ad ${row.ad_id}`,
      campaign_id: row.campaign_id,
      ad_set_id: row.ad_set_id,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      conversions: row.conversions,
      gmv: row.gmv,
      ctr: (row.clicks / row.impressions) * 100,
      cvr: (row.conversions / row.clicks) * 100,
      roi: (row.gmv / row.cost - 1) * 100,
    })) as AggregatedRow[]
  }, [data, selectedAdAccounts, selectedCampaigns, selectedAdSets])

  // 表格列定义
  const columns: ColumnsType<AggregatedRow> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      fixed: 'left',
    },
    {
      title: '曝光量',
      dataIndex: 'impressions',
      key: 'impressions',
      width: 120,
      sorter: (a, b) => a.impressions - b.impressions,
    },
    {
      title: '点击量',
      dataIndex: 'clicks',
      key: 'clicks',
      width: 120,
      sorter: (a, b) => a.clicks - b.clicks,
    },
    {
      title: '点击率',
      dataIndex: 'ctr',
      key: 'ctr',
      width: 100,
      render: (v: number) => `${v.toFixed(2)}%`,
      sorter: (a, b) => a.ctr - b.ctr,
    },
    {
      title: '花费',
      dataIndex: 'cost',
      key: 'cost',
      width: 120,
      render: (v: number) => `¥${v.toFixed(2)}`,
      sorter: (a, b) => a.cost - b.cost,
    },
    {
      title: '转化量',
      dataIndex: 'conversions',
      key: 'conversions',
      width: 120,
      sorter: (a, b) => a.conversions - b.conversions,
    },
    {
      title: '转化率',
      dataIndex: 'cvr',
      key: 'cvr',
      width: 100,
      render: (v: number) => `${v.toFixed(2)}%`,
      sorter: (a, b) => a.cvr - b.cvr,
    },
    {
      title: 'GMV',
      dataIndex: 'gmv',
      key: 'gmv',
      width: 140,
      render: (v: number) => `¥${v.toFixed(2)}`,
      sorter: (a, b) => a.gmv - b.gmv,
    },
    {
      title: 'ROI',
      dataIndex: 'roi',
      key: 'roi',
      width: 100,
      render: (v: number) => `${v.toFixed(2)}%`,
      sorter: (a, b) => a.roi - b.roi,
    },
  ]

  // 处理行点击
  const handleRowClick = (record: AggregatedRow) => {
    // 根据当前标签页和记录ID，筛选明细数据
    let details: DetailData[] = []

    if (activeTab === 'ad_account') {
      const dt = aq.from(data.filter(row => row.advertiser_id === record.id))
      details = dt
        .groupby('date')
        .rollup({
          impressions: aq.op.sum('impressions'),
          clicks: aq.op.sum('clicks'),
          cost: aq.op.sum('cost'),
          conversions: aq.op.sum('conversions'),
          gmv: aq.op.sum('gmv'),
        })
        .orderby('date')
        .objects() as DetailData[]
    } else if (activeTab === 'campaign') {
      const dt = aq.from(data.filter(row => row.campaign_id === record.id))
      details = dt
        .groupby('date')
        .rollup({
          impressions: aq.op.sum('impressions'),
          clicks: aq.op.sum('clicks'),
          cost: aq.op.sum('cost'),
          conversions: aq.op.sum('conversions'),
          gmv: aq.op.sum('gmv'),
        })
        .orderby('date')
        .objects() as DetailData[]
    } else if (activeTab === 'ad_set') {
      // ad_set 层级 - 使用真实数据
      const dt = aq.from(data.filter(row => row.ad_set_id === record.id))
      details = dt
        .groupby('date')
        .rollup({
          impressions: aq.op.sum('impressions'),
          clicks: aq.op.sum('clicks'),
          cost: aq.op.sum('cost'),
          conversions: aq.op.sum('conversions'),
          gmv: aq.op.sum('gmv'),
        })
        .orderby('date')
        .objects() as DetailData[]
    } else if (activeTab === 'ad') {
      // ad 层级 - 使用真实数据
      const dt = aq.from(data.filter(row => row.ad_id === record.id))
      details = dt
        .groupby('date')
        .rollup({
          impressions: aq.op.sum('impressions'),
          clicks: aq.op.sum('clicks'),
          cost: aq.op.sum('cost'),
          conversions: aq.op.sum('conversions'),
          gmv: aq.op.sum('gmv'),
        })
        .orderby('date')
        .objects() as DetailData[]
    }

    setSelectedRecord(record)
    setSelectedRecordDetails(details)
    setModalVisible(true)
  }

  // 趋势图表配置
  const trendChartOption = useMemo(() => {
    if (selectedRecordDetails.length === 0) return null

    return {
      title: { text: '指标趋势' },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
      },
      legend: {
        data: ['曝光量', '点击量', '转化量', 'GMV', '花费'],
        top: 30,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: 'none',
          },
          restore: {},
          saveAsImage: {},
        },
      },
      xAxis: {
        type: 'category',
        data: selectedRecordDetails.map(d => d.date),
        boundaryGap: false,
      },
      yAxis: [
        {
          type: 'value',
          name: '曝光/点击/转化',
          position: 'left',
        },
        {
          type: 'value',
          name: 'GMV/花费',
          position: 'right',
        },
      ],
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
        },
        {
          start: 0,
          end: 100,
        },
      ],
      series: [
        {
          name: '曝光量',
          type: 'line',
          data: selectedRecordDetails.map(d => d.impressions),
          smooth: true,
        },
        {
          name: '点击量',
          type: 'line',
          data: selectedRecordDetails.map(d => d.clicks),
          smooth: true,
        },
        {
          name: '转化量',
          type: 'line',
          data: selectedRecordDetails.map(d => d.conversions),
          smooth: true,
        },
        {
          name: 'GMV',
          type: 'line',
          yAxisIndex: 1,
          data: selectedRecordDetails.map(d => d.gmv.toFixed(2)),
          smooth: true,
        },
        {
          name: '花费',
          type: 'line',
          yAxisIndex: 1,
          data: selectedRecordDetails.map(d => d.cost.toFixed(2)),
          smooth: true,
        },
      ],
    }
  }, [selectedRecordDetails])

  // 获取当前标签页的数据
  const getCurrentTabData = () => {
    switch (activeTab) {
      case 'ad_account':
        return adAccountData
      case 'campaign':
        return campaignData
      case 'ad_set':
        return adSetData
      case 'ad':
        return adData
      default:
        return []
    }
  }

  // 分页配置（遵循 Ant Design 最佳实践）
  const paginationConfig = {
    defaultPageSize: 20,
    pageSizeOptions: ['20', '50', '100', '200'],
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total: number, range: [number, number]) =>
      `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
  }

  const tabItems = [
    {
      key: 'ad_account',
      label: 'Ad Account',
      children: (
        <Table
          columns={columns}
          dataSource={getCurrentTabData()}
          rowKey="id"
          pagination={paginationConfig}
          scroll={{ x: 1200, y: 400 }}
          size="small"
          rowSelection={{
            selectedRowKeys: selectedAdAccounts,
            onChange: (selectedRowKeys) => {
              setSelectedAdAccounts(selectedRowKeys)
              // 清除下层级的选择
              setSelectedCampaigns([])
              setSelectedAdSets([])
              setSelectedAds([])
            },
          }}
          onRow={(record) => ({
            onDoubleClick: () => handleRowClick(record),
          })}
        />
      ),
    },
    {
      key: 'campaign',
      label: 'Campaign',
      children: (
        <Table
          columns={columns}
          dataSource={getCurrentTabData()}
          rowKey="id"
          pagination={paginationConfig}
          scroll={{ x: 1200, y: 400 }}
          size="small"
          rowSelection={{
            selectedRowKeys: selectedCampaigns,
            onChange: (selectedRowKeys) => {
              setSelectedCampaigns(selectedRowKeys)
              // 清除下层级的选择
              setSelectedAdSets([])
              setSelectedAds([])
            },
          }}
          onRow={(record) => ({
            onDoubleClick: () => handleRowClick(record),
          })}
        />
      ),
    },
    {
      key: 'ad_set',
      label: 'Ad Set',
      children: (
        <Table
          columns={columns}
          dataSource={getCurrentTabData()}
          rowKey="id"
          pagination={paginationConfig}
          scroll={{ x: 1200, y: 400 }}
          size="small"
          rowSelection={{
            selectedRowKeys: selectedAdSets,
            onChange: (selectedRowKeys) => {
              setSelectedAdSets(selectedRowKeys)
              // 清除下层级的选择
              setSelectedAds([])
            },
          }}
          onRow={(record) => ({
            onDoubleClick: () => handleRowClick(record),
          })}
        />
      ),
    },
    {
      key: 'ad',
      label: 'Ad',
      children: (
        <Table
          columns={columns}
          dataSource={getCurrentTabData()}
          rowKey="id"
          pagination={paginationConfig}
          scroll={{ x: 1200, y: 400 }}
          size="small"
          rowSelection={{
            selectedRowKeys: selectedAds,
            onChange: setSelectedAds,
          }}
          onRow={(record) => ({
            onDoubleClick: () => handleRowClick(record),
          })}
        />
      ),
    },
  ]

  // 清除所有选择
  const handleClearSelections = () => {
    setSelectedAdAccounts([])
    setSelectedCampaigns([])
    setSelectedAdSets([])
    setSelectedAds([])
  }

  return (
    <>
      <Card
        title={`数据明细（共 ${data.length} 条）`}
        extra={
          <Space>
            {selectedAdAccounts.length > 0 && (
              <Tag color="blue">Ad Account: {selectedAdAccounts.length} 选中</Tag>
            )}
            {selectedCampaigns.length > 0 && (
              <Tag color="green">Campaign: {selectedCampaigns.length} 选中</Tag>
            )}
            {selectedAdSets.length > 0 && (
              <Tag color="orange">Ad Set: {selectedAdSets.length} 选中</Tag>
            )}
            {selectedAds.length > 0 && (
              <Tag color="purple">Ad: {selectedAds.length} 选中</Tag>
            )}
            {(selectedAdAccounts.length > 0 || selectedCampaigns.length > 0 ||
              selectedAdSets.length > 0 || selectedAds.length > 0) && (
              <Button size="small" onClick={handleClearSelections}>
                清除所有选择
              </Button>
            )}
          </Space>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>

      <Modal
        title={selectedRecord ? `${selectedRecord.name} - 详细数据` : '详细数据'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={1000}
        footer={null}
      >
        {selectedRecord && (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div>
                  <div style={{ color: '#999', fontSize: '12px' }}>总曝光量</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    {selectedRecord.impressions.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#999', fontSize: '12px' }}>总点击量</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    {selectedRecord.clicks.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#999', fontSize: '12px' }}>总花费</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    ¥{selectedRecord.cost.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#999', fontSize: '12px' }}>总GMV</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    ¥{selectedRecord.gmv.toFixed(2)}
                  </div>
                </div>
              </div>
            </Card>

            {trendChartOption && (
              <ReactECharts
                option={trendChartOption}
                style={{ height: 450 }}
                opts={{ renderer: 'canvas' }}
              />
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
