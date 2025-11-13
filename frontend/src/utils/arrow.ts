/**
 * Apache Arrow数据处理工具
 */

import { tableFromIPC } from 'apache-arrow'
import type { Table } from 'apache-arrow'

/**
 * 从API获取Arrow数据
 */
export async function fetchArrowData(url: string): Promise<Table> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch Arrow data: ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const table = tableFromIPC(arrayBuffer)

  return table
}

/**
 * 将Arrow Table转换为普通JS对象数组
 * 自动将 BigInt 转换为 Number 以避免类型混合错误
 */
export function tableToArray<T = any>(table: Table): T[] {
  return table.toArray().map(row => {
    const obj = row.toJSON()
    // 递归转换所有 BigInt 为 Number
    return convertBigIntToNumber(obj)
  }) as T[]
}

/**
 * 递归将对象中的所有 BigInt 转换为 Number
 */
function convertBigIntToNumber(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === 'bigint') {
    return Number(obj)
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToNumber)
  }

  if (typeof obj === 'object') {
    const result: any = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = convertBigIntToNumber(obj[key])
      }
    }
    return result
  }

  return obj
}

/**
 * 获取Arrow Table的统计信息
 */
export function getTableStats(table: Table) {
  return {
    numRows: table.numRows,
    numCols: table.numCols,
    schema: table.schema.fields.map(f => ({
      name: f.name,
      type: f.type.toString(),
    })),
  }
}
