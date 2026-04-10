<template>
  <div class="chat" :class="[inversion === 'user' ? 'self' : 'chatgpt']" v-if="getText || hasActionContent || (props.presetQuestion && props.presetQuestion.length>0)">
    <div class="avatar" v-if="showAvatar !== 'no'">
      <img v-if="inversion === 'user'" :src="avatar()" />
      <img v-else :src="getAiImg()" />
    </div>
    <div class="content">
      <p class="date" v-if="showAvatar !== 'no'">
        <span v-if="inversion === 'ai'" style="margin-right: 10px">{{appData.name || 'AI助手'}}</span>
        <span>{{ dateTime }}</span>
      </p>
      <div v-if="inversion === 'user' && images && images.length>0" class="images">
          <div v-for="(item,index) in images" :key="index" class="image" @click="handlePreview(item)">
            <img :src="getImageUrl(item)"/>
          </div>
      </div>     
      <div v-if="inversion === 'user' && files && files.length>0" class="file-list">
          <div v-for="(item,index) in files" :key="index" class="file-item" @click="handleFilePreview(item?.filePath || item)">
            <div class="file-icon">
              <Icon :icon="getFileIcon(item?.filePath || item)" :color="getFileIconColor(item?.filePath || item)" size="24" />
            </div>
            <div class="file-name" :title="item.name">{{ getFileName(item?.filePath || item)}}</div>
          </div>
      </div>
      <div v-if="inversion === 'ai' && retrievalText && loading" class="retrieval">
        {{retrievalText}}
      </div>
      <div v-if="inversion === 'ai' && isCard" class="card">
        <a-row>
          <a-col :xl="6" :lg="8" :md="10" :sm="24" style="flex:1" v-for="item in getCardList()">
            <a-card class="ai-card" @click="aiCardHandleClick(item.linkUrl)">
               <div class="ai-card-title">{{item.productName}}</div>
               <div class="ai-card-img">
                 <img :src="item.productImage">
               </div>
               <span class="ai-card-desc">{{item.descr}}</span>
            </a-card>
          </a-col>
        </a-row>
      </div>
      <div v-if="inversion === 'ai' && isCardConfig" class="card">
        <a-row>
          <a-col :xl="6" :lg="8" :md="10" :sm="24" style="flex:1;margin-right: 10px;" v-for="item in getCardConfigList()">
            <CardTemplate :template-id="cardConfig?.templateId" :card-data="item" :card-config="cardConfig" @click="handleJumpClick(item)"></CardTemplate>
          </a-col>
        </a-row>
      </div>
      <div class="thinkArea" style="margin-bottom: 10px" v-if="!isCard && !isCardConfig && (eventType === 'thinking' || eventType === 'thinking_end')">
        <a-collapse v-model:activeKey="activeKey" ghost>
          <a-collapse-panel :key="uuid" :header="loading?'正在思考中':'思考结束'">
            <ThinkText :text="text" :inversion="inversion" :error="error" :loading="loading"></ThinkText>
          </a-collapse-panel>
        </a-collapse>
      </div>
      <div class="msgArea" v-else-if="!isCard && !isCardConfig" :class="showAvatar == 'no' ? 'hidden-avatar' : ''">
        <chatText :text="text" :inversion="inversion" :error="error" :errorMsg="errorMsg" :currentToolTag="currentToolTag" :loading="loading" :referenceKnowledge="referenceKnowledge" :isLast="isLast"></chatText>
      </div>
      <div
        v-if="inversion === 'ai' && structuredPreview && structuredPreview.cacheKey && structuredPreview.type !== 'file'"
        class="structured-action-bar"
        :class="showAvatar == 'no' ? 'hidden-avatar action-hidden-avatar' : ''"
      >
        <div class="structured-action-tip">
          <span class="structured-action-type">{{ structuredPreview.typeLabel || '结构化内容' }}</span>
          <span class="structured-action-text">点击查看可在中间区域渲染相关数据</span>
        </div>
        <a-button type="primary" size="small" class="structured-view-btn" @click="handleViewStructured">
          查看
        </a-button>
      </div>
      <div
        v-if="inversion === 'ai' && currentFileMeta && currentFileMeta.fileUrl"
        class="structured-action-bar file-action-card"
        :class="showAvatar == 'no' ? 'hidden-avatar action-hidden-avatar' : ''"
      >
        <div class="file-action-main">
          <div class="file-action-icon">
            <Icon :icon="getFileIcon(currentFileMeta.fileName || currentFileMeta.fileUrl)" :color="getFileIconColor(currentFileMeta.fileName || currentFileMeta.fileUrl)" size="26" />
          </div>
          <div class="file-action-info">
            <div class="file-action-name" :title="currentFileMeta.fileName">{{ currentFileMeta.fileName }}</div>
            <div class="file-action-desc">{{ currentFileMeta.description || 'AI 已生成文件结果' }}</div>
            <div class="file-action-meta">
              <span>{{ String(currentFileMeta.fileType || '').toUpperCase() }}</span>
            </div>
          </div>
        </div>
        <div class="file-action-buttons">
          <a-button type="primary" size="small" class="structured-view-btn" :disabled="currentFileMeta.canPreview === false" @click="handlePreviewFile">
            文件预览
          </a-button>
          <a-button size="small" class="structured-download-btn" @click="handleDownloadFile">
            下载
          </a-button>
        </div>
      </div>
      <div v-if="presetQuestion" v-for="item in presetQuestion" class="question" @click="presetQuestionClick(item.descr)">
        <span>{{item.descr}}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import chatText from './chatText.vue';
  import ThinkText from './ThinkText.vue';
  import defaultAvatar from "@/assets/images/ai/avatar.jpg";
  import { useUserStore } from '/@/store/modules/user';
  import defaultImg from '../img/ailogo.png';
  import { ref } from 'vue';
  import { buildUUID } from '/@/utils/uuid';
  import { getFileAccessHttpUrl, getFileIcon, getFileIconColor } from '/@/utils/common/compUtils';
  import { createImgPreview } from "@/components/Preview";
  import { computed } from "vue";
  import CardTemplate from '/@/views/super/airag/aiapp/chat/components/CardTemplate.vue';
  import { useGlobSetting } from "@/hooks/setting";
  import {encryptByBase64} from "@/utils/cipher";

  const { domainUrl, viewUrl } = useGlobSetting();
  const props = defineProps(['dateTime', 'text', 'inversion', 'error', 'loading','errorMsg', 'currentToolTag', 'appData','presetQuestion','images','retrievalText', 'referenceKnowledge', 'eventType', 'showAvatar',"files", 'isLast', 'structuredPreview', 'fileMeta']);

  const uuid = ref<any>(buildUUID());
  const activeKey = ref<any>(uuid.value);
  const getText = computed(()=>{
    let text = props.text || props.retrievalText;
    if(text){
      text = text.trim();
    }
    return text;
  })

  const currentFileMeta = computed(() => {
    return props.structuredPreview?.fileMeta || props.fileMeta || null;
  });
  const hasActionContent = computed(() => {
    return !!(currentFileMeta.value?.fileUrl || props.structuredPreview?.cacheKey);
  });

  const isCard = computed(() => {
    let text = props.text;
    if (text && text.indexOf('::card::') != -1) {
      return true;
    }
    return false;
  });  
  
  const isCardConfig = computed(() => {
    let text = props.text;
    if (text && text.indexOf('::cardConfig::') != -1) {
      return true;
    }
    return false;
  });
  //卡片配置
  const cardConfig = ref<any>();

  const { userInfo } = useUserStore();
  const avatar = () => {
    // return getFileAccessHttpUrl(userInfo?.avatar) || defaultAvatar;
    return defaultAvatar;
  };
  const emit = defineEmits(['send', 'view-structured', 'download-file', 'preview-file']);
  const getAiImg = () => {
    return getFileAccessHttpUrl(props.appData?.icon) || defaultImg;
  };

  /**
   * 预设问题点击事件
   *
   */
  function presetQuestionClick(descr) {
    emit("send",descr)
  }

  function handleViewStructured() {
    emit('view-structured', props.structuredPreview);
  }

  function handlePreviewFile() {
    emit('preview-file', currentFileMeta.value || null);
  }

  function handleDownloadFile() {
    emit('download-file', currentFileMeta.value || null);
  }

  /**
   * 获取图片
   *
   * @param item
   */
  function getImageUrl(item) {
    let url = item;
    if(item.hasOwnProperty('url')){
      url = item.url;
    }
    if(item.hasOwnProperty('base64Data') && item.base64Data){
      let mimeType = item.mimeType ? item.mimeType:'image/png';
      return "data:"+ mimeType +";base64,"+ item.base64Data;
    }
    return getFileAccessHttpUrl(url);
  }

  /**
   * 图片预览
   * @param url
   */
  function handlePreview(url){
    const onImgLoad = ({ index, url, dom }) => {
      console.log(`第${index + 1}张图片已加载，URL为：${url}`, dom);
    };
    let imageList = [getImageUrl(url)];
    createImgPreview({ imageList: imageList, defaultWidth: 700, rememberState: true, onImgLoad });
  }

  /**
   * 获取卡片列表
   */
  function getCardList() {
    let text = props.text;
    let card = text.replace('::card::', '').replace(/\s+/g, '');
    try {
      return JSON.parse(card);
    } catch (e) {
      console.log(e)
      return '';
    }
  }

  /**
   * ai卡片点击事件
   * @param url
   */
  function aiCardHandleClick(url){
    window.open(url,'_blank');
  }


  /**
   * 从config获取取卡片列表
   */
  function getCardConfigList() {
    let text = props.text;
    let card = text.replace('::cardConfig::', 'cardConfig').replace(/\s+/g, '');
    try {
      let parse = JSON.parse(card);
      cardConfig.value = JSON.parse(parse?.cardConfig);
      return JSON.parse(parse?.content);
    } catch (e){
      console.log(e)
      return '';
    }
  }

  /**
   * 卡片点击跳转
   */
  function handleJumpClick(item) {
    if(cardConfig.value?.enableJump){
      let src = item[cardConfig.value?.jumpUrl];
      let reg = /#\s*{\s*domainURL\s*}/g;
      src = src.replace(reg,domainUrl);
      window.open(src,"_blank")
    }
  }

  /**
   * 获取文件名字
   * 
   * @param fileUrl
   */
  function getFileName(fileUrl){
    if(!fileUrl) {
      return '未命名的文件';
    }
    let fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1).toLowerCase();
    fileName = fileName.substring(0,fileName.lastIndexOf("."));
    return fileName;
  }

  /**
   * 文件预览
   * 
   * @param fileUrl
   */
  function handleFilePreview(fileUrl) {
    let filePath = encodeURIComponent(encryptByBase64(getFileAccessHttpUrl(fileUrl)));
    let url = `${viewUrl}?url=` + filePath;
    window.open(url, "_blank")
  }
</script>

<style lang="less" scoped>
  .chat {
    display: flex;
    margin-bottom: 1.25rem;
    align-items: flex-start;
    &.self {
      flex-direction: row-reverse;
      .avatar {
        margin-right: 0;
        margin-left: 12px;
      }
      .msgArea {
        flex-direction: row-reverse;
        margin-bottom: 6px;
      }
      .thinkArea{
        margin: 0;
        padding: 6px 0 6px 22px;
        position: relative;
      }
      .date {
        text-align: right;
      }
    }
  }
  :deep(.ant-collapse-header){
    padding: 0 !important;
  }
  .hidden-avatar{
    left: 52px;
    position: relative;
    top: -12px;
  }
  .avatar {
    flex: none;
    margin-right: 12px;
    img {
      width: 38px;
      height: 38px;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
      object-fit: cover;
    }
    svg {
      font-size: 28px;
    }
  }
  .chat.chatgpt .avatar img{
    border-radius: 14px;
  }
  .content {
    width: 100%;
    min-width: 0;
    .date {
      color: #94a3b8;
      font-size: 12px;
      margin-bottom: 8px;
      padding: 0 4px;
    }
    .msgArea {
      display: flex;
    }
  }

  .structured-action-bar{
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px dashed #cfe0ff;
    background: rgba(239, 246, 255, 0.92);
  }
  .action-hidden-avatar{
    width: calc(100% - 52px);
  }
  .structured-action-tip{
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: #475569;
    font-size: 12px;
    line-height: 1.5;
  }
  .structured-action-type{
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    background: #dbeafe;
    color: #155eef;
    font-weight: 600;
  }
  .structured-action-text{
    min-width: 0;
  }
  .structured-view-btn{
    flex: none;
    border-radius: 10px;
    box-shadow: 0 8px 18px rgba(22, 119, 255, 0.16);
  }
  .file-action-card{
    align-items: center;
    border-style: solid;
    background: linear-gradient(180deg, rgba(239,246,255,0.96) 0%, rgba(248,250,252,0.96) 100%);
  }
  .file-action-main{
    display:flex;
    align-items:flex-start;
    gap:12px;
    min-width:0;
    flex:1;
  }
  .file-action-info{
    min-width:0;
    flex:1;
  }
  .file-action-name{
    font-size:13px;
    font-weight:600;
    color:#0f172a;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }
  .file-action-desc{
    margin-top:2px;
    font-size:12px;
    color:#64748b;
    line-height:1.5;
  }
  .file-action-meta{
    margin-top:6px;
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    font-size:12px;
    color:#475569;
  }
  .file-action-meta span{
    padding:2px 8px;
    border-radius:999px;
    background:rgba(255,255,255,0.88);
    border:1px solid #dbeafe;
  }
  .file-action-buttons{
    display:flex;
    gap:8px;
    flex:none;
  }
  .structured-download-btn{
    border-radius: 10px;
  }

  .question{
    margin-top: 10px;
    border-radius: 14px;
    padding: 10px 14px;
    background-color: #ffffff;
    font-size: 14px;
    line-height: 1.4;
    cursor: pointer;
    border: 1px solid #e6edf7;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
    transition: all 0.2s ease;
    &:hover {
      transform: translateY(-1px);
      border-color: #bfd4ff;
      box-shadow: 0 12px 24px rgba(22, 119, 255, 0.08);
    }
  }

  .images{
    margin-bottom: 10px;
    flex-wrap: wrap;
    display: flex;
    gap: 10px;
    justify-content: end;
    .image{
      width: 120px;
      height: 80px;
      cursor: pointer;
      img{
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 10px;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
      }
    }
  }

  .file-list {
    margin-bottom: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
  }

  .file-item {
    display: flex;
    align-items: center;
    background: #f4f7fb;
    border: 1px solid #e6edf7;
    border-radius: 12px;
    padding: 8px 12px;
    cursor: pointer;
    width: fit-content;
    max-width: 100%;
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.03);

    .file-icon {
      margin-right: 8px;
      display: flex;
      align-items: center;
    }

    .file-name {
      font-size: 14px;
      color: #334155;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 200px;
    }
  }

  .retrieval,
  .card {
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    font-size: 14px;
    line-height: 1.45;
    border-radius: 18px;
    padding: 12px 14px;
    border: 1px solid #e5edf7;
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
  }
  .retrieval:after{
    animation: blink 1s steps(5, start) infinite;
    color: #0f172a;
    content: '_';
    font-weight: 700;
    margin-left: 3px;
    vertical-align: baseline;
  }
  .card{
    width: 100%;
    background-color: unset;
    border: none;
    box-shadow: none;
    padding: 0;
  }
  .ai-card{
     width: 98%;
     height: 100%;
     cursor: pointer;
    .ai-card-title{
      width: 100%;
      line-height: 20px;
      letter-spacing: 0;
      white-space: pre-line;
      overflow: hidden;
      display: -webkit-box;
      text-overflow: ellipsis;
      -webkit-box-orient: vertical;
      font-weight: 600;
      font-size: 18px;
      text-align: left;
      color: #191919;
      -webkit-line-clamp: 1;
    }
    .ai-card-img{
      margin-top: 10px;
      background-color: transparent;
      border-radius: 8px;
      display: flex;
      width: 100%;
      height: max-content;
    }
    .ai-card-desc{
      margin-top: 10px;
      width: 100%;
      font-size: 14px;
      font-weight: 400;
      line-height: 20px;
      letter-spacing: 0;
      white-space: pre-line;
      -webkit-box-orient: vertical;
      overflow: hidden;
      display: -webkit-box;
      text-overflow: ellipsis;
      text-align: left;
      color: #666f;
      -webkit-line-clamp: 3;
    }
  }
  @media (max-width: 768px) {
    .content{
      width: 100%;
    }
    .hidden-avatar {
      left: 0;
      top: 0;
    }
    .avatar {
      img {
        width: 34px;
        height: 34px;
        border-radius: 12px;
      }
    }
  }
</style>
