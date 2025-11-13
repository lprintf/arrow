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
        'spend': spend,
        'impressions': impressions,
        'reach': reach,
        'clicks': clicks,
        'inline_link_clicks': inline_link_clicks,
        'outbound_clicks': outbound_clicks,
        'landing_page_view': landing_page_view,
        'onsite_web_checkout': onsite_web_checkout,
        'onsite_web_add_to_cart': onsite_web_add_to_cart,
        'onsite_web_purchase': onsite_web_purchase,
        'onsite_web_checkout_value': onsite_web_checkout_value,
        'onsite_web_add_to_cart_value': onsite_web_add_to_cart_value,
        'onsite_web_purchase_value': onsite_web_purchase_value,
    }


def generate_ad_report(num_campaigns=100, num_ad_sets_per_campaign=5, num_ads_per_ad_set=3, num_days=30):
    """
    生成广告日报表数据（最细粒度：ad层级）

    只生成 ad 层级的数据，包含 campaign_id 和 ad_set_id 字段用于聚合。
    前端可以通过聚合来计算 ad_set 和 campaign 层级的指标，测试聚合性能。

    Args:
        num_campaigns: 广告系列数量
        num_ad_sets_per_campaign: 每个系列包含的广告组数量
        num_ads_per_ad_set: 每个广告组包含的广告数量
        num_days: 天数

    Returns:
        pyarrow.Table: ad 层级的 Arrow 表格
    """
    total_ad_sets = num_campaigns * num_ad_sets_per_campaign
    total_ads = total_ad_sets * num_ads_per_ad_set

    print(f"生成广告日报表数据（最细粒度 - ad 层级）:")
    print(f"  - {num_campaigns}个系列(campaign)")
    print(f"  - {total_ad_sets}个广告组(ad_set)")
    print(f"  - {total_ads}个广告(ad)")
    print(f"  - 共 {total_ads * num_days:,}条记录 (ads × {num_days}天)")

    # 生成日期范围
    start_date = datetime.now() - timedelta(days=num_days)
    dates = [(start_date + timedelta(days=i)).date() for i in range(num_days)]

    # 定义广告系列类型
    campaign_types = ['search', 'display', 'video', 'shopping']

    # 只生成 ad 层级数据
    ads_data = []

    ad_set_id_counter = 1
    ad_id_counter = 1

    for campaign_id in range(1, num_campaigns + 1):
        advertiser_id = (campaign_id - 1) // 10 + 1  # 每10个系列属于一个广告主
        campaign_type = random.choice(campaign_types)

        # 为该系列生成广告组
        for _ in range(num_ad_sets_per_campaign):
            ad_set_id = ad_set_id_counter
            ad_set_id_counter += 1

            # 为该广告组生成广告
            for _ in range(num_ads_per_ad_set):
                ad_id = ad_id_counter
                ad_id_counter += 1

                # 为每个广告生成每日数据
                for date in dates:
                    metrics = generate_base_metrics()
                    ads_data.append({
                        'date': date,
                        'advertiser_id': advertiser_id,
                        'campaign_id': campaign_id,
                        'campaign_type': campaign_type,
                        'ad_set_id': ad_set_id,
                        'ad_id': ad_id,
                        **metrics
                    })

    # 转换为Arrow表格
    ads_table = pa.Table.from_pylist(ads_data)

    print(f"\n生成完成:")
    print(f"  - 记录数: {len(ads_data):,}条")
    print(f"  - 内存大小: {ads_table.nbytes / 1024 / 1024:.2f} MB")

    return ads_table


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
        campaign_id = random.randint(1, num_campaigns)
        ad_set_id = random.randint(
            (campaign_id - 1) * num_ad_sets_per_campaign + 1,
            campaign_id * num_ad_sets_per_campaign
        )
        ad_id = random.randint(
            (ad_set_id - 1) * num_ads_per_ad_set + 1,
            ad_set_id * num_ads_per_ad_set
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
            'campaign_id': campaign_id,  # 广告归因：系列
            'ad_set_id': ad_set_id,      # 广告归因：广告组
            'ad_id': ad_id,              # 广告归因：广告
            'attrs': json.dumps(attrs) if attrs else None,  # 将扩展属性序列化为JSON字符串
        })

    # 按时间排序
    data.sort(key=lambda x: x['ts'])

    # 转换为Arrow表格
    table = pa.Table.from_pylist(data)

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
    print("开始生成测试数据")
    print("=" * 60)

    # 生成广告日报表（只生成最细粒度的 ad 层级）
    print("\n1. 生成广告日报表数据（ad 层级）...")
    ads_table = generate_ad_report(
        num_campaigns=100,
        num_ad_sets_per_campaign=5,
        num_ads_per_ad_set=3,
        num_days=30
    )

    # 保存 Ads 表
    ads_path = os.path.join(output_dir, 'ads.arrow')
    with pa.OSFile(ads_path, 'wb') as sink:
        with pa.ipc.new_file(sink, ads_table.schema) as writer:
            writer.write_table(ads_table)
    print(f"\n保存到: {ads_path}")
    print(f"文件大小: {os.path.getsize(ads_path) / 1024 / 1024:.2f} MB")
    print("\n前端可以通过聚合 campaign_id 或 ad_set_id 来计算上层指标")

    # 生成用户-SKU互动日志
    print("\n2. 生成用户-SKU互动日志数据...")
    user_sku_logs = generate_user_sku_logs(
        num_users=10000,
        num_skus=5000,
        num_events=100000,
        num_campaigns=100,  # 与广告数据保持一致
        num_ad_sets_per_campaign=5,
        num_ads_per_ad_set=3
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


if __name__ == '__main__':
    main()
