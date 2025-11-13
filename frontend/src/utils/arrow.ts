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
 */
export function tableToArray<T = any>(table: Table): T[] {
  return table.toArray().map(row => row.toJSON()) as T[]
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
