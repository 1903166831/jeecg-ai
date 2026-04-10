
<template>
  <div class="structured-panel">
    <div class="panel-header">
      <div class="panel-title-group">
        <div class="panel-eyebrow">数据渲染区</div>
        <div class="panel-title">{{ title || '结构化内容预览' }}</div>
      </div>
      <div v-if="typeLabel" class="panel-type">{{ typeLabel }}</div>
    </div>

    <div v-if="summary" class="panel-summary">{{ summary }}</div>

    <div v-if="content" ref="panelBodyRef" class="panel-body markdown-body" v-html="parsedText" />
    <div v-else class="panel-empty">
      <div class="panel-empty-title">等待结构化内容</div>
      <div class="panel-empty-desc">
        右侧会话检测到表格、代码块、长文档、图片等结构化 Markdown 内容后，会自动转到这里渲染。
      </div>
    </div>

    <ImageViewer v-if="amplifyImage" :imageUrl="imageUrl" @hide="pictureHide" />

    <template v-if="jeecgTagList.length">
      <template v-for="item of jeecgTagList" :key="item.key">
        <teleport :to="item.to">
          <Component :is="item.tag.component" :data="item.data" :loading="loading" />
        </teleport>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
  import type { JeecgTag } from '../jeecg-tags/types';
  import { computed, nextTick, onMounted, onUnmounted, onUpdated, ref, watch } from 'vue';
  import * as lodash from 'lodash';
  import MarkdownIt from 'markdown-it';
  import mdKatex from '@traptitech/markdown-it-katex';
  import mila from 'markdown-it-link-attributes';
  import hljs from 'highlight.js';
  import '../style/github-markdown.less';
  import '../style/highlight.less';
  import '../style/style.less';
  import ImageViewer from './ImageViewer.vue';
  import { useGlobSetting } from "@/hooks/setting";
  import { mdPluginJeecgTag, jeecgTagMap } from '../jeecg-tags'

  const props = defineProps({
    content: { type: String, default: '' },
    title: { type: String, default: '' },
    summary: { type: String, default: '' },
    type: { type: String, default: '' },
    loading: { type: Boolean, default: false },
  });

  const { domainUrl } = useGlobSetting();
  const parsedText = ref('');
  const panelBodyRef = ref<HTMLDivElement>();
  const imageUrl = ref('');
  const amplifyImage = ref(false);

  const jeecgTagList = ref<{
    key: string;
    to: HTMLDivElement;
    tag: JeecgTag;
    data: string;
  }[]>([]);

  const mdi = new MarkdownIt({
    html: true,
    linkify: true,
    highlight(code, language) {
      const validLang = !!(language && hljs.getLanguage(language));
      if (validLang) {
        const lang = language ?? '';
        return highlightBlock(hljs.highlight(code, { language: lang }).value, lang);
      }
      return highlightBlock(hljs.highlightAuto(code).value, '');
    },
  });

  mdi.use(mdPluginJeecgTag);
  mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } });
  mdi.use(mdKatex, { blockClass: 'katexmath-block rounded-md p-[10px]', errorColor: ' #cc0000' });

  const typeLabel = computed(() => {
    const map = {
      table: '表格',
      chart: '图表',
      code: '代码',
      image: '图片',
      file: '文件',
      markdown: 'Markdown',
      card: '卡片',
    };
    return map[props.type] || '';
  });

  const updateTextContent = lodash.throttle(() => {
    let value = props.content ?? '';
    value = replaceImageWith(value);
    value = replaceDomainUrl(value);
    parsedText.value = mdi.render(value);
    parseJeecgTag();
  }, 80);

  watch(() => props.content, () => updateTextContent(), { immediate: true });
  watch(() => props.loading, () => updateTextContent());

  function replaceImageWith(markdownContent) {
    const regex = /!\[([^\]]*)\]\(([^)]+)\s=([0-9]+)\)/g;
    return markdownContent.replace(regex, (match, alt, src, width) => {
      let reg = /#\s*{\s*domainURL\s*}/g;
      src = src.replace(reg, domainUrl);
      return `<div><img src='${src}' alt='${alt}' width='${width}' /></div>`;
    });
  }

  function replaceDomainUrl(markdownContent) {
    const regex = /!\[([^\]]*)\]\(.*?#\s*{\s*domainURL\s*}.*?\)/g;
    return markdownContent.replace(regex, (match) => {
      let reg = /#\s*{\s*domainURL\s*}/g;
      return match.replace(reg, domainUrl);
    });
  }

  function highlightBlock(str: string, lang?: string) {
    return `<pre class="code-block-wrapper"><div class="code-block-header"><span class="code-block-header__lang">${lang || ''}</span><span class="code-block-header__copy">复制代码</span></div><code class="hljs code-block-body ${lang || ''}">${str}</code></pre>`;
  }

  function addCopyEvents() {
    if (!panelBodyRef.value) return;
    const copyBtn = panelBodyRef.value.querySelectorAll('.code-block-header__copy');
    copyBtn.forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = (btn as HTMLElement).parentElement?.nextElementSibling?.textContent;
        if (code) {
          copyToClip(code).then(() => {
            (btn as HTMLElement).textContent = '复制成功';
            setTimeout(() => {
              (btn as HTMLElement).textContent = '复制代码';
            }, 1000);
          });
        }
      });
    });
  }

  function addImageClickEvent() {
    if (!panelBodyRef.value) return;
    const images = panelBodyRef.value.querySelectorAll('img');
    images.forEach((img) => {
      img.addEventListener('click', () => {
        imageUrl.value = (img as HTMLImageElement).src;
        amplifyImage.value = true;
      });
    });
  }

  function pictureHide() {
    amplifyImage.value = false;
    imageUrl.value = '';
  }

  function copyToClip(text: string) {
    return new Promise((resolve) => {
      const input: HTMLTextAreaElement = document.createElement('textarea');
      input.setAttribute('readonly', 'readonly');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      if (document.execCommand('copy')) document.execCommand('copy');
      document.body.removeChild(input);
      resolve(true);
    });
  }

  function parseJeecgTag() {
    if (!panelBodyRef.value) return;
    jeecgTagList.value = [];

    nextTick(() => {
      if (!panelBodyRef.value) return;
      const selector = `.markdown-body .${Object.keys(jeecgTagMap).join(`, .markdown-body .`)}`;
      const els = panelBodyRef.value.querySelectorAll<HTMLDivElement>(selector);
      els.forEach((el, idx) => {
        const tagName = [...el.classList].find((cls) => !!jeecgTagMap[cls]);
        if (!tagName) return;
        const tag = jeecgTagMap[tagName];
        const data = decodeURIComponent(el.dataset.data || '');
        jeecgTagList.value.push({
          key: `${tagName}-${idx}`,
          to: el,
          tag,
          data,
        });
      });
    });
  }

  onMounted(() => {
    addCopyEvents();
    addImageClickEvent();
  });

  onUpdated(() => {
    addCopyEvents();
    addImageClickEvent();
  });

  onUnmounted(() => {
    jeecgTagList.value = [];
  });
</script>

<style scoped lang="less">
.structured-panel{
  display:flex;
  flex-direction:column;
  height:100%;
  min-height:0;
  border-radius:24px;
  background:linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%);
  border:1px solid rgba(226,232,240,0.96);
  box-shadow:0 18px 44px rgba(15,23,42,.08);
  overflow:hidden;
}
.panel-header{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
  padding:18px 20px 14px;
  border-bottom:1px solid #edf2f7;
  background:rgba(255,255,255,.76);
  backdrop-filter: blur(12px);
}
.panel-eyebrow{
  font-size:12px;
  color:#64748b;
  margin-bottom:4px;
}
.panel-title{
  font-size:18px;
  font-weight:600;
  color:#0f172a;
  line-height:1.3;
}
.panel-type{
  flex:none;
  padding:6px 10px;
  border-radius:999px;
  background:#eff6ff;
  color:#2563eb;
  font-size:12px;
  font-weight:600;
}
.panel-summary{
  padding:14px 20px 0;
  font-size:13px;
  color:#64748b;
  line-height:1.65;
}
.panel-body{
  flex:1;
  min-height:0;
  overflow:auto;
  padding:18px 20px 24px;
}
.panel-body :deep(table){
  width:100%;
}
.panel-body :deep(img){
  max-width:100%;
  border-radius:16px;
  cursor:zoom-in;
  box-shadow:0 12px 24px rgba(15,23,42,.08);
}
.panel-empty{
  margin:auto;
  max-width:420px;
  text-align:center;
  padding:40px 24px;
}
.panel-empty-title{
  font-size:18px;
  font-weight:600;
  color:#0f172a;
  margin-bottom:10px;
}
.panel-empty-desc{
  font-size:14px;
  line-height:1.7;
  color:#64748b;
}
@media (max-width: 768px){
  .structured-panel{
    border-radius:18px;
  }
  .panel-header{
    padding:14px 16px 12px;
  }
  .panel-body{
    padding:14px 16px 18px;
  }
}
</style>
