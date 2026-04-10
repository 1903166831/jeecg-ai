// chat/utils/fileDownload.ts

export async function downloadFile(fileMeta) {
  const res = await fetch(fileMeta.fileUrl)
  if (!res.ok) throw new Error('下载失败')

  const blob = await res.blob()

  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileMeta.fileName
  link.click()

  URL.revokeObjectURL(link.href)
}