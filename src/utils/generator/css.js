const styles = {
  'el-rate': '.el-rate{display: inline-block; vertical-align: text-top;}',
  'el-upload': '.el-upload__tip{line-height: 1.2;}',
  'el-button':
    '.el-button{transition: transform 0.2s ease, background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;} .el-button:hover{transform: scale(1.05);}',
  'el-dialog':
    '.fade-slide-enter-active, .fade-slide-leave-active{transition: opacity 0.25s ease, transform 0.25s ease;} .fade-slide-enter-from, .fade-slide-leave-to{opacity: 0; transform: translateY(-10px);}',
  'el-select': '.el-select__wrapper{transition: box-shadow 0.2s ease, border-color 0.2s ease;}',
  'el-input': '.el-input__wrapper{transition: box-shadow 0.2s ease, border-color 0.2s ease;}'
}

function addCss(cssList, el) {
  const css = styles[el.tag]
  if (css && cssList.indexOf(css) === -1) cssList.push(css)
  if (el.children) {
    el.children.forEach((el2) => addCss(cssList, el2))
  }
}

export function makeUpCss(conf) {
  const cssList = []
  conf.fields.forEach((el) => addCss(cssList, el))
  return cssList.join('\n')
}
