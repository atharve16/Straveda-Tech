export type OrderFileKind = 'payment' | 'pod' | 'invoice';

const formats: Record<string, string> = {
  pdf: 'application/pdf', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
};

export function validateOrderFile(kind: OrderFileKind, name: string, size: number, bytes: Uint8Array): string {
  const extension = name.toLowerCase().split('.').pop() || '';
  if (!formats[extension] || kind === 'pod' && ['jpg', 'jpeg', 'png'].includes(extension)) throw new Error('Unsupported document type.');
  if (size < 1 || size > 10 * 1024 * 1024 || bytes.length !== size) throw new Error('Document must be nonempty and at most 10 MB.');
  const starts = (...header: number[]) => header.every((byte, index) => bytes[index] === byte);
  const officeLegacy = starts(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1);
  const zip = starts(0x50,0x4b,0x03,0x04);
  const valid = extension === 'pdf' ? starts(0x25,0x50,0x44,0x46,0x2d) :
    extension === 'xls' || extension === 'doc' ? officeLegacy :
    extension === 'xlsx' || extension === 'docx' ? zip :
    extension === 'png' ? starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a) :
    extension === 'jpg' || extension === 'jpeg' ? starts(0xff,0xd8,0xff) :
    !bytes.some(byte => byte === 0) && bytes.every(byte => byte === 9 || byte === 10 || byte === 13 || byte >= 32);
  if (!valid) throw new Error('Document contents do not match its file type.');
  return formats[extension];
}
