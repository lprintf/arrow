"""
Apache Arrow性能测试后端

提供Arrow格式的数据API，支持：
1. 广告日报表数据
2. 用户-SKU互动日志数据
"""

from fastapi import FastAPI, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from datetime import date, datetime
import pyarrow as pa
import pyarrow.ipc as ipc
import pyarrow.compute as pc
from pathlib import Path
import io

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

# 缓存加载的数据
_ad_report_table = None
_user_sku_logs_table = None


def load_ad_report():
    """加载广告日报表数据"""
    global _ad_report_table
    if _ad_report_table is None:
        with pa.memory_map(str(AD_REPORT_PATH), 'r') as source:
            _ad_report_table = ipc.open_file(source).read_all()
    return _ad_report_table


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
            "user_sku_logs": "/api/user-sku-logs",
        }
    }


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
