<template>
  <!-- eslint-disable vue/no-mutating-props -->
  <div class="right-board">
    <el-tabs v-model="currentTab" stretch class="center-tabs">
      <el-tab-pane :label="t('build.rightPanel.tabField')" name="field" />
      <el-tab-pane :label="t('build.rightPanel.tabForm')" name="form" />
    </el-tabs>
    <div class="field-box">
      <a
        class="document-link absolute flex w-[26px] h-[26px] top-0 left-0 cursor-pointer bg-primary z-[1] rounded-br-md justify-center items-center text-white text-lg"
        target="_blank"
        :href="documentLink"
        :title="t('build.rightPanel.docLink')"
      >
        <el-icon>
          <Link />
        </el-icon>
      </a>
      <el-scrollbar class="right-scrollbar">
        <!-- 组件属性 -->
        <Transition mode="out-in" name="fade-slide">
          <el-form
            v-if="currentTab === 'field' && showField"
            :key="activeData.formId"
            size="default"
            label-width="90px"
            label-position="top"
          >
            <el-form-item v-if="activeData.changeTag" :label="t('build.rightPanel.label.componentType')">
              <el-select
                v-model="activeData.tagIcon"
                :placeholder="t('build.rightPanel.ph.componentType')"
                :style="{ width: '100%' }"
                @change="tagChange"
              >
                <el-option-group v-for="group in tagList" :key="group.label" :label="group.label">
                  <el-option v-for="item in group.options" :key="item.label" :label="item.label" :value="item.tagIcon">
                    <svg-icon class="node-icon text-text-placeholder mr-2.5" :icon-class="item.tagIcon" />
                    <span>{{ item.label }}</span>
                  </el-option>
                </el-option-group>
              </el-select>
            </el-form-item>
            <el-form-item v-if="activeData.vModel !== undefined" :label="t('build.rightPanel.label.fieldName')">
              <el-input v-model="activeData.vModel" :placeholder="t('build.rightPanel.ph.fieldName')" />
            </el-form-item>
            <el-form-item
              v-if="activeData.componentName !== undefined"
              :label="t('build.rightPanel.label.componentName')"
            >
              {{ activeData.componentName }}
            </el-form-item>
            <el-form-item v-if="activeData.label !== undefined" :label="t('build.rightPanel.label.title')">
              <el-input v-model="activeData.label" :placeholder="t('build.rightPanel.ph.title')" />
            </el-form-item>
            <el-form-item v-if="activeData.placeholder !== undefined" :label="t('build.rightPanel.label.placeholder')">
              <el-input v-model="activeData.placeholder" :placeholder="t('build.rightPanel.ph.placeholder')" />
            </el-form-item>
            <el-form-item
              v-if="activeData['start-placeholder'] !== undefined"
              :label="t('build.rightPanel.label.startPlaceholder')"
            >
              <el-input
                v-model="activeData['start-placeholder']"
                :placeholder="t('build.rightPanel.ph.placeholder')"
                :maxlength="100"
              />
            </el-form-item>
            <el-form-item
              v-if="activeData['end-placeholder'] !== undefined"
              :label="t('build.rightPanel.label.endPlaceholder')"
            >
              <el-input v-model="activeData['end-placeholder']" :placeholder="t('build.rightPanel.ph.placeholder')" />
            </el-form-item>
            <el-form-item v-if="activeData.span !== undefined" :label="t('build.rightPanel.label.span')">
              <el-slider v-model="activeData.span" :max="24" :min="1" :marks="{ 12: '' }" @change="spanChange" />
            </el-form-item>
            <el-form-item v-if="activeData.layout === 'rowFormItem'" :label="t('build.rightPanel.label.gutter')">
              <el-input-number v-model="activeData.gutter" :min="0" :placeholder="t('build.rightPanel.ph.gutter')" />
            </el-form-item>

            <el-form-item v-if="activeData.justify !== undefined" :label="t('build.rightPanel.label.justify')">
              <el-select
                v-model="activeData.justify"
                :placeholder="t('build.rightPanel.ph.justify')"
                :style="{ width: '100%' }"
              >
                <el-option v-for="item in justifyOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="activeData.align !== undefined" :label="t('build.rightPanel.label.align')">
              <el-radio-group v-model="activeData.align">
                <el-radio-button value="top">top</el-radio-button>
                <el-radio-button value="middle">middle</el-radio-button>
                <el-radio-button value="bottom">bottom</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="activeData.labelWidth !== undefined" :label="t('build.rightPanel.label.labelWidth')">
              <el-input
                v-model.number="activeData.labelWidth"
                type="number"
                :placeholder="t('build.rightPanel.ph.labelWidth')"
              />
            </el-form-item>
            <el-form-item
              v-if="activeData.style && activeData.style.width !== undefined"
              :label="t('build.rightPanel.label.componentWidth')"
            >
              <el-input
                v-model="activeData.style.width"
                :placeholder="t('build.rightPanel.ph.componentWidth')"
                clearable
              />
            </el-form-item>
            <el-form-item v-if="activeData.vModel !== undefined" :label="t('build.rightPanel.label.defaultValue')">
              <el-input
                :value="setDefaultValue(activeData.defaultValue)"
                :placeholder="t('build.rightPanel.ph.defaultValue')"
                @input="onDefaultValueInput"
              />
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-checkbox-group'" :label="t('build.rightPanel.label.minChecked')">
              <el-input-number
                :value="activeData.min"
                :min="0"
                :placeholder="t('build.rightPanel.ph.minChecked')"
                @input="activeData.min = $event ? $event : undefined"
              />
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-checkbox-group'" :label="t('build.rightPanel.label.maxChecked')">
              <el-input-number
                :value="activeData.max"
                :min="0"
                :placeholder="t('build.rightPanel.ph.maxChecked')"
                @input="activeData.max = $event ? $event : undefined"
              />
            </el-form-item>
            <el-form-item v-if="activeData.prepend !== undefined" :label="t('build.rightPanel.label.prepend')">
              <el-input v-model="activeData.prepend" :placeholder="t('build.rightPanel.ph.prepend')" :maxlength="50" />
            </el-form-item>
            <el-form-item v-if="activeData.append !== undefined" :label="t('build.rightPanel.label.append')">
              <el-input v-model="activeData.append" :placeholder="t('build.rightPanel.ph.append')" />
            </el-form-item>
            <el-form-item
              v-if="activeData['prefix-icon'] !== undefined"
              :label="t('build.rightPanel.label.prefixIcon')"
            >
              <el-input v-model="activeData['prefix-icon']" :placeholder="t('build.rightPanel.ph.prefixIcon')">
                <template #append>
                  <el-button icon="Pointer" @click="openIconsDialog('prefix-icon')">
                    {{ t('build.rightPanel.btn.select') }}
                  </el-button>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item
              v-if="activeData['suffix-icon'] !== undefined"
              :label="t('build.rightPanel.label.suffixIcon')"
            >
              <el-input v-model="activeData['suffix-icon']" :placeholder="t('build.rightPanel.ph.suffixIcon')">
                <template #append>
                  <el-button icon="Pointer" @click="openIconsDialog('suffix-icon')">
                    {{ t('build.rightPanel.btn.select') }}
                  </el-button>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-cascader'" :label="t('build.rightPanel.label.separator')">
              <el-input v-model="activeData.separator" :placeholder="t('build.rightPanel.ph.separator')" />
            </el-form-item>
            <el-form-item v-if="activeData.autosize !== undefined" :label="t('build.rightPanel.label.minRows')">
              <el-input-number
                v-model="activeData.autosize.minRows"
                :min="1"
                :placeholder="t('build.rightPanel.ph.minRows')"
              />
            </el-form-item>
            <el-form-item v-if="activeData.autosize !== undefined" :label="t('build.rightPanel.label.maxRows')">
              <el-input-number
                v-model="activeData.autosize.maxRows"
                :min="1"
                :placeholder="t('build.rightPanel.ph.maxRows')"
              />
            </el-form-item>
            <el-form-item v-if="activeData.min !== undefined" :label="t('build.rightPanel.label.minValue')">
              <el-input-number v-model="activeData.min" :placeholder="t('build.rightPanel.ph.minValue')" />
            </el-form-item>
            <el-form-item v-if="activeData.max !== undefined" :label="t('build.rightPanel.label.maxValue')">
              <el-input-number v-model="activeData.max" :placeholder="t('build.rightPanel.ph.maxValue')" />
            </el-form-item>
            <el-form-item v-if="activeData.step !== undefined" :label="t('build.rightPanel.label.step')">
              <el-input-number v-model="activeData.step" :placeholder="t('build.rightPanel.ph.step')" />
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-input-number'" :label="t('build.rightPanel.label.precision')">
              <el-input-number
                v-model="activeData.precision"
                :min="0"
                :placeholder="t('build.rightPanel.ph.precision')"
              />
            </el-form-item>
            <el-form-item
              v-if="activeData.tag === 'el-input-number'"
              :label="t('build.rightPanel.label.controlsPosition')"
            >
              <el-radio-group v-model="activeData['controls-position']">
                <el-radio-button value="">
                  {{ t('build.rightPanel.radio.controlsDefault') }}
                </el-radio-button>
                <el-radio-button value="right">
                  {{ t('build.rightPanel.radio.controlsRight') }}
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="activeData.maxlength !== undefined" :label="t('build.rightPanel.label.maxLength')">
              <el-input v-model="activeData.maxlength" :placeholder="t('build.rightPanel.ph.maxLength')">
                <template #append>
                  <span>{{ t('build.rightPanel.chars') }}</span>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item
              v-if="activeData['active-text'] !== undefined"
              :label="t('build.rightPanel.label.activeText')"
            >
              <el-input
                v-model="activeData['active-text']"
                :placeholder="t('build.rightPanel.ph.activeText')"
                :maxlength="50"
              />
            </el-form-item>
            <el-form-item
              v-if="activeData['inactive-text'] !== undefined"
              :label="t('build.rightPanel.label.inactiveText')"
            >
              <el-input v-model="activeData['inactive-text']" :placeholder="t('build.rightPanel.ph.inactiveText')" />
            </el-form-item>
            <el-form-item
              v-if="activeData['active-value'] !== undefined"
              :label="t('build.rightPanel.label.activeValue')"
            >
              <el-input
                :value="setDefaultValue(activeData['active-value'])"
                :placeholder="t('build.rightPanel.ph.activeValue')"
                @input="onSwitchValueInput($event, 'active-value')"
              />
            </el-form-item>
            <el-form-item
              v-if="activeData['inactive-value'] !== undefined"
              :label="t('build.rightPanel.label.inactiveValue')"
            >
              <el-input
                :value="setDefaultValue(activeData['inactive-value'])"
                :placeholder="t('build.rightPanel.ph.inactiveValue')"
                :maxlength="100"
                @input="onSwitchValueInput($event, 'inactive-value')"
              />
            </el-form-item>
            <el-form-item
              v-if="activeData.type !== undefined && 'el-date-picker' === activeData.tag"
              :label="t('build.rightPanel.label.dateType')"
            >
              <el-select
                v-model="activeData.type"
                :placeholder="t('build.rightPanel.ph.dateType')"
                :style="{ width: '100%' }"
                @change="dateTypeChange"
              >
                <el-option v-for="item in dateOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="activeData.name !== undefined" :label="t('build.rightPanel.label.fileName')">
              <el-input v-model="activeData.name" :placeholder="t('build.rightPanel.ph.fileName')" />
            </el-form-item>
            <el-form-item v-if="activeData.accept !== undefined" :label="t('build.rightPanel.label.fileType')">
              <el-select
                v-model="activeData.accept"
                :placeholder="t('build.rightPanel.ph.fileType')"
                :style="{ width: '100%' }"
                clearable
              >
                <el-option :label="t('build.rightPanel.fileType.image')" value="image/*" />
                <el-option :label="t('build.rightPanel.fileType.video')" value="video/*" />
                <el-option :label="t('build.rightPanel.fileType.audio')" value="audio/*" />
                <el-option label="excel" value=".xls,.xlsx" />
                <el-option label="word" value=".doc,.docx" />
                <el-option label="pdf" value=".pdf" />
                <el-option label="txt" value=".txt" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="activeData.fileSize !== undefined" :label="t('build.rightPanel.label.fileSize')">
              <el-input v-model.number="activeData.fileSize" :placeholder="t('build.rightPanel.ph.fileSize')">
                <template #append>
                  <el-select v-model="activeData.sizeUnit" :style="{ width: '66px' }">
                    <el-option label="KB" value="KB" />
                    <el-option label="MB" value="MB" />
                    <el-option label="GB" value="GB" />
                  </el-select>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item v-if="activeData.action !== undefined" :label="t('build.rightPanel.label.action')">
              <el-input v-model="activeData.action" :placeholder="t('build.rightPanel.ph.action')" clearable />
            </el-form-item>
            <el-form-item v-if="activeData['list-type'] !== undefined" :label="t('build.rightPanel.label.listType')">
              <el-radio-group v-model="activeData['list-type']" size="small">
                <el-radio-button value="text">text</el-radio-button>
                <el-radio-button value="picture">picture</el-radio-button>
                <el-radio-button value="picture-card">picture-card</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item
              v-if="activeData.buttonText !== undefined && 'picture-card' !== activeData['list-type']"
              :label="t('build.rightPanel.label.buttonText')"
            >
              <el-input v-model="activeData.buttonText" :placeholder="t('build.rightPanel.ph.buttonText')" />
            </el-form-item>
            <el-form-item
              v-if="activeData['range-separator'] !== undefined"
              :label="t('build.rightPanel.label.rangeSeparator')"
            >
              <el-input
                v-model="activeData['range-separator']"
                :placeholder="t('build.rightPanel.ph.rangeSeparator')"
              />
            </el-form-item>
            <el-form-item
              v-if="activeData['picker-options'] !== undefined"
              :label="t('build.rightPanel.label.pickerOptions')"
            >
              <el-input
                v-model="activeData['picker-options'].selectableRange"
                :placeholder="t('build.rightPanel.ph.pickerOptions')"
              />
            </el-form-item>
            <el-form-item v-if="activeData.format !== undefined" :label="t('build.rightPanel.label.format')">
              <el-input
                :value="activeData.format"
                :placeholder="t('build.rightPanel.ph.format')"
                :maxlength="100"
                @input="setTimeValue($event)"
              />
            </el-form-item>
            <template v-if="['el-checkbox-group', 'el-radio-group', 'el-select'].indexOf(activeData.tag) > -1">
              <el-divider>{{ t('build.rightPanel.options') }}</el-divider>
              <draggable
                :list="activeData.options"
                :animation="340"
                group="selectItem"
                handle=".option-drag"
                item-key="label"
              >
                <template #item="{ element, index }">
                  <div :key="element.label" class="select-item flex border border-dashed box-border">
                    <div
                      class="select-line-icon option-drag leading-8 text-[22px] px-1 text-text-secondary cursor-move"
                    >
                      <i class="el-icon-s-operation" />
                    </div>
                    <el-input v-model="element.label" :placeholder="t('build.rightPanel.ph.optionName')" size="small" />
                    <el-input
                      :placeholder="t('build.rightPanel.ph.optionValue')"
                      size="small"
                      :value="element.value"
                      @input="setOptionValue(element, $event)"
                    />
                    <div
                      class="close-btn select-line-icon leading-8 text-[22px] px-1 text-text-secondary"
                      @click="activeData.options.splice(index, 1)"
                    >
                      <el-icon>
                        <Remove />
                      </el-icon>
                    </div>
                  </div>
                </template>
              </draggable>
              <div>
                <el-button icon="CirclePlus" class="ml-2 mt-2.5" text bg type="primary" @click="addSelectItem">
                  {{ t('build.rightPanel.btn.addOption') }}
                </el-button>
              </div>
              <el-divider />
            </template>

            <template v-if="['el-cascader'].indexOf(activeData.tag) > -1">
              <el-divider>{{ t('build.rightPanel.options') }}</el-divider>
              <el-form-item :label="t('build.rightPanel.label.dataType')">
                <el-radio-group v-model="activeData.dataType" size="small">
                  <el-radio-button value="dynamic">
                    {{ t('build.rightPanel.radio.dataTypeDynamic') }}
                  </el-radio-button>
                  <el-radio-button value="static">
                    {{ t('build.rightPanel.radio.dataTypeStatic') }}
                  </el-radio-button>
                </el-radio-group>
              </el-form-item>

              <template v-if="activeData.dataType === 'dynamic'">
                <el-form-item :label="t('build.rightPanel.label.labelKey')">
                  <el-input v-model="activeData.labelKey" :placeholder="t('build.rightPanel.ph.labelKey')" />
                </el-form-item>
                <el-form-item :label="t('build.rightPanel.label.valueKey')">
                  <el-input v-model="activeData.valueKey" :placeholder="t('build.rightPanel.ph.valueKey')" />
                </el-form-item>
                <el-form-item :label="t('build.rightPanel.label.childrenKey')">
                  <el-input v-model="activeData.childrenKey" :placeholder="t('build.rightPanel.ph.childrenKey')" />
                </el-form-item>
              </template>

              <el-tree
                v-if="activeData.dataType === 'static'"
                draggable
                :data="activeData.options"
                node-key="id"
                :expand-on-click-node="false"
                :render-content="renderContent"
              />
              <div v-if="activeData.dataType === 'static'">
                <el-button icon="CirclePlus" class="ml-0 mt-2.5" type="primary" text bg @click="addTreeItem">
                  {{ t('build.rightPanel.btn.addParent') }}
                </el-button>
              </div>
              <el-divider />
            </template>

            <el-form-item v-if="activeData.optionType !== undefined" :label="t('build.rightPanel.label.optionType')">
              <el-radio-group v-model="activeData.optionType">
                <el-radio-button value="default">
                  {{ t('build.rightPanel.radio.optionDefault') }}
                </el-radio-button>
                <el-radio-button value="button">
                  {{ t('build.rightPanel.radio.optionButton') }}
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item
              v-if="activeData['active-color'] !== undefined"
              :label="t('build.rightPanel.label.activeColor')"
            >
              <el-color-picker v-model="activeData['active-color']" />
            </el-form-item>
            <el-form-item
              v-if="activeData['inactive-color'] !== undefined"
              :label="t('build.rightPanel.label.inactiveColor')"
            >
              <el-color-picker v-model="activeData['inactive-color']" />
            </el-form-item>

            <el-form-item v-if="activeData['allow-half'] !== undefined" :label="t('build.rightPanel.label.allowHalf')">
              <el-switch v-model="activeData['allow-half']" />
            </el-form-item>
            <el-form-item v-if="activeData['show-text'] !== undefined" :label="t('build.rightPanel.label.showText')">
              <el-switch v-model="activeData['show-text']" @change="rateTextChange" />
            </el-form-item>
            <el-form-item v-if="activeData['show-score'] !== undefined" :label="t('build.rightPanel.label.showScore')">
              <el-switch v-model="activeData['show-score']" @change="rateScoreChange" />
            </el-form-item>
            <el-form-item v-if="activeData['show-stops'] !== undefined" :label="t('build.rightPanel.label.showStops')">
              <el-switch v-model="activeData['show-stops']" />
            </el-form-item>
            <el-form-item v-if="activeData.range !== undefined" :label="t('build.rightPanel.label.range')">
              <el-switch v-model="activeData.range" @change="rangeChange" />
            </el-form-item>
            <el-form-item
              v-if="activeData.border !== undefined && activeData.optionType === 'default'"
              :label="t('build.rightPanel.label.border')"
            >
              <el-switch v-model="activeData.border" />
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-color-picker'" :label="t('build.rightPanel.label.colorFormat')">
              <el-select
                v-model="activeData['color-format']"
                :placeholder="t('build.rightPanel.ph.colorFormat')"
                :style="{ width: '100%' }"
                @change="colorFormatChange"
              >
                <el-option
                  v-for="item in colorFormatOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item
              v-if="
                activeData.size !== undefined &&
                (activeData.optionType === 'button' || activeData.border || activeData.tag === 'el-color-picker')
              "
              :label="t('build.rightPanel.label.size')"
            >
              <el-radio-group v-model="activeData.size">
                <el-radio-button value="large">
                  {{ t('build.rightPanel.radio.sizeLarge') }}
                </el-radio-button>
                <el-radio-button value="default">
                  {{ t('build.rightPanel.radio.sizeDefault') }}
                </el-radio-button>
                <el-radio-button value="small">
                  {{ t('build.rightPanel.radio.sizeSmall') }}
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item
              v-if="activeData['show-word-limit'] !== undefined"
              :label="t('build.rightPanel.label.showWordLimit')"
            >
              <el-switch v-model="activeData['show-word-limit']" />
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-input-number'" :label="t('build.rightPanel.label.stepStrictly')">
              <el-switch v-model="activeData['step-strictly']" />
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-cascader'" :label="t('build.rightPanel.label.multipleCascade')">
              <el-switch v-model="activeData.props.props.multiple" />
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-cascader'" :label="t('build.rightPanel.label.showAllLevels')">
              <el-switch v-model="activeData['show-all-levels']" />
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-cascader'" :label="t('build.rightPanel.label.filterable')">
              <el-switch v-model="activeData.filterable" />
            </el-form-item>
            <el-form-item v-if="activeData.clearable !== undefined" :label="t('build.rightPanel.label.clearable')">
              <el-switch v-model="activeData.clearable" />
            </el-form-item>
            <el-form-item v-if="activeData.showTip !== undefined" :label="t('build.rightPanel.label.showTip')">
              <el-switch v-model="activeData.showTip" />
            </el-form-item>
            <el-form-item v-if="activeData.multiple !== undefined" :label="t('build.rightPanel.label.multiple')">
              <el-switch v-model="activeData.multiple" />
            </el-form-item>
            <el-form-item
              v-if="activeData['auto-upload'] !== undefined"
              :label="t('build.rightPanel.label.autoUpload')"
            >
              <el-switch v-model="activeData['auto-upload']" />
            </el-form-item>
            <el-form-item v-if="activeData.readonly !== undefined" :label="t('build.rightPanel.label.readonly')">
              <el-switch v-model="activeData.readonly" />
            </el-form-item>
            <el-form-item v-if="activeData.disabled !== undefined" :label="t('build.rightPanel.label.disabled')">
              <el-switch v-model="activeData.disabled" />
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-select'" :label="t('build.rightPanel.label.filterableSelect')">
              <el-switch v-model="activeData.filterable" />
            </el-form-item>
            <el-form-item v-if="activeData.tag === 'el-select'" :label="t('build.rightPanel.label.multipleSelect')">
              <el-switch v-model="activeData.multiple" @change="multipleChange" />
            </el-form-item>
            <el-form-item v-if="activeData.required !== undefined" :label="t('build.rightPanel.label.required')">
              <el-switch v-model="activeData.required" />
            </el-form-item>

            <template v-if="activeData.layoutTree">
              <el-divider>{{ t('build.rightPanel.layoutTree') }}</el-divider>
              <el-tree :data="[activeData]" :props="layoutTreeProps" node-key="renderKey" default-expand-all draggable>
                <template #default="{ node, data }">
                  <span class="node-label text-sm">
                    <svg-icon class="node-icon text-text-placeholder mr-1" :icon-class="data.tagIcon" />
                    {{ node.label }}
                  </span>
                </template>
              </el-tree>
            </template>

            <template v-if="activeData.layout === 'colFormItem'">
              <el-divider>{{ t('build.rightPanel.regexValidate') }}</el-divider>
              <div
                v-for="(item, index) in activeData.regList"
                :key="item.pattern"
                class="reg-item py-3 px-1.5 relative rounded"
              >
                <span class="close-btn" @click="activeData.regList.splice(index, 1)">
                  <el-icon>
                    <Close />
                  </el-icon>
                </span>
                <el-form-item :label="t('build.rightPanel.label.expression')">
                  <el-input v-model="item.pattern" :placeholder="t('build.rightPanel.ph.pattern')" :maxlength="255" />
                </el-form-item>
                <el-form-item :label="t('build.rightPanel.label.errorTip')" class="mb-0">
                  <el-input v-model="item.message" :placeholder="t('build.rightPanel.ph.errorTip')" />
                </el-form-item>
              </div>
              <div>
                <el-button icon="CirclePlus" class="ml-0 mt-2.5" type="primary" text bg @click="addReg">
                  {{ t('build.rightPanel.btn.addRule') }}
                </el-button>
              </div>
            </template>
          </el-form>
        </Transition>
        <!-- 表单属性 -->
        <Transition name="fade-slide">
          <form-props-panel v-if="currentTab === 'form'" :form-conf="formConf" />
        </Transition>
      </el-scrollbar>
    </div>
    <icons-dialog v-model="iconsVisible" :current="activeData[currentIconModel]" @select="setIcon" />
    <treeNode-dialog v-model="dialogVisible" @commit="addNode" />
  </div>
</template>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
/* eslint-disable @typescript-eslint/no-explicit-any */
// 表单构建器属性面板：Vue 2 风格直接修改 props，activeData 字段结构由用户配置动态决定
import draggable from 'vuedraggable'
import { isNumberStr } from '@/utils/index'
import IconsDialog from './IconsDialog.vue'
import TreeNodeDialog from './TreeNodeDialog.vue'
import FormPropsPanel from './FormPropsPanel.vue'
import {
  createDateTimeFormat,
  createDateTypeOptions,
  createDateRangeTypeOptions,
  createColorFormatOptions,
  createJustifyOptions,
  createTagList
} from './rightPanelOptions'
import { inputComponents, selectComponents } from '@/utils/generator/config'
import { useTreeNode } from './useTreeNode'

const { t } = useI18n()
const idGlobal = defineModel<number>('idGlobal', { default: 100 })
const dateTimeFormat = createDateTimeFormat((key) => t(key))
const props = defineProps<{
  showField: boolean
  activeData: any
  formConf: any
}>()

const data = reactive({
  currentTab: 'field',
  iconsVisible: false,
  currentIconModel: null,
  dateTypeOptions: createDateTypeOptions((key) => t(key)),
  dateRangeTypeOptions: createDateRangeTypeOptions((key) => t(key)),
  colorFormatOptions: createColorFormatOptions(),
  justifyOptions: createJustifyOptions(),
  layoutTreeProps: {
    label(data: any, _node: any) {
      return data.componentName || `${data.label}: ${data.vModel}`
    }
  }
})

const {
  currentTab,
  iconsVisible,
  currentIconModel,
  dateTypeOptions,
  dateRangeTypeOptions,
  colorFormatOptions,
  justifyOptions,
  layoutTreeProps
} = toRefs(data)

// 树节点编辑逻辑（节点对话框状态与增删操作；append/remove 仅在使用树内 renderContent 的闭包中使用）
const { currentNode, dialogVisible, renderContent, addNode } = useTreeNode(idGlobal)

const documentLink = computed<string>(
  () => props.activeData.document || 'https://element-plus.org/zh-CN/guide/installation'
)

const dateOptions = computed(() => {
  if (props.activeData.type !== undefined && props.activeData.tag === 'el-date-picker') {
    if (props.activeData['start-placeholder'] === undefined) {
      return dateTypeOptions.value
    }
    return dateRangeTypeOptions.value
  }
  return []
})

const tagList = ref(createTagList((key) => t(key)))

const emit = defineEmits(['tag-change'])

function addReg(): void {
  if (!props.activeData.regList) {
    props.activeData.regList = []
  }
  props.activeData.regList.push({
    pattern: '',
    message: ''
  })
}
function addSelectItem(): void {
  if (!props.activeData.options) {
    props.activeData.options = []
  }
  props.activeData.options.push({
    label: '',
    value: ''
  })
}

function addTreeItem(): void {
  idGlobal.value++
  dialogVisible.value = true
  currentNode.value = props.activeData.options
}

function setOptionValue(item: { value: any }, val: string): void {
  item.value = isNumberStr(val) ? +val : val
}
function setDefaultValue(val: any): string {
  if (Array.isArray(val)) {
    return val.join(',')
  }
  if (['string', 'number'].indexOf(typeof val) > -1) {
    return String(val)
  }
  if (typeof val === 'boolean') {
    return `${val}`
  }
  return String(val)
}

function onDefaultValueInput(str: string): void {
  if (Array.isArray(props.activeData.defaultValue)) {
    // 数组
    props.activeData.defaultValue = str.split(',').map((val) => (isNumberStr(val) ? +val : val))
  } else if (['true', 'false'].indexOf(str) > -1) {
    // 布尔
    props.activeData.defaultValue = JSON.parse(str)
  } else {
    // 字符串和数字
    props.activeData.defaultValue = isNumberStr(str) ? +str : str
  }
}

function onSwitchValueInput(val: string, name: string): void {
  if (['true', 'false'].indexOf(val) > -1) {
    props.activeData[name] = JSON.parse(val)
  } else {
    props.activeData[name] = isNumberStr(val) ? +val : val
  }
}

function setTimeValue(val: string, type?: string): void {
  const valueFormat = type === 'week' ? dateTimeFormat.date : val
  props.activeData.defaultValue = null
  props.activeData['value-format'] = valueFormat
  props.activeData.format = val
}

function spanChange(val: number): void {
  props.formConf.span = val
}

function multipleChange(val: boolean): void {
  props.activeData.defaultValue = val ? [] : ''
}

function dateTypeChange(val: string): void {
  setTimeValue(dateTimeFormat[val], val)
}

function rangeChange(val: boolean): void {
  props.activeData.defaultValue = val ? [props.activeData.min, props.activeData.max] : props.activeData.min
}

function rateTextChange(val: boolean): void {
  if (val) props.activeData['show-score'] = false
}

function rateScoreChange(val: boolean): void {
  if (val) props.activeData['show-text'] = false
}

function colorFormatChange(val: string): void {
  props.activeData.defaultValue = null
  props.activeData['show-alpha'] = val.indexOf('a') > -1
  props.activeData.renderKey = +new Date() // 更新renderKey,重新渲染该组件
}

function openIconsDialog(model: string): void {
  iconsVisible.value = true
  currentIconModel.value = model
}

function setIcon(val: string): void {
  if (currentIconModel.value) {
    props.activeData[currentIconModel.value] = val
  }
}

function tagChange(tagIcon: string): void {
  let target: Record<string, any> | undefined
  target = inputComponents.find((item) => item.tagIcon === tagIcon)
  if (!target) {
    target = selectComponents.find((item) => item.tagIcon === tagIcon)
  }
  if (target) {
    emit('tag-change', target)
  }
}
</script>

<style lang="scss" scoped>
.right-board {
  width: 350px;
  position: absolute;
  right: 0;
  top: 0;
  padding-top: 3px;

  &:deep() {
    .el-tabs__header {
      margin: 0;
    }

    .el-input-group__append .el-button {
      display: inline-flex;
    }
  }

  .field-box {
    position: relative;
    height: calc(100vh - 50px - 40px - 42px);
    box-sizing: border-box;
    overflow: hidden;
  }

  .el-scrollbar {
    height: 100%;

    &:deep() {
      .el-scrollbar__view {
        padding: 30px 20px;
      }
    }
  }
}

.reg-item {
  background: var(--el-border-color-extra-light);

  .close-btn {
    position: absolute;
    right: -6px;
    top: -6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    line-height: 16px;
    background: var(--el-overlay-color-light);
    border-radius: 50%;
    color: var(--el-color-white);
    z-index: 1;
    cursor: pointer;
    font-size: 12px;
  }
}

.select-item {
  border-color: var(--el-bg-color);

  & .close-btn {
    cursor: pointer;
    color: var(--el-color-danger);
  }

  & .el-input + .el-input {
    margin-left: 4px;
  }
}

.select-item + .select-item {
  margin-top: 4px;
}

.select-item.sortable-chosen {
  border: 1px dashed var(--el-color-primary);
}

.time-range {
  .el-date-editor {
    width: 227px;
  }

  :deep() {
    .el-icon-time {
      display: none;
    }
  }
}

.custom-tree-node {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  padding-right: 8px;
}
</style>
