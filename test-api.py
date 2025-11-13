#!/usr/bin/env python3
"""
Apache Arrow 性能测试 API 测试脚本

用法:
    python test-api.py                                    # 使用默认配置
    python test-api.py --base-url https://arrow-dev.mydomain.com  # 自定义URL
"""

import argparse
import asyncio
import httpx
import sys
from datetime import date, datetime, timedelta


# 默认配置
DEFAULT_BASE_URL = "https://arrow-dev.127.0.0.1.sslip.io"


async def test_health_check(client: httpx.AsyncClient, base_url: str):
    """测试健康检查端点"""
    print("\n" + "=" * 60)
    print("1. 测试健康检查")
    print("=" * 60)

    try:
        response = await client.get(f"{base_url}/")
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")
        assert response.status_code == 200
        print("✓ 健康检查通过")
    except Exception as e:
        print(f"✗ 健康检查失败: {e}")
        raise


async def test_stats(client: httpx.AsyncClient, base_url: str):
    """测试统计信息端点"""
    print("\n" + "=" * 60)
    print("2. 测试统计信息")
    print("=" * 60)

    try:
        response = await client.get(f"{base_url}/api/stats")
        print(f"状态码: {response.status_code}")
        data = response.json()

        print(f"\n广告日报表:")
        print(f"  - 总记录数: {data['ad_report']['total_rows']}")
        print(f"  - 文件大小: {data['ad_report']['file_size_mb']:.2f} MB")

        print(f"\n用户-SKU日志:")
        print(f"  - 总记录数: {data['user_sku_logs']['total_rows']}")
        print(f"  - 文件大小: {data['user_sku_logs']['file_size_mb']:.2f} MB")

        assert response.status_code == 200
        assert data['ad_report']['total_rows'] > 0
        assert data['user_sku_logs']['total_rows'] > 0
        print("\n✓ 统计信息获取成功")
    except Exception as e:
        print(f"✗ 统计信息获取失败: {e}")
        raise


async def test_ad_report(client: httpx.AsyncClient, base_url: str):
    """测试广告日报表端点"""
    print("\n" + "=" * 60)
    print("3. 测试广告日报表 API")
    print("=" * 60)

    try:
        # 测试1: 获取所有数据
        print("\n测试 3.1: 获取所有数据")
        response = await client.get(f"{base_url}/api/ad-report")
        print(f"状态码: {response.status_code}")
        print(f"Content-Type: {response.headers.get('content-type')}")
        print(f"Content-Length: {int(response.headers.get('content-length', 0)) / 1024:.2f} KB")
        print(f"X-Row-Count: {response.headers.get('x-row-count')}")
        assert response.status_code == 200
        assert response.headers.get('content-type') == 'application/vnd.apache.arrow.stream'
        print("✓ 获取所有数据成功")

        # 测试2: 按日期范围筛选
        print("\n测试 3.2: 按日期范围筛选")
        end_date = date.today()
        start_date = end_date - timedelta(days=7)
        response = await client.get(
            f"{base_url}/api/ad-report",
            params={
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat()
            }
        )
        print(f"状态码: {response.status_code}")
        print(f"筛选条件: {start_date} 到 {end_date}")
        print(f"X-Row-Count: {response.headers.get('x-row-count')}")
        assert response.status_code == 200
        print("✓ 日期筛选成功")

        # 测试3: 按计划类型筛选
        print("\n测试 3.3: 按计划类型筛选")
        response = await client.get(
            f"{base_url}/api/ad-report",
            params={"campaign_type": "search"}
        )
        print(f"状态码: {response.status_code}")
        print(f"筛选条件: campaign_type=search")
        print(f"X-Row-Count: {response.headers.get('x-row-count')}")
        assert response.status_code == 200
        print("✓ 类型筛选成功")

    except Exception as e:
        print(f"✗ 广告日报表测试失败: {e}")
        raise


async def test_user_sku_logs(client: httpx.AsyncClient, base_url: str):
    """测试用户-SKU日志端点"""
    print("\n" + "=" * 60)
    print("4. 测试用户-SKU日志 API")
    print("=" * 60)

    try:
        # 测试1: 获取限制数量的数据
        print("\n测试 4.1: 获取限制数量的数据")
        response = await client.get(
            f"{base_url}/api/user-sku-logs",
            params={"limit": 1000}
        )
        print(f"状态码: {response.status_code}")
        print(f"Content-Type: {response.headers.get('content-type')}")
        print(f"X-Row-Count: {response.headers.get('x-row-count')}")
        assert response.status_code == 200
        assert response.headers.get('content-type') == 'application/vnd.apache.arrow.stream'
        print("✓ 限制数量获取成功")

        # 测试2: 按事件类型筛选
        print("\n测试 4.2: 按事件类型筛选")
        for event_type in ['view', 'cart_add', 'purchase']:
            response = await client.get(
                f"{base_url}/api/user-sku-logs",
                params={"event_type": event_type, "limit": 100}
            )
            print(f"  {event_type}: {response.headers.get('x-row-count')} 条记录")
            assert response.status_code == 200
        print("✓ 事件类型筛选成功")

        # 测试3: 按时间范围筛选
        print("\n测试 4.3: 按时间范围筛选")
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=24)
        response = await client.get(
            f"{base_url}/api/user-sku-logs",
            params={
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "limit": 1000
            }
        )
        print(f"状态码: {response.status_code}")
        print(f"筛选条件: 最近24小时")
        print(f"X-Row-Count: {response.headers.get('x-row-count')}")
        assert response.status_code == 200
        print("✓ 时间筛选成功")

    except Exception as e:
        print(f"✗ 用户-SKU日志测试失败: {e}")
        raise


async def run_tests(base_url: str):
    """运行所有测试"""
    print("=" * 60)
    print("Apache Arrow 性能测试 API 测试")
    print("=" * 60)
    print(f"目标URL: {base_url}")
    print(f"说明: 使用开发路由，直接访问后端API")

    # 创建 httpx 客户端（禁用SSL验证，因为使用自签名证书）
    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        try:
            await test_health_check(client, base_url)
            await test_stats(client, base_url)
            await test_ad_report(client, base_url)
            await test_user_sku_logs(client, base_url)

            print("\n" + "=" * 60)
            print("✓ 所有测试通过！")
            print("=" * 60)
            return 0

        except Exception as e:
            print("\n" + "=" * 60)
            print(f"✗ 测试失败: {e}")
            print("=" * 60)
            return 1


def main():
    parser = argparse.ArgumentParser(description="Apache Arrow 性能测试 API 测试脚本")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"API 基础 URL (默认: {DEFAULT_BASE_URL})"
    )

    args = parser.parse_args()

    # 运行异步测试
    exit_code = asyncio.run(run_tests(args.base_url))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
