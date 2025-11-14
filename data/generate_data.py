"""
生成Apache Arrow性能测试数据

生成两类数据：
1. 广告日报表数据（密集数据）
2. 用户-SKU互动日志数据（稀疏数据）
"""

import pyarrow as pa
import pyarrow.parquet as pq
import numpy as np
import random
from datetime import datetime, timedelta
import json

def generate_base_metrics():
    """
    生成广告层级的基础指标

    Returns:
        dict: 包含13个基础指标的字典
    """
    impressions = random.randint(1000, 100000)
    reach = int(impressions * random.uniform(0.3, 0.8))  # 触达人数通常小于曝光量
    clicks = int(impressions * random.uniform(0.01, 0.1))  # 点击率 1%-10%
    inline_link_clicks = int(clicks * random.uniform(0.6, 0.9))  # 内链点击占比 60%-90%
    outbound_clicks = int(clicks * random.uniform(0.1, 0.4))  # 出站点击占比 10%-40%
    landing_page_view = int(outbound_clicks * random.uniform(0.7, 0.95))  # 落地页浏览率 70%-95%
    onsite_web_add_to_cart = int(landing_page_view * random.uniform(0.05, 0.2))  # 加购率 5%-20%
    onsite_web_checkout = int(onsite_web_add_to_cart * random.uniform(0.3, 0.6))  # 结账率 30%-60%
    onsite_web_purchase = int(onsite_web_checkout * random.uniform(0.5, 0.9))  # 购买完成率 50%-90%

    spend = round(clicks * random.uniform(0.5, 5.0), 2)  # 每次点击成本
    onsite_web_add_to_cart_value = round(onsite_web_add_to_cart * random.uniform(30, 200), 2)
    onsite_web_checkout_value = round(onsite_web_checkout * random.uniform(50, 300), 2)
    onsite_web_purchase_value = round(onsite_web_purchase * random.uniform(50, 500), 2)

    return {
        'cost': spend,  # 前端使用 cost 字段
        'impressions': impressions,
        'reach': reach,
        'clicks': clicks,
        'inline_link_clicks': inline_link_clicks,
        'outbound_clicks': outbound_clicks,
        'landing_page_view': landing_page_view,
        'onsite_web_checkout': onsite_web_checkout,
        'onsite_web_add_to_cart': onsite_web_add_to_cart,
        'conversions': onsite_web_purchase,  # 前端使用 conversions 字段
        'onsite_web_checkout_value': onsite_web_checkout_value,
        'onsite_web_add_to_cart_value': onsite_web_add_to_cart_value,
        'gmv': onsite_web_purchase_value,  # 前端使用 gmv 字段
    }


def generate_lifecycle(start_date, end_date, min_days=30, max_days=365):
    """
    为广告对象生成生命周期（新建和关停时间）

    Args:
        start_date: 数据起始日期
        end_date: 数据结束日期
        min_days: 最短生命周期天数
        max_days: 最长生命周期天数

    Returns:
        tuple: (object_start_date, object_end_date)
    """
    total_days = (end_date - start_date).days

    # 随机选择对象的启动时间（在数据时间范围内）
    max_start_offset = max(0, total_days - min_days)
    start_offset = random.randint(0, max_start_offset)
    object_start = start_date + timedelta(days=start_offset)

    # 随机选择生命周期长度
    remaining_days = (end_date - object_start).days
    lifecycle_days = random.randint(min_days, min(max_days, remaining_days))

    # 80%的对象会在数据期内关停，20%持续到最后
    if random.random() < 0.8:
        object_end = object_start + timedelta(days=lifecycle_days)
        object_end = min(object_end, end_date)
    else:
        object_end = end_date

    return object_start.date(), object_end.date()


def generate_ad_report(num_campaigns=100, num_ad_sets_per_campaign=5, num_ads_per_ad_set=3, num_days=365):
    """
    生成广告日报表数据（最细粒度：ad层级）

    只生成 ad 层级的数据，包含 campaign_id 和 ad_set_id 字段用于聚合。
    前端可以通过聚合来计算 ad_set 和 campaign 层级的指标，测试聚合性能。

    每个广告对象（campaign/ad_set/ad）都有生命周期，模拟新建和关停效果。

    Args:
        num_campaigns: 广告系列数量
        num_ad_sets_per_campaign: 每个系列包含的广告组数量
        num_ads_per_ad_set: 每个广告组包含的广告数量
        num_days: 天数（默认365天，一年）

    Returns:
        pyarrow.Table: ad 层级的 Arrow 表格
    """
    total_ad_sets = num_campaigns * num_ad_sets_per_campaign
    total_ads = total_ad_sets * num_ads_per_ad_set

    print(f"生成广告日报表数据（最细粒度 - ad 层级，包含生命周期）:")
    print(f"  - {num_campaigns}个系列(campaign)")
    print(f"  - {total_ad_sets}个广告组(ad_set)")
    print(f"  - {total_ads}个广告(ad)")
    print(f"  - 时间范围: {num_days}天")

    # 生成日期范围
    end_date = datetime.now()
    start_date = end_date - timedelta(days=num_days - 1)
    all_dates = [(start_date + timedelta(days=i)).date() for i in range(num_days)]

    # 定义广告系列类型
    campaign_types = ['search', 'display', 'video', 'shopping']

    # 只生成 ad 层级数据
    ads_data = []

    ad_set_id_counter = 1
    ad_id_counter = 1

    total_records_estimate = 0

    for campaign_id in range(1, num_campaigns + 1):
        advertiser_id = (campaign_id - 1) // 10 + 1  # 每10个系列属于一个广告主
        campaign_type = random.choice(campaign_types)

        # 为campaign生成生命周期
        campaign_start, campaign_end = generate_lifecycle(start_date, end_date, min_days=60, max_days=365)

        # 为该系列生成广告组
        for _ in range(num_ad_sets_per_campaign):
            ad_set_id = ad_set_id_counter
            ad_set_id_counter += 1

            # ad_set的生命周期必须在campaign生命周期内
            ad_set_start_date = datetime.strptime(str(campaign_start), '%Y-%m-%d')
            ad_set_end_date = datetime.strptime(str(campaign_end), '%Y-%m-%d')
            ad_set_start, ad_set_end = generate_lifecycle(
                ad_set_start_date, ad_set_end_date, min_days=30, max_days=180
            )

            # 为该广告组生成广告
            for _ in range(num_ads_per_ad_set):
                ad_id = ad_id_counter
                ad_id_counter += 1

                # ad的生命周期必须在ad_set生命周期内
                ad_start_date = datetime.strptime(str(ad_set_start), '%Y-%m-%d')
                ad_end_date = datetime.strptime(str(ad_set_end), '%Y-%m-%d')
                ad_start, ad_end = generate_lifecycle(
                    ad_start_date, ad_end_date, min_days=7, max_days=90
                )

                # 只为该广告的生命周期内生成数据
                for date in all_dates:
                    if ad_start <= date <= ad_end:
                        metrics = generate_base_metrics()
                        ads_data.append({
                            'date': date,
                            'advertiser_id': f"ADV{advertiser_id:04d}",
                            'campaign_id': f"CMP{campaign_id:06d}",
                            'campaign_type': campaign_type,
                            'ad_set_id': f"ADS{ad_set_id:08d}",
                            'ad_id': f"AD{ad_id:010d}",
                            **metrics
                        })
                        total_records_estimate += 1

        # 每处理10个campaign打印一次进度
        if campaign_id % 10 == 0:
            print(f"  进度: {campaign_id}/{num_campaigns} campaigns, 已生成 {total_records_estimate:,} 条记录")

    print(f"  - 实际生成: {len(ads_data):,}条记录（考虑生命周期后）")

    # 定义 Arrow schema，明确指定字段类型
    schema = pa.schema([
        ('date', pa.date32()),
        ('advertiser_id', pa.string()),
        ('campaign_id', pa.string()),
        ('campaign_type', pa.string()),
        ('ad_set_id', pa.string()),
        ('ad_id', pa.string()),
        ('cost', pa.float32()),
        ('impressions', pa.int32()),
        ('reach', pa.int32()),
        ('clicks', pa.int32()),
        ('inline_link_clicks', pa.int32()),
        ('outbound_clicks', pa.int32()),
        ('landing_page_view', pa.int32()),
        ('onsite_web_checkout', pa.int32()),
        ('onsite_web_add_to_cart', pa.int32()),
        ('conversions', pa.int32()),
        ('onsite_web_checkout_value', pa.float32()),
        ('onsite_web_add_to_cart_value', pa.float32()),
        ('gmv', pa.float32()),
    ])

    # 转换为Arrow表格，使用指定的 schema
    ads_table = pa.Table.from_pylist(ads_data, schema=schema)

    print(f"\n生成完成:")
    print(f"  - 记录数: {len(ads_data):,}条")
    print(f"  - 内存大小: {ads_table.nbytes / 1024 / 1024:.2f} MB")

    return ads_table, ads_data


def save_ads_by_month(ads_data, output_dir):
    """
    将广告数据按月分片保存

    Args:
        ads_data: 广告数据列表
        output_dir: 输出目录
    """
    import os
    from collections import defaultdict

    # 按月份分组数据
    monthly_data = defaultdict(list)
    for row in ads_data:
        year_month = row['date'].strftime('%Y-%m')
        monthly_data[year_month].append(row)

    # 定义 Arrow schema
    schema = pa.schema([
        ('date', pa.date32()),
        ('advertiser_id', pa.string()),
        ('campaign_id', pa.string()),
        ('campaign_type', pa.string()),
        ('ad_set_id', pa.string()),
        ('ad_id', pa.string()),
        ('cost', pa.float32()),
        ('impressions', pa.int32()),
        ('reach', pa.int32()),
        ('clicks', pa.int32()),
        ('inline_link_clicks', pa.int32()),
        ('outbound_clicks', pa.int32()),
        ('landing_page_view', pa.int32()),
        ('onsite_web_checkout', pa.int32()),
        ('onsite_web_add_to_cart', pa.int32()),
        ('conversions', pa.int32()),
        ('onsite_web_checkout_value', pa.float32()),
        ('onsite_web_add_to_cart_value', pa.float32()),
        ('gmv', pa.float32()),
    ])

    # 创建分片目录
    shards_dir = os.path.join(output_dir, 'ads_shards')
    os.makedirs(shards_dir, exist_ok=True)

    print(f"\n按月保存数据到: {shards_dir}")

    # 保存每个月的数据
    total_size = 0
    for year_month in sorted(monthly_data.keys()):
        month_data = monthly_data[year_month]
        month_table = pa.Table.from_pylist(month_data, schema=schema)

        file_path = os.path.join(shards_dir, f'ads_{year_month}.arrow')
        with pa.OSFile(file_path, 'wb') as sink:
            with pa.ipc.new_file(sink, month_table.schema) as writer:
                writer.write_table(month_table)

        file_size = os.path.getsize(file_path)
        total_size += file_size
        print(f"  - {year_month}: {len(month_data):,} 条记录, {file_size / 1024 / 1024:.2f} MB")

    print(f"  - 总大小: {total_size / 1024 / 1024:.2f} MB")

    # 保存分片元数据
    metadata = {
        'months': sorted(monthly_data.keys()),
        'total_records': len(ads_data),
        'total_size_mb': total_size / 1024 / 1024,
        'schema': str(schema),
    }

    import json
    metadata_path = os.path.join(shards_dir, 'metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"  - 元数据已保存: {metadata_path}")

    return sorted(monthly_data.keys())


def generate_user_sku_logs(num_users=10000, num_skus=5000, num_events=1000000,
                          num_campaigns=100, num_ad_sets_per_campaign=5, num_ads_per_ad_set=3):
    """
    生成用户-SKU互动日志数据（稀疏数据，包含广告归因）

    Args:
        num_users: 用户数量
        num_skus: SKU数量
        num_events: 事件数量
        num_campaigns: 广告系列数量（用于生成广告归因）
        num_ad_sets_per_campaign: 每个系列的广告组数量
        num_ads_per_ad_set: 每个广告组的广告数量

    Returns:
        pyarrow.Table: Arrow表格
    """
    print(f"生成用户-SKU互动日志: {num_events}条事件（包含广告归因）")

    event_types = ['view', 'cart_add', 'purchase']
    event_weights = [0.7, 0.2, 0.1]  # view占70%, cart_add占20%, purchase占10%

    base_time = datetime.now() - timedelta(days=7)

    # 计算广告ID范围（与 ads.arrow 保持一致）
    total_ad_sets = num_campaigns * num_ad_sets_per_campaign
    total_ads = total_ad_sets * num_ads_per_ad_set

    data = []
    for i in range(num_events):
        user_id = f"U{random.randint(1, num_users):06d}"
        sku_id = f"SKU{random.randint(1, num_skus):06d}"
        event_type = random.choices(event_types, weights=event_weights)[0]
        ts = base_time + timedelta(seconds=random.randint(0, 7*24*3600))

        # 生成广告归因信息（用户从哪个广告来的）
        # SKU与广告是多对多关系，同一个SKU可以出现在不同广告中
        campaign_id_num = random.randint(1, num_campaigns)
        ad_set_id_num = random.randint(
            (campaign_id_num - 1) * num_ad_sets_per_campaign + 1,
            campaign_id_num * num_ad_sets_per_campaign
        )
        ad_id_num = random.randint(
            (ad_set_id_num - 1) * num_ads_per_ad_set + 1,
            ad_set_id_num * num_ads_per_ad_set
        )

        # 构建扩展属性（稀疏）
        attrs = {}
        if event_type == 'cart_add':
            attrs['cart_id'] = f"C{random.randint(1, 100000):08d}"
            attrs['quantity'] = random.randint(1, 5)
        elif event_type == 'purchase':
            attrs['order_id'] = f"O{random.randint(1, 50000):08d}"
            attrs['price'] = round(random.uniform(10, 1000), 2)
            if random.random() < 0.3:  # 30%的购买使用优惠券
                attrs['coupon'] = f"COUPON{random.randint(1, 100):03d}"
                attrs['discount'] = round(random.uniform(5, 50), 2)

        data.append({
            'ts': ts,
            'user_id': user_id,
            'sku_id': sku_id,
            'event_type': event_type,
            'campaign_id': f"CMP{campaign_id_num:06d}",
            'ad_set_id': f"ADS{ad_set_id_num:08d}",
            'ad_id': f"AD{ad_id_num:010d}",
            'attrs': json.dumps(attrs) if attrs else None,  # 将扩展属性序列化为JSON字符串
        })

    # 按时间排序
    data.sort(key=lambda x: x['ts'])

    # 定义 Arrow schema
    schema = pa.schema([
        ('ts', pa.timestamp('us')),
        ('user_id', pa.string()),
        ('sku_id', pa.string()),
        ('event_type', pa.string()),
        ('campaign_id', pa.string()),
        ('ad_set_id', pa.string()),
        ('ad_id', pa.string()),
        ('attrs', pa.string()),
    ])

    # 转换为Arrow表格，使用指定的 schema
    table = pa.Table.from_pylist(data, schema=schema)

    print(f"生成完成: {len(data)}条记录")
    print(f"内存大小: {table.nbytes / 1024 / 1024:.2f} MB")

    # 统计各事件类型数量
    event_counts = {}
    for event in data:
        event_type = event['event_type']
        event_counts[event_type] = event_counts.get(event_type, 0) + 1
    print(f"事件分布: {event_counts}")

    return table


def main():
    """主函数"""
    import os

    # 创建输出目录
    output_dir = os.path.dirname(os.path.abspath(__file__))

    print("=" * 60)
    print("开始生成测试数据（一年数据，百万级别，包含生命周期）")
    print("=" * 60)

    # 生成广告日报表（一年数据，百万级别，包含生命周期）
    print("\n1. 生成广告日报表数据（ad 层级，一年数据，百万级别）...")
    ads_table, ads_data = generate_ad_report(
        num_campaigns=500,           # 500个广告系列
        num_ad_sets_per_campaign=10, # 每个系列10个广告组
        num_ads_per_ad_set=5,        # 每个广告组5个广告
        num_days=365                 # 一年数据
    )
    # 预计：500 × 10 × 5 = 25,000 个广告
    # 考虑生命周期后，约 25,000 × 45 天 ≈ 1,125,000 条记录

    # 保存全量数据（用于兼容性）
    ads_path = os.path.join(output_dir, 'ads.arrow')
    with pa.OSFile(ads_path, 'wb') as sink:
        with pa.ipc.new_file(sink, ads_table.schema) as writer:
            writer.write_table(ads_table)
    print(f"\n全量数据已保存: {ads_path}")
    print(f"文件大小: {os.path.getsize(ads_path) / 1024 / 1024:.2f} MB")

    # 按月分片保存
    print("\n2. 按月分片保存数据...")
    months = save_ads_by_month(ads_data, output_dir)
    print(f"\n分片保存完成，共 {len(months)} 个月份")

    print("\n前端可以通过聚合 campaign_id 或 ad_set_id 来计算上层指标")

    # 生成用户-SKU互动日志
    print("\n3. 生成用户-SKU互动日志数据...")
    user_sku_logs = generate_user_sku_logs(
        num_users=50000,     # 5万用户
        num_skus=10000,      # 1万SKU
        num_events=500000,   # 50万事件
        num_campaigns=500,   # 与广告数据保持一致
        num_ad_sets_per_campaign=10,
        num_ads_per_ad_set=5
    )
    user_sku_logs_path = os.path.join(output_dir, 'user_sku_logs.arrow')

    with pa.OSFile(user_sku_logs_path, 'wb') as sink:
        with pa.ipc.new_file(sink, user_sku_logs.schema) as writer:
            writer.write_table(user_sku_logs)

    print(f"\n保存到: {user_sku_logs_path}")
    file_size = os.path.getsize(user_sku_logs_path) / 1024 / 1024
    print(f"文件大小: {file_size:.2f} MB")

    print("\n" + "=" * 60)
    print("数据生成完成!")
    print("=" * 60)
    print(f"\n数据概览:")
    print(f"  - 广告数据: {len(ads_data):,} 条记录 ({len(months)} 个月份)")
    print(f"  - 用户日志: 500,000 条记录")
    print(f"\n分片文件位置: {os.path.join(output_dir, 'ads_shards')}")
    print(f"  - 可通过 metadata.json 查看分片信息")
    print(f"  - 前端默认只加载最后一个月份的数据")
    print(f"  - 支持按需加载更多月份")


if __name__ == '__main__':
    main()
