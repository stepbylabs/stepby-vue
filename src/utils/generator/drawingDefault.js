export const drawingDefaultValue = []

export function initDrawingDefaultValue() {
  if (drawingDefaultValue.length === 0) {
    drawingDefaultValue.push({
      layout: 'colFormItem',
      tagIcon: 'input',
      label: '手机号',
      vModel: 'mobile',
      formId: 6,
      tag: 'el-input',
      placeholder: '请输入手机号',
      defaultValue: '',
      span: 24,
      style: { width: '100%' },
      clearable: true,
      prepend: '',
      append: '',
      'prefix-icon': 'Cellphone',
      'suffix-icon': '',
      maxlength: 11,
      'show-word-limit': true,
      readonly: false,
      disabled: false,
      required: true,
      changeTag: true,
      regList: [
        {
          // 默认中国大陆号段。设计器生成的表单如需支持其他国家，
          // 可在此把 pattern 改为对应国家的正则（如美国 ^\d{10}$，香港 ^([5-9]\d{7})$）。
          // 注意：pattern 为纯正则字符串，不能带两端的 / 斜杠（消费处会用 new RegExp(pattern) 包裹）。
          pattern: '^1[3-9]\\d{9}$',
          message: '手机号格式错误'
        }
      ]
    })
  }
}

export function cleanDrawingDefaultValue() {
  drawingDefaultValue.splice(0, drawingDefaultValue.length)
}
