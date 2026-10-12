import { selectDictLabel, selectDictLabels, handleTree } from '@/utils/stepby'

// ============================================================================
// selectDictLabel 字典标签选择（从 stepby.test.ts 拆分而来，覆盖字典/树类工具）
// ============================================================================
describe('selectDictLabel', () => {
  const datas = {
    0: { value: '1', label: '男' },
    1: { value: '2', label: '女' }
  }

  it('匹配到 value 返回对应 label', () => {
    expect(selectDictLabel(datas, '1')).toBe('男')
    expect(selectDictLabel(datas, '2')).toBe('女')
  })

  it('数字 value 通过类型转换匹配', () => {
    // '' + 1 = '1'，使用 == 宽松比较
    expect(selectDictLabel(datas, 1)).toBe('男')
    expect(selectDictLabel(datas, 2)).toBe('女')
  })

  it('未匹配到 value 返回 value 本身', () => {
    expect(selectDictLabel(datas, '3')).toBe('3')
  })

  it('value 为 undefined 返回空字符串', () => {
    expect(selectDictLabel(datas, undefined)).toBe('')
  })

  it('value 为 0 未匹配时返回 "0"', () => {
    expect(selectDictLabel(datas, 0)).toBe('0')
  })

  it('datas 为数组形式时同样可匹配', () => {
    const arrDatas = [
      { value: '1', label: 'A' },
      { value: '2', label: 'B' }
    ]
    expect(selectDictLabel(arrDatas, '1')).toBe('A')
  })
})

// ============================================================================
// selectDictLabels 字典标签多选
// ============================================================================
describe('selectDictLabels', () => {
  const datas = {
    0: { value: '1', label: 'A' },
    1: { value: '2', label: 'B' },
    2: { value: '3', label: 'C' }
  }

  it('单个值匹配', () => {
    expect(selectDictLabels(datas, '1')).toBe('A')
  })

  it('多个值用默认逗号分隔', () => {
    expect(selectDictLabels(datas, '1,2')).toBe('A,B')
  })

  it('数组值会被 join 后处理', () => {
    expect(selectDictLabels(datas, ['1', '2'])).toBe('A,B')
  })

  it('自定义分隔符', () => {
    expect(selectDictLabels(datas, '1-2', '-')).toBe('A-B')
  })

  it('部分匹配部分不匹配', () => {
    // 3 匹配 'C'，4 不匹配返回 '4'
    expect(selectDictLabels(datas, '3,4')).toBe('C,4')
  })

  it('全部不匹配返回原值', () => {
    expect(selectDictLabels(datas, '5,6')).toBe('5,6')
  })

  it('value 为 undefined 返回空字符串', () => {
    expect(selectDictLabels(datas, undefined)).toBe('')
  })

  it('value 为空字符串返回空字符串', () => {
    expect(selectDictLabels(datas, '')).toBe('')
  })

  it('空数组返回空字符串', () => {
    expect(selectDictLabels(datas, [])).toBe('')
  })

  it('所有值匹配', () => {
    expect(selectDictLabels(datas, '1,2,3')).toBe('A,B,C')
  })
})

// ============================================================================
// handleTree 树结构构建
// ============================================================================
describe('handleTree', () => {
  it('空数组返回空数组', () => {
    expect(handleTree([])).toEqual([])
  })

  it('单根节点（无父节点）', () => {
    const data: Record<string, unknown>[] = [{ id: 1, parentId: 0, name: 'root' }]
    const result = handleTree(data)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
    expect(result[0].children).toEqual([])
  })

  it('父子两层结构', () => {
    const data: Record<string, unknown>[] = [
      { id: 1, parentId: 0, name: 'root' },
      { id: 2, parentId: 1, name: 'child1' },
      { id: 3, parentId: 1, name: 'child2' }
    ]
    const result = handleTree(data)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
    expect(result[0].children as unknown[]).toHaveLength(2)
    expect(((result[0].children as unknown[])[0] as { id: number }).id).toBe(2)
    expect(((result[0].children as unknown[])[1] as { id: number }).id).toBe(3)
  })

  it('多层级（三层）树结构', () => {
    const data: Record<string, unknown>[] = [
      { id: 1, parentId: 0, name: 'L1' },
      { id: 2, parentId: 1, name: 'L2' },
      { id: 3, parentId: 2, name: 'L3' }
    ]
    const result = handleTree(data)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
    expect(((result[0].children as unknown[])[0] as { id: number }).id).toBe(2)
    expect((((result[0].children as unknown[])[0] as { children: unknown[] }).children[0] as { id: number }).id).toBe(3)
  })

  it('多个根节点', () => {
    const data: Record<string, unknown>[] = [
      { id: 1, parentId: 0, name: 'root1' },
      { id: 2, parentId: 0, name: 'root2' }
    ]
    const result = handleTree(data)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(1)
    expect(result[1].id).toBe(2)
  })

  it('parentId 指向不存在的节点 - 成为根节点', () => {
    const data: Record<string, unknown>[] = [{ id: 1, parentId: 99, name: 'orphan' }]
    const result = handleTree(data)
    // parentId 99 不在 map 中，所以该节点成为根节点
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('自定义字段名 id/parentId/children', () => {
    const data: Record<string, unknown>[] = [
      { uid: 'a', pid: '', name: 'root' },
      { uid: 'b', pid: 'a', name: 'child' }
    ]
    const result = handleTree(data, 'uid', 'pid', 'nodes')
    expect(result).toHaveLength(1)
    expect(result[0].uid).toBe('a')
    expect(result[0].nodes as unknown[]).toHaveLength(1)
    expect(((result[0].nodes as unknown[])[0] as { uid: string }).uid).toBe('b')
  })

  it('节点已有 children 字段时保留并追加', () => {
    const data: Record<string, unknown>[] = [
      { id: 1, parentId: 0, name: 'root', children: [{ id: 99, name: 'preset' }] },
      { id: 2, parentId: 1, name: 'child' }
    ]
    const result = handleTree(data)
    expect(result[0].children as unknown[]).toHaveLength(2)
    // 预设的子节点保留
    expect(((result[0].children as unknown[])[0] as { id: number }).id).toBe(99)
    // 新增的子节点追加
    expect(((result[0].children as unknown[])[1] as { id: number }).id).toBe(2)
  })

  describe('循环引用防护', () => {
    it('自引用节点（parentId === id）不崩溃', () => {
      const data = [{ id: 1, parentId: 1, name: 'self' }]
      // 不应抛出异常，节点不会成为根节点
      const result = handleTree(data)
      expect(result).toEqual([])
    })

    it('互相引用（A→B→A）不崩溃', () => {
      const data = [
        { id: 'A', parentId: 'B', name: 'a' },
        { id: 'B', parentId: 'A', name: 'b' }
      ]
      // 两个节点互为父节点，都不会成为根节点
      const result = handleTree(data)
      expect(result).toEqual([])
    })
  })
})
