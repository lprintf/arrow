"""
Apache Arrow性能测试后端

提供Arrow格式的数据API，支持：
1. 广告日报表数据（支持分片加载）
2. 用户-SKU互动日志数据
"""

from fastapi import FastAPI, Query, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from datetime import date, datetime
import pyarrow as pa
import pyarrow.ipc as ipc
import pyarrow.compute as pc
from pathlib import Path
import io
import json

app = FastAPI(title="Arrow Performance Test API")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 数据文件路径
DATA_DIR = Path(__file__).parent.parent / "data"
AD_REPORT_PATH = DATA_DIR / "ads.arrow"
USER_SKU_LOGS_PATH = DATA_DIR / "user_sku_logs.arrow"
ADS_SHARDS_DIR = DATA_DIR / "ads_shards"

# 缓存加载的数据
_ad_report_table = None
_user_sku_logs_table = None
_shards_metadata = None


def load_ad_report():
    """加载广告日报表数据"""
    global _ad_report_table
    if _ad_report_table is None:
        with pa.memory_map(str(AD_REPORT_PATH), 'r') as source:
            _ad_report_table = ipc.open_file(source).read_all()
    return _ad_report_table


def load_shards_metadata():
    """加载分片元数据"""
    global _shards_metadata
    if _shards_metadata is None:
        metadata_path = ADS_SHARDS_DIR / "metadata.json"
        if metadata_path.exists():
            with open(metadata_path) as f:
                _shards_metadata = json.load(f)
    return _shards_metadata


def load_ad_report_shard(year_month: str):
    """加载指定月份的广告数据分片"""
    shard_path = ADS_SHARDS_DIR / f"ads_{year_month}.arrow"
    if not shard_path.exists():
        raise FileNotFoundError(f"Shard not found: {year_month}")

    with pa.memory_map(str(shard_path), 'r') as source:
        return ipc.open_file(source).read_all()


def load_ad_report_shards(year_months: list[str]):
    """加载多个月份的广告数据并合并"""
    tables = []
    for year_month in year_months:
        try:
            table = load_ad_report_shard(year_month)
            tables.append(table)
        except FileNotFoundError:
            continue

    if not tables:
        raise ValueError("No valid shards found")

    # 合并所有表
    return pa.concat_tables(tables)


def load_user_sku_logs():
    """加载用户-SKU互动日志数据"""
    global _user_sku_logs_table
    if _user_sku_logs_table is None:
        with pa.memory_map(str(USER_SKU_LOGS_PATH), 'r') as source:
            _user_sku_logs_table = ipc.open_file(source).read_all()
    return _user_sku_logs_table


@app.get("/")
async def root():
    """健康检查"""
    return {
        "service": "Arrow Performance Test API",
        "status": "ok",
        "endpoints": {
            "ad_report": "/api/ad-report",
            "ad_report_shards_metadata": "/api/ad-report/shards/metadata",
            "ad_report_shards": "/api/ad-report/shards",
            "user_sku_logs": "/api/user-sku-logs",
        }
    }


@app.get("/api/ad-report/shards/metadata")
async def get_ad_report_shards_metadata():
    """
    获取广告数据分片元数据

    返回可用的月份列表和统计信息
    """
    metadata = load_shards_metadata()
    if not metadata:
        raise HTTPException(status_code=404, detail="Shards metadata not found")

    return metadata


@app.get("/api/ad-report/shards")
async def get_ad_report_shards(
    months: str | None = Query(None, description="要加载的月份，逗号分隔，如 '2025-01,2025-02'"),
    start_date: date | None = Query(None, description="开始日期"),
    end_date: date | None = Query(None, description="结束日期"),
    advertiser_id: str | None = Query(None, description="广告主ID"),
    campaign_type: str | None = Query(None, description="计划类型"),
):
    """
    获取广告日报表分片数据（Arrow格式）

    支持参数：
    - months: 要加载的月份（逗号分隔），例如 "2025-01,2025-02,2025-03"
    - start_date: 开始日期
    - end_date: 结束日期
    - advertiser_id: 广告主ID
    - campaign_type: 计划类型

    如果不指定months，将加载所有可用月份
    """
    try:
        # 确定要加载的月份
        if months:
            year_months = [m.strip() for m in months.split(',')]
        else:
            # 加载所有可用月份
            metadata = load_shards_metadata()
            if not metadata:
                raise HTTPException(status_code=404, detail="Shards metadata not found")
            year_months = metadata['months']

        # 加载分片数据
        table = load_ad_report_shards(year_months)

        # 应用过滤条件
        if start_date:
            mask = pc.greater_equal(table['date'], pa.scalar(start_date))
            table = table.filter(mask)

        if end_date:
            mask = pc.less_equal(table['date'], pa.scalar(end_date))
            table = table.filter(mask)

        if advertiser_id:
            mask = pc.equal(table['advertiser_id'], pa.scalar(advertiser_id))
            table = table.filter(mask)

        if campaign_type:
            mask = pc.equal(table['campaign_type'], pa.scalar(campaign_type))
            table = table.filter(mask)

        # 序列化为Arrow IPC格式
        sink = io.BytesIO()
        with ipc.new_stream(sink, table.schema) as writer:
            writer.write_table(table)

        arrow_data = sink.getvalue()

        return Response(
            content=arrow_data,
            media_type="application/vnd.apache.arrow.stream",
            headers={
                "Content-Length": str(len(arrow_data)),
                "X-Row-Count": str(len(table)),
                "X-Loaded-Months": ",".join(year_months),
            }
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/ad-report")
async def get_ad_report(
    start_date: date | None = Query(None, description="开始日期"),
    end_date: date | None = Query(None, description="结束日期"),
    advertiser_id: int | None = Query(None, description="广告主ID"),
    campaign_type: str | None = Query(None, description="计划类型"),
):
    """
    获取广告日报表数据（Arrow格式）

    支持参数：
    - start_date: 开始日期
    - end_date: 结束日期
    - advertiser_id: 广告主ID
    - campaign_type: 计划类型
    """
    table = load_ad_report()

    # 应用过滤条件
    if start_date:
        mask = pc.greater_equal(table['date'], pa.scalar(start_date))
        table = table.filter(mask)

    if end_date:
        mask = pc.less_equal(table['date'], pa.scalar(end_date))
        table = table.filter(mask)

    if advertiser_id:
        mask = pc.equal(table['advertiser_id'], pa.scalar(advertiser_id))
        table = table.filter(mask)

    if campaign_type:
        mask = pc.equal(table['campaign_type'], pa.scalar(campaign_type))
        table = table.filter(mask)

    # 序列化为Arrow IPC格式
    sink = io.BytesIO()
    with ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)

    arrow_data = sink.getvalue()

    return Response(
        content=arrow_data,
        media_type="application/vnd.apache.arrow.stream",
        headers={
            "Content-Length": str(len(arrow_data)),
            "X-Row-Count": str(len(table)),
        }
    )


@app.get("/api/user-sku-logs")
async def get_user_sku_logs(
    start_time: datetime | None = Query(None, description="开始时间"),
    end_time: datetime | None = Query(None, description="结束时间"),
    event_type: str | None = Query(None, description="事件类型: view, cart_add, purchase"),
    limit: int | None = Query(None, description="限制返回记录数"),
):
    """
    获取用户-SKU互动日志数据（Arrow格式）

    支持参数：
    - start_time: 开始时间
    - end_time: 结束时间
    - event_type: 事件类型
    - limit: 限制返回记录数
    """
    table = load_user_sku_logs()

    # 应用过滤条件
    if start_time:
        mask = pc.greater_equal(table['ts'], pa.scalar(start_time))
        table = table.filter(mask)

    if end_time:
        mask = pc.less_equal(table['ts'], pa.scalar(end_time))
        table = table.filter(mask)

    if event_type:
        mask = pc.equal(table['event_type'], pa.scalar(event_type))
        table = table.filter(mask)

    # 限制返回记录数
    if limit and limit > 0:
        table = table.slice(0, min(limit, len(table)))

    # 序列化为Arrow IPC格式
    sink = io.BytesIO()
    with ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)

    arrow_data = sink.getvalue()

    return Response(
        content=arrow_data,
        media_type="application/vnd.apache.arrow.stream",
        headers={
            "Content-Length": str(len(arrow_data)),
            "X-Row-Count": str(len(table)),
        }
    )


@app.get("/api/stats")
async def get_stats():
    """获取数据统计信息"""
    ad_report = load_ad_report()
    user_sku_logs = load_user_sku_logs()

    return {
        "ad_report": {
            "total_rows": len(ad_report),
            "file_size_mb": AD_REPORT_PATH.stat().st_size / 1024 / 1024,
            "schema": str(ad_report.schema),
        },
        "user_sku_logs": {
            "total_rows": len(user_sku_logs),
            "file_size_mb": USER_SKU_LOGS_PATH.stat().st_size / 1024 / 1024,
            "schema": str(user_sku_logs.schema),
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
