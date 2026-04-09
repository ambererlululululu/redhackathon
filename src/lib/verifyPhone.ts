/** 比对时只保留数字，忽略空格、横线、+86 等格式差异 */
export function normalizePhoneDigits(input: string): string {
  return String(input ?? '').replace(/\D/g, '')
}
