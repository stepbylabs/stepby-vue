import { defineComponent, h, resolveComponent } from 'vue'
import { makeMap } from '@/utils/index'
import i18n from '@/i18n'
// 显式导入 Element Plus 组件，避免 resolveComponent 在 unplugin-vue-components 按需导入环境下找不到组件
// （BUILD-002 移除了 app.use(ElementPlus) 全局注册，render 函数中动态解析的组件必须显式导入）
import {
  ElInput,
  ElInputNumber,
  ElSelect,
  ElOption,
  ElCascader,
  ElRadioGroup,
  ElRadio,
  ElCheckboxGroup,
  ElCheckbox,
  ElCheckboxButton,
  ElSwitch,
  ElSlider,
  ElTimePicker,
  ElDatePicker,
  ElRate,
  ElColorPicker,
  ElUpload,
  ElButton,
  ElIcon
} from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

// 组件名 -> 组件定义 映射表
const componentMap = {
  'el-input': ElInput,
  'el-input-number': ElInputNumber,
  'el-select': ElSelect,
  'el-option': ElOption,
  'el-cascader': ElCascader,
  'el-radio-group': ElRadioGroup,
  'el-radio': ElRadio,
  'el-checkbox-group': ElCheckboxGroup,
  'el-checkbox': ElCheckbox,
  'el-checkbox-button': ElCheckboxButton,
  'el-switch': ElSwitch,
  'el-slider': ElSlider,
  'el-time-picker': ElTimePicker,
  'el-date-picker': ElDatePicker,
  'el-rate': ElRate,
  'el-color-picker': ElColorPicker,
  'el-upload': ElUpload,
  'el-button': ElButton,
  'el-icon': ElIcon
}

// 优先从 componentMap 取组件（显式导入），找不到时回退到 resolveComponent（用于自定义组件或未来扩展）
function resolveTag(tag) {
  return componentMap[tag] || resolveComponent(tag)
}

const isAttr = makeMap(
  'accept,accept-charset,accesskey,action,align,alt,async,autocomplete,' +
    'autofocus,autoplay,autosave,bgcolor,border,buffered,challenge,charset,' +
    'checked,cite,class,code,codebase,color,cols,colspan,content,http-equiv,' +
    'name,contenteditable,contextmenu,controls,coords,data,datetime,default,' +
    'defer,dir,dirname,disabled,download,draggable,dropzone,enctype,method,for,' +
    'form,formaction,headers,height,hidden,high,href,hreflang,http-equiv,' +
    'icon,id,ismap,itemprop,keytype,kind,label,lang,language,list,loop,low,' +
    'manifest,max,maxlength,media,method,GET,POST,min,multiple,email,file,' +
    'muted,name,novalidate,open,optimum,pattern,ping,placeholder,poster,' +
    'preload,radiogroup,readonly,rel,required,reversed,rows,rowspan,sandbox,' +
    'scope,scoped,seamless,selected,shape,size,type,text,password,sizes,span,' +
    'spellcheck,src,srcdoc,srclang,srcset,start,step,style,summary,tabindex,' +
    'target,title,type,usemap,value,width,wrap' +
    'prefix-icon'
)
const isNotProps = makeMap('layout,prepend,regList,tag,document,changeTag,defaultValue')

const componentChild = {
  'el-button': {
    default(h, conf, key) {
      return conf[key]
    }
  },
  'el-select': {
    options(h, conf, _key) {
      return conf.options.map((item) =>
        h(ElOption, {
          label: item.label,
          value: item.value
        })
      )
    }
  },
  'el-radio-group': {
    options(h, conf, _key) {
      return conf.optionType === 'button'
        ? conf.options.map((item) =>
            h(
              ElCheckboxButton,
              {
                label: item.value
              },
              () => item.label
            )
          )
        : conf.options.map((item) =>
            h(
              ElRadio,
              {
                label: item.value,
                border: conf.border
              },
              () => item.label
            )
          )
    }
  },
  'el-checkbox-group': {
    options(h, conf, _key) {
      return conf.optionType === 'button'
        ? conf.options.map((item) =>
            h(
              ElCheckboxButton,
              {
                label: item.value
              },
              () => item.label
            )
          )
        : conf.options.map((item) =>
            h(
              ElCheckbox,
              {
                label: item.value,
                border: conf.border
              },
              () => item.label
            )
          )
    }
  },
  'el-upload': {
    'list-type': (h, conf, _key) => {
      const option = {}
      // if (conf.showTip) {
      //   tip = h('div', {
      //     class: "el-upload__tip"
      //   }, () => '只能上传不超过' + conf.fileSize + conf.sizeUnit + '的' + conf.accept + '文件')
      // }
      if (conf['list-type'] === 'picture-card') {
        return h(ElIcon, option, () => h(Plus))
      } else {
        // option.size = "small"
        option.type = 'primary'
        option.icon = 'Upload'
        return h(ElButton, option, () => conf.buttonText)
      }
    }
  }
}
const componentSlot = {
  'el-upload': {
    tip: (h, conf, _key) => {
      if (conf.showTip) {
        return () =>
          h(
            'div',
            {
              class: 'el-upload__tip'
            },
            i18n.global.t('build.uploadTip', { size: conf.fileSize, unit: conf.sizeUnit, type: conf.accept })
          )
      }
    }
  }
}
export default defineComponent({
  name: 'RenderComponent',
  // 显式注册所有用到的 Element Plus 组件，供 resolveComponent 在 render 函数中查找
  components: {
    ElInput,
    ElInputNumber,
    ElSelect,
    ElOption,
    ElCascader,
    ElRadioGroup,
    ElRadio,
    ElCheckboxGroup,
    ElCheckbox,
    ElCheckboxButton,
    ElSwitch,
    ElSlider,
    ElTimePicker,
    ElDatePicker,
    ElRate,
    ElColorPicker,
    ElUpload,
    ElButton,
    ElIcon
  },

  // 使用 render 函数
  render() {
    const dataObject = {
      attrs: {},
      props: {},
      on: {},
      style: {}
    }
    const confClone = JSON.parse(JSON.stringify(this.conf))
    const children = []
    const slot = {}
    const childObjs = componentChild[confClone.tag]
    if (childObjs) {
      Object.keys(childObjs).forEach((key) => {
        const childFunc = childObjs[key]
        if (confClone[key]) {
          children.push(childFunc(h, confClone, key))
        }
      })
    }
    const slotObjs = componentSlot[confClone.tag]
    if (slotObjs) {
      Object.keys(slotObjs).forEach((key) => {
        const childFunc = slotObjs[key]
        if (confClone[key]) {
          slot[key] = childFunc(h, confClone, key)
        }
      })
    }
    Object.keys(confClone).forEach((key) => {
      const val = confClone[key]
      if (dataObject[key]) {
        dataObject[key] = val
      } else if (isAttr(key)) {
        dataObject.attrs[key] = val
      } else if (!isNotProps(key)) {
        dataObject.props[key] = val
      }
    })
    if (children.length > 0) {
      slot.default = () => children
    }

    return h(
      resolveTag(this.conf.tag),
      {
        modelValue: this.$attrs.modelValue,
        ...dataObject.props,
        ...dataObject.attrs,
        style: {
          ...dataObject.style
        }
      },
      slot ?? null
    )
  },
  props: {
    conf: {
      type: Object,
      required: true
    }
  }
})
