<template>
  <div class="structured-panel" :class="[panelModeClass]">
    <div class="panel-shell">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-eyebrow">{{ panelMode === 'file' ? '文件预览区' : '数据渲染区' }}</div>
          <div class="panel-title">{{ panelTitle }}</div>
        </div>
        <div v-if="typeLabel" class="panel-type">{{ typeLabel }}</div>
      </div>

      <div v-if="summary && panelMode !== 'file'" class="panel-summary">{{ summary }}</div>

      <div v-if="panelMode === 'file' && hasFileCard" class="inline-file-card compact-card preview-card">
        <div class="inline-file-main">
          <div class="inline-file-icon">
            <Icon :icon="fileCardIcon" size="20" />
          </div>
          <div class="inline-file-info">
            <div class="inline-file-name" :title="currentFileMeta.fileName">{{ currentFileMeta.fileName }}</div>
            <div class="inline-file-desc">{{ currentFileMeta.description || 'AI生成的文件结果' }}</div>
            <div class="inline-file-meta">
              <span>{{ String(currentFileMeta.fileType || '').toUpperCase() }}</span>
            </div>
          </div>
        </div>
        <div class="inline-file-actions">
          <a-button
            size="small"
            type="primary"
            :disabled="currentFileMeta.canPreview === false"
            @click="$emit('preview-file', currentFileMeta)"
          >
            文件预览
          </a-button>
          <a-button size="small" @click="downloadCurrentFile">下载</a-button>
        </div>
      </div>

      <div v-if="panelMode === 'file'" class="panel-body file-panel-body">
        <div v-if="fileLoading" class="panel-file-loading">正在加载文件预览...</div>

        <div v-else-if="filePreviewError" class="panel-empty file-empty">
          <div class="panel-empty-title">当前文件暂不支持在线预览</div>
          <div class="panel-empty-desc">{{ filePreviewError }}</div>
        </div>

        <template v-else-if="previewKind === 'table' && tablePreview.columns.length">
          <div class="table-preview-wrap">
            <table class="table-preview">
              <thead>
                <tr>
                  <th v-for="(column, index) in tablePreview.columns" :key="index">{{ column }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rowIndex) in tablePreview.rows" :key="rowIndex">
                  <td v-for="(cell, colIndex) in row" :key="colIndex">{{ cell ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <div v-else-if="isPdfFile" class="preview-frame-wrap">
          <iframe :src="fileSourceUrl" class="preview-frame"></iframe>
        </div>

        <div v-else-if="isImageFile" class="media-preview-wrap">
          <img :src="fileSourceUrl" class="image-preview" />
        </div>

        <div v-else-if="isVideoFile" class="media-preview-wrap">
          <video :src="fileSourceUrl" class="video-preview" controls></video>
        </div>

        <div v-else-if="isAudioFile" class="media-preview-wrap audio-wrap">
          <audio :src="fileSourceUrl" controls class="audio-preview"></audio>
        </div>

        <div v-else-if="isDocxFile" ref="docxContainerRef" class="docx-preview-wrap"></div>

        <div v-else class="panel-empty file-empty">
          <div class="panel-empty-title">当前文件暂不支持在线预览</div>
          <div class="panel-empty-desc">建议点击上方下载按钮查看原始文件。</div>
        </div>
      </div>

      <template v-else>
        <div v-if="content" ref="panelBodyRef" class="panel-body markdown-body" v-html="parsedText"></div>

        <div v-if="content && hasFileCard" class="inline-file-card compact-card data-inline-file-card">
          <div class="inline-file-main">
            <div class="inline-file-icon">
              <Icon :icon="fileCardIcon" size="18" />
            </div>
            <div class="inline-file-info">
              <div class="inline-file-name" :title="currentFileMeta.fileName">{{ currentFileMeta.fileName }}</div>
              <div class="inline-file-desc">{{ currentFileMeta.description || 'AI生成的文件结果' }}</div>
              <div class="inline-file-meta">
                <span>{{ String(currentFileMeta.fileType || '').toUpperCase() }}</span>
              </div>
            </div>
          </div>
          <div class="inline-file-actions">
            <a-button
              size="small"
              type="primary"
              :disabled="currentFileMeta.canPreview === false"
              @click="$emit('preview-file', currentFileMeta)"
            >
              文件预览
            </a-button>
            <a-button size="small" @click="downloadCurrentFile">下载</a-button>
          </div>
        </div>

        <div v-if="!content" class="panel-empty">
          <div class="panel-empty-title">等待结构化内容</div>
          <div class="panel-empty-desc">
            右侧会话检测到表格、代码块、长文档、图片、文件等结构化结果后，会自动转到这里渲染。
          </div>
        </div>

        <template v-if="jeecgTagList.length">
          <template v-for="item of jeecgTagList" :key="item.key">
            <teleport :to="item.to">
              <Component :is="item.tag.component" :data="item.data" :loading="loading" />
            </teleport>
          </template>
        </template>
      </template>
    </div>

    <ImageViewer v-if="amplifyImage" :imageUrl="imageUrl" @hide="pictureHide" />
  </div>
</template>

<script setup lang="ts">
import type { JeecgTag } from '../jeecg-tags/types'
import { computed, nextTick, onMounted, onUnmounted, onUpdated, ref, watch } from 'vue'
import * as lodash from 'lodash'
import MarkdownIt from 'markdown-it'
import mdKatex from '@traptitech/markdown-it-katex'
import mila from 'markdown-it-link-attributes'
import hljs from 'highlight.js'
import '../style/github-markdown.less'
import '../style/highlight.less'
import '../style/style.less'
import ImageViewer from './ImageViewer.vue'
import { useGlobSetting } from '@/hooks/setting'
import { mdPluginJeecgTag, jeecgTagMap } from '../jeecg-tags'
import { Icon } from '/@/components/Icon'
import {
  buildChatFileStaticUrl,
  downloadChatFileByFetch,
  getFilePreviewKind,
  loadTablePreviewFromFile,
} from '../utils/filePreview'

const emit = defineEmits(['preview-file'])

const props = defineProps({
  content: { type: String, default: '' },
  title: { type: String, default: '' },
  summary: { type: String, default: '' },
  type: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  fileMeta: { type: Object, default: null },
  panelMode: { type: String, default: 'data' },
})

const { domainUrl } = useGlobSetting()
const parsedText = ref('')
const panelBodyRef = ref<HTMLDivElement>()
const imageUrl = ref('')
const amplifyImage = ref(false)
const tablePreview = ref<{ columns: string[]; rows: any[][] }>({ columns: [], rows: [] })
const fileLoading = ref(false)
const filePreviewError = ref('')
const docxContainerRef = ref<HTMLDivElement>()

const jeecgTagList = ref<
  {
    key: string
    to: HTMLDivElement
    tag: JeecgTag
    data: string
  }[]
>([])

const mdi = new MarkdownIt({
  html: true,
  linkify: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      return highlightBlock(hljs.highlight(code, { language: lang }).value, lang)
    }
    return highlightBlock(hljs.highlightAuto(code).value, '')
  },
})

mdi.use(mdPluginJeecgTag)
mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
mdi.use(mdKatex, { blockClass: 'katexmath-block rounded-md p-[10px]', errorColor: ' #cc0000' })

const panelMode = computed(() => (props.panelMode === 'file' ? 'file' : 'data'))
const panelModeClass = computed(() => (panelMode.value === 'file' ? 'mode-file' : 'mode-data'))
const panelTitle = computed(() => {
  if (panelMode.value === 'file') {
    return currentFileMeta.value?.fileName || '文件预览'
  }
  return props.title || '结构化内容预览'
})

const typeLabel = computed(() => {
  const map: Record<string, string> = {
    table: '表格',
    chart: '图表',
    code: '代码',
    image: '图片',
    file: '文件',
    markdown: '文档',
  }
  return map[props.type || ''] || '数据'
})

const currentFileMeta = computed<Record<string, any>>(() => props.fileMeta || {})
const hasFileCard = computed(() => !!currentFileMeta.value?.fileUrl)
const previewKind = computed(() =>
  getFilePreviewKind(currentFileMeta.value?.fileType || currentFileMeta.value?.fileName || ''),
)
const fileSourceUrl = computed(() => buildChatFileStaticUrl(currentFileMeta.value?.fileUrl || ''))
const canRenderFilePreview = computed(
  () =>
    !!currentFileMeta.value?.fileUrl &&
    currentFileMeta.value?.canPreview !== false &&
    previewKind.value !== 'none',
)
const isPdfFile = computed(() => previewKind.value === 'pdf')
const isDocxFile = computed(() => previewKind.value === 'docx')
const isImageFile = computed(() => previewKind.value === 'image')
const isVideoFile = computed(() => previewKind.value === 'video')
const isAudioFile = computed(() => previewKind.value === 'audio')

const fileCardIcon = computed(() => {
  if (isPdfFile.value) return 'ant-design:file-pdf-outlined'
  if (isImageFile.value) return 'ant-design:file-image-outlined'
  if (isVideoFile.value) return 'ant-design:video-camera-outlined'
  if (isAudioFile.value) return 'ant-design:sound-outlined'
  if (isDocxFile.value) return 'ant-design:file-word-outlined'
  if (previewKind.value === 'table') return 'ant-design:file-excel-outlined'
  return 'ant-design:file-outlined'
})

const updateTextContent = lodash.throttle(() => {
  let value = props.content ?? ''
  value = replaceImageWith(value)
  value = replaceDomainUrl(value)
  parsedText.value = mdi.render(value)
  parseJeecgTag()
}, 80)

watch(
  () => props.content,
  () => {
    updateTextContent()
  },
  { immediate: true },
)

watch(
  () => props.loading,
  () => {
    updateTextContent()
  },
)

watch(
  () => [currentFileMeta.value?.fileUrl, currentFileMeta.value?.fileType, currentFileMeta.value?.canPreview, props.panelMode],
  async () => {
    tablePreview.value = { columns: [], rows: [] }
    filePreviewError.value = ''
    fileLoading.value = false

    if (docxContainerRef.value) {
      docxContainerRef.value.innerHTML = ''
    }

    if (panelMode.value !== 'file' || !canRenderFilePreview.value || !fileSourceUrl.value) {
      return
    }

    if (previewKind.value === 'table') {
      fileLoading.value = true
      try {
        tablePreview.value = await loadTablePreviewFromFile(fileSourceUrl.value)
      } catch (error) {
        console.error('表格预览失败', error)
        filePreviewError.value = '当前表格文件地址暂不支持浏览器在线读取，请下载查看。'
      } finally {
        fileLoading.value = false
      }
      return
    }

    if (previewKind.value === 'docx') {
      fileLoading.value = true
      await nextTick()
      try {
        const res = await fetch(fileSourceUrl.value, { credentials: 'include' })
        if (!res.ok) {
          throw new Error(`DOCX 加载失败: ${res.status}`)
        }
        const buffer = await res.arrayBuffer()
        const lib = await import('docx-preview')
        if (docxContainerRef.value) {
          docxContainerRef.value.innerHTML = ''
          await lib.renderAsync(buffer, docxContainerRef.value)
        }
      } catch (error) {
        console.error('DOCX 预览失败', error)
        filePreviewError.value = '当前 DOCX 文件地址暂不支持浏览器在线读取，请下载查看。'
      } finally {
        fileLoading.value = false
      }
    }
  },
  { immediate: true },
)

function replaceImageWith(markdownContent: string) {
  const regex = /!\[([^\]]*)\]\(([^)]+)\s=([0-9]+)\)/g
  return markdownContent.replace(regex, (match, alt, src, width) => {
    const reg = /#\s*{\s*domainURL\s*}/g
    src = src.replace(reg, domainUrl)
    return `<div><img src='${src}' alt='${alt}' width='${width}' /></div>`
  })
}

function replaceDomainUrl(markdownContent: string) {
  const regex = /!\[([^\]]*)\]\(.*?#\s*{\s*domainURL\s*}.*?\)/g
  return markdownContent.replace(regex, (match) => {
    const reg = /#\s*{\s*domainURL\s*}/g
    return match.replace(reg, domainUrl)
  })
}

function highlightBlock(str: string, lang?: string) {
  return `<pre class="code-block-wrapper"><div class="code-block-header"><span class="code-block-header__lang">${lang || ''}</span><span class="code-block-header__copy">复制代码</span></div><code class="hljs code-block-body ${lang || ''}">${str}</code></pre>`
}

function addCopyEvents() {
  if (!panelBodyRef.value) return
  const copyBtn = panelBodyRef.value.querySelectorAll('.code-block-header__copy')
  copyBtn.forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = (btn as HTMLElement).parentElement?.nextElementSibling?.textContent
      if (code) {
        copyToClip(code).then(() => {
          ;(btn as HTMLElement).textContent = '复制成功'
          setTimeout(() => {
            ;(btn as HTMLElement).textContent = '复制代码'
          }, 1000)
        })
      }
    })
  })
}

function addImageClickEvent() {
  if (!panelBodyRef.value) return
  const images = panelBodyRef.value.querySelectorAll('img')
  images.forEach((img) => {
    img.addEventListener('click', () => {
      imageUrl.value = (img as HTMLImageElement).src
      amplifyImage.value = true
    })
  })
}

function pictureHide() {
  amplifyImage.value = false
  imageUrl.value = ''
}

function parseJeecgTag() {
  if (!panelBodyRef.value) return
  jeecgTagList.value = []
  const elements = panelBodyRef.value.querySelectorAll<HTMLElement>('.jeecg-tag-node')
  elements.forEach((el, index) => {
    const nodeType = el.dataset.tag
    if (!nodeType) return
    const tag = jeecgTagMap.get(nodeType)
    if (!tag) return
    jeecgTagList.value.push({
      key: `${nodeType}_${index}_${Date.now()}`,
      to: el,
      tag,
      data: el.dataset.raw || '',
    })
  })
}

async function copyToClip(text: string) {
  await navigator.clipboard.writeText(text)
}

function bindDomEvents() {
  nextTick(() => {
    addCopyEvents()
    addImageClickEvent()
  })
}

watch(
  () => parsedText.value,
  () => {
    bindDomEvents()
  },
)

onMounted(() => {
  bindDomEvents()
})

onUpdated(() => {
  bindDomEvents()
})

onUnmounted(() => {
  updateTextContent.cancel()
})

async function downloadCurrentFile() {
  if (!currentFileMeta.value?.fileUrl) return
  try {
    await downloadChatFileByFetch(currentFileMeta.value)
  } catch (error) {
    console.error('文件下载失败', error)
  }
}
</script>

<style scoped>
.structured-panel {
  height: 100%;
  min-height: 0;
}

.panel-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 16px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-eyebrow {
  font-size: 12px;
  color: #8c8c8c;
}

.panel-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f1f1f;
}

.panel-type {
  font-size: 12px;
  color: #1677ff;
  background: rgba(22, 119, 255, 0.08);
  padding: 4px 10px;
  border-radius: 999px;
}

.panel-summary {
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 10px;
  color: #595959;
  font-size: 13px;
  line-height: 1.7;
}

.inline-file-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #edf2f7;
  border-radius: 14px;
  padding: 12px 14px;
  background: #fff;
}

.compact-card {
  padding: 10px 12px;
  border-radius: 12px;
}

.data-inline-file-card {
  margin-top: 12px;
}

.inline-file-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.inline-file-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1677ff;
  flex-shrink: 0;
}

.inline-file-info {
  min-width: 0;
}

.inline-file-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f1f1f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inline-file-desc {
  font-size: 12px;
  color: #8c8c8c;
  margin-top: 2px;
}

.inline-file-meta {
  font-size: 12px;
  color: #1677ff;
  margin-top: 4px;
}

.inline-file-actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid #f1f5f9;
  border-radius: 16px;
  background: #fff;
}

.file-panel-body {
  padding: 12px;
}

.markdown-body {
  padding: 20px;
}

.panel-file-loading {
  font-size: 13px;
  color: #8c8c8c;
}

.panel-empty {
  border: 1px dashed #d9d9d9;
  border-radius: 16px;
  background: #fff;
  padding: 32px 24px;
  text-align: center;
}

.panel-empty-title {
  font-size: 15px;
  color: #262626;
  font-weight: 600;
}

.panel-empty-desc {
  font-size: 13px;
  color: #8c8c8c;
  margin-top: 8px;
  line-height: 1.7;
}

.table-preview-wrap {
  width: 100%;
  overflow: auto;
}

.table-preview {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table-preview th,
.table-preview td {
  border: 1px solid #f0f0f0;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}

.table-preview th {
  background: #fafafa;
  font-weight: 600;
}

.preview-frame-wrap,
.media-preview-wrap,
.docx-preview-wrap {
  width: 100%;
  min-height: 420px;
  background: #fff;
  border-radius: 12px;
  overflow: auto;
}

.preview-frame {
  width: 100%;
  min-height: 640px;
  border: none;
}

.image-preview,
.video-preview {
  width: 100%;
  display: block;
  border-radius: 12px;
}

.audio-wrap {
  min-height: auto;
  padding: 24px;
}

.audio-preview {
  width: 100%;
}

.docx-preview-wrap {
  padding: 12px;
}

.docx-preview-wrap :deep(section.docx) {
  box-shadow: none;
  margin: 0 auto;
}

.markdown-body :deep(img) {
  max-width: 100%;
  cursor: zoom-in;
}

.markdown-body :deep(.code-block-wrapper) {
  margin: 12px 0;
}

.markdown-body :deep(.code-block-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #111827;
  color: #fff;
  font-size: 12px;
  border-radius: 8px 8px 0 0;
}

.markdown-body :deep(.code-block-body) {
  display: block;
  padding: 12px;
  overflow: auto;
  border-radius: 0 0 8px 8px;
}

.file-empty {
  min-height: 240px;
}
</style>
