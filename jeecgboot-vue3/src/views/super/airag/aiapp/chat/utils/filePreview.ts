
import * as XLSX from 'xlsx';
import { downloadByData } from '/@/utils/file/download';

const PREVIEWABLE_TABLE_TYPES = ['csv', 'xlsx', 'xls'];
const PREVIEWABLE_DOC_TYPES = ['docx'];
const PREVIEWABLE_PDF_TYPES = ['pdf'];
const PREVIEWABLE_IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
const PREVIEWABLE_VIDEO_TYPES = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
const PREVIEWABLE_AUDIO_TYPES = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];

export function normalizeChatFileMeta(fileData: any) {
  if (!fileData) return null;
  return {
    canPreview: fileData.canPreview !== false,
    description: fileData.description || '',
    fileName: fileData.fileName || getFileNameFromUrl(fileData.fileUrl),
    fileSize: Number(fileData.fileSize || 0),
    fileType: String(fileData.fileType || getFileExt(fileData.fileName || fileData.fileUrl)).toLowerCase(),
    fileUrl: fileData.fileUrl || '',
  };
}

export function getFileExt(fileName = '') {
  const target = String(fileName || '');
  const index = target.lastIndexOf('.');
  if (index === -1) return '';
  return target.slice(index + 1).toLowerCase();
}

export function getFileNameFromUrl(fileUrl = '') {
  if (!fileUrl) return '未命名文件';
  const cleanUrl = String(fileUrl).split('?')[0];
  const fileName = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(fileName);
  } catch (error) {
    return fileName;
  }
}

export function buildChatFileStaticUrl(fileUrl = '') {
  if (!fileUrl) return '';
  if (/^https?:\/\//i.test(fileUrl) || /^http?:\/\//i.test(fileUrl)) return fileUrl;
  const normalized = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${normalized}`;
  }
  return normalized;
}

export function formatFileSize(size: number) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function getFilePreviewKind(fileType = '') {
  const ext = String(fileType || '').toLowerCase();
  if (PREVIEWABLE_TABLE_TYPES.includes(ext)) return 'table';
  if (PREVIEWABLE_PDF_TYPES.includes(ext)) return 'pdf';
  if (PREVIEWABLE_DOC_TYPES.includes(ext)) return 'docx';
  if (PREVIEWABLE_IMAGE_TYPES.includes(ext)) return 'image';
  if (PREVIEWABLE_VIDEO_TYPES.includes(ext)) return 'video';
  if (PREVIEWABLE_AUDIO_TYPES.includes(ext)) return 'audio';
  return 'none';
}

export function buildFilePreviewNotice(fileMeta: any) {
  const normalized = normalizeChatFileMeta(fileMeta);
  if (!normalized) return 'AI 已生成文件';
  const desc = normalized.description || 'AI 已生成文件，可在中栏预览或下载';
  return `${desc}\n\n> 已生成文件：${normalized.fileName}`;
}

export async function loadTablePreviewFromFile(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`文件读取失败: ${response.status}`);
  }

  const ext = getFileExt(url.split('?')[0]);

  if (ext === 'csv') {
    const buffer = await response.arrayBuffer();
    const text = decodeCsvText(buffer);
    const workbook = XLSX.read(text, { type: 'string', raw: false, codepage: 65001 });
    const sheetName = workbook.SheetNames[0];
    const targetSheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(targetSheet, { header: 1, raw: false });
    const [headerRow = [], ...bodyRows] = rows;
    const columns = (headerRow as any[]).map((item, index) => item || `列${index + 1}`);
    return {
      columns,
      rows: bodyRows,
      sheetName,
      sheetNames: workbook.SheetNames,
    };
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const targetSheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(targetSheet, { header: 1, raw: false });
  const [headerRow = [], ...bodyRows] = rows;
  const columns = (headerRow as any[]).map((item, index) => item || `列${index + 1}`);
  return {
    columns,
    rows: bodyRows,
    sheetName,
    sheetNames: workbook.SheetNames,
  };
}

function decodeCsvText(buffer: ArrayBuffer) {
  const uint8Array = new Uint8Array(buffer);
  const encodings = ['utf-8', 'gb18030', 'gbk'];

  for (const encoding of encodings) {
    try {
      const text = new TextDecoder(encoding as any).decode(uint8Array);
      if (!looksLikeMojibake(text)) {
        return stripBom(text);
      }
    } catch (error) {
      // ignore
    }
  }

  return stripBom(new TextDecoder('utf-8').decode(uint8Array));
}

function stripBom(text: string) {
  return text.replace(/^﻿/, '');
}

function looksLikeMojibake(text: string) {
  if (!text) return false;
  if (text.includes('�')) return true;
  const suspicious = (text.match(/[ÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞß]/g) || []).length;
  return suspicious > 4;
}

export async function downloadChatFileByFetch(fileMeta: any) {
  const normalized = normalizeChatFileMeta(fileMeta);
  if (!normalized?.fileUrl) {
    throw new Error('文件地址无效');
  }
  const targetUrl = buildChatFileStaticUrl(normalized.fileUrl);
  const response = await fetch(targetUrl, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`文件下载失败: ${response.status}`);
  }
  const blob = await response.blob();
  downloadByData(blob, normalized.fileName || getFileNameFromUrl(targetUrl), blob.type || 'application/octet-stream');
}
