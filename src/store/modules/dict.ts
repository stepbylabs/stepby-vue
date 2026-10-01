import type { DictOption } from '@/types'

interface DictItem {
  key: string
  value: DictOption[]
}

interface DictState {
  dict: DictItem[]
}

const useDictStore = defineStore('dict', {
  state: (): DictState => ({
    dict: []
  }),
  actions: {
    // 获取字典
    getDict(_key: string): DictOption[] | null {
      if (_key == null || _key === '') {
        return null
      }
      try {
        for (let i = 0; i < this.dict.length; i++) {
          if (this.dict[i].key === _key) {
            return this.dict[i].value
          }
        }
      } catch {
        return null
      }
      return null
    },
    // 设置字典
    setDict(_key: string, value: DictOption[]) {
      if (_key !== null && _key !== '') {
        // 先移除同 key 的旧记录，避免重复堆积导致 getDict 返回过期数据
        this.dict = this.dict.filter((item: DictItem) => item.key !== _key)
        this.dict.push({
          key: _key,
          value: value
        })
      }
    },
    // 删除字典
    removeDict(_key: string): boolean {
      let bln = false
      try {
        for (let i = 0; i < this.dict.length; i++) {
          if (this.dict[i].key === _key) {
            this.dict.splice(i, 1)
            return true
          }
        }
      } catch {
        bln = false
      }
      return bln
    },
    // 清空字典
    cleanDict() {
      this.dict = []
    },
    // 初始字典
    initDict() {}
  }
})

export default useDictStore
