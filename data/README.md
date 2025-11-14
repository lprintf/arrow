# Arrow 性能测试数据

## 数据概述

本目录包含用于测试Apache Arrow性能的**百万级别**数据文件。

### 数据特点

- **数据规模**: 62万+条记录（接近百万级别）
- **时间跨度**: 一年数据（365天，13个月）
- **生命周期模拟**: 每个广告对象（campaign/ad_set/ad）都有真实的生命周期，模拟新建和关停效果
- **分片存储**: 数据按月分片，支持按需加载
- **默认加载**: 前端默认只加载最后一个月（~1.6万条，1.9MB），占总数据2.5%

### 文件结构

```
data/
├── ads.arrow                    # 全量广告数据（72MB，兼容旧版本）
├── user_sku_logs.arrow          # 用户SKU互动日志（49MB，50万条）
├── ads_shards/                  # 广告数据分片目录
│   ├── metadata.json            # 分片元数据
│   ├── ads_2024-11.arrow        # 2024年11月数据（32条）
│   ├── ads_2024-12.arrow        # 2024年12月数据（1,632条）
│   ├── ...                      # 其他月份数据
│   ├── ads_2025-09.arrow        # 2025年9月数据（峰值：109,829条，12.7MB）
│   └── ads_2025-11.arrow        # 2025年11月数据（15,822条，1.9MB）
├── generate_data.py             # 数据生成脚本
└── requirements.txt             # Python依赖
```

### 数据统计

- **广告数据**: 621,971条记录
  - 500个广告系列（campaign）
  - 5,000个广告组（ad_set）
  - 25,000个广告（ad）
  - 13个月份分片（2024-11 至 2025-11）
- **用户日志**: 500,000条记录
  - 50,000个用户
  - 10,000个SKU
  - 3种事件类型（view/cart_add/purchase）

### 生命周期效果

数据量随时间变化，模拟广告新建和关停：

```
2024-11:      32 条  (初期启动)
2024-12:   1,632 条
2025-01:   7,314 条  ███
2025-02:  16,708 条  ████████
2025-03:  32,916 条  ████████████████
2025-04:  39,725 条  ███████████████████
2025-05:  51,276 条  █████████████████████████
2025-06:  61,633 条  ██████████████████████████████
2025-07:  81,206 条  ████████████████████████████████████████
2025-08:  99,222 条  █████████████████████████████████████████████████
2025-09: 109,829 条  ██████████████████████████████████████████████████████ (峰值)
2025-10: 104,656 条  ████████████████████████████████████████████████████
2025-11:  15,822 条  ███████ (大量关停)
```

### 生命周期参数

- **Campaign**: 最短60天，最长365天
- **Ad Set**: 最短30天，最长180天
- **Ad**: 最短7天，最长90天
- **关停比例**: 80%的对象会在数据期内关停，20%持续到最后

## 使用方法

### 重新生成数据

```bash
cd /path/to/data
uv run generate_data.py
```

生成过程会：
1. 创建一年的广告数据，包含生命周期
2. 保存全量文件 `ads.arrow`
3. 按月分片保存到 `ads_shards/` 目录
4. 生成用户SKU互动日志

### API使用

#### 1. 获取分片元数据

```bash
curl http://localhost:8000/api/ad-report/shards/metadata
```

返回：
```json
{
  "months": ["2024-12", "2025-01", ..., "2025-11"],
  "total_records": 36362,
  "total_size_mb": 4.25
}
```

#### 2. 加载特定月份

```bash
# 加载单个月份
curl http://localhost:8000/api/ad-report/shards?months=2025-08

# 加载多个月份
curl http://localhost:8000/api/ad-report/shards?months=2025-01,2025-02,2025-03

# 加载所有月份（不指定months参数）
curl http://localhost:8000/api/ad-report/shards
```

#### 3. 结合日期过滤

```bash
# 加载Q1数据，但只筛选2月份的记录
curl "http://localhost:8000/api/ad-report/shards?months=2025-01,2025-02,2025-03&start_date=2025-02-01&end_date=2025-02-28"
```

### 前端集成示例

```typescript
// 1. 获取可用月份
const metadata = await fetch('/api/ad-report/shards/metadata').then(r => r.json())
console.log('可用月份:', metadata.months)

// 2. 按需加载最近3个月
const recentMonths = metadata.months.slice(-3).join(',')
const response = await fetch(`/api/ad-report/shards?months=${recentMonths}`)
const arrayBuffer = await response.arrayBuffer()
const table = tableFromIPC(arrayBuffer)

// 3. 渐进式加载：先加载最近一个月，再按需加载更多
const latestMonth = metadata.months[metadata.months.length - 1]
const latestData = await fetchArrowData(`/api/ad-report/shards?months=${latestMonth}`)

// 用户滚动或选择日期范围时，加载更多月份
function loadMoreMonths(startMonth: string, endMonth: string) {
  const monthsToLoad = getMonthsBetween(startMonth, endMonth)
  return fetchArrowData(`/api/ad-report/shards?months=${monthsToLoad.join(',')}`)
}
```

## 性能优化建议

1. **按需加载**: 默认只加载最近的月份，用户需要时再加载历史数据
2. **缓存策略**: 在前端缓存已加载的月份数据
3. **虚拟滚动**: 对于大量数据，使用虚拟滚动来渲染表格
4. **Web Worker**: 在Worker中处理Arrow数据解析和聚合，避免阻塞UI线程

## Schema

### ads.arrow / ads_shards/*.arrow

| 字段 | 类型 | 说明 |
|-----|------|------|
| date | date32 | 日期 |
| advertiser_id | string | 广告主ID |
| campaign_id | string | 广告系列ID |
| campaign_type | string | 广告类型 (search/display/video/shopping) |
| ad_set_id | string | 广告组ID |
| ad_id | string | 广告ID |
| cost | float32 | 花费 |
| impressions | int32 | 曝光量 |
| reach | int32 | 触达人数 |
| clicks | int32 | 点击量 |
| inline_link_clicks | int32 | 内链点击 |
| outbound_clicks | int32 | 出站点击 |
| landing_page_view | int32 | 落地页浏览 |
| onsite_web_checkout | int32 | 网站结账 |
| onsite_web_add_to_cart | int32 | 加购 |
| conversions | int32 | 转化量 |
| onsite_web_checkout_value | float32 | 结账金额 |
| onsite_web_add_to_cart_value | float32 | 加购金额 |
| gmv | float32 | GMV |

### user_sku_logs.arrow

| 字段 | 类型 | 说明 |
|-----|------|------|
| ts | timestamp | 时间戳 |
| user_id | string | 用户ID |
| sku_id | string | SKU ID |
| event_type | string | 事件类型 (view/cart_add/purchase) |
| campaign_id | string | 归因广告系列ID |
| ad_set_id | string | 归因广告组ID |
| ad_id | string | 归因广告ID |
| attrs | string | 扩展属性（JSON字符串） |
