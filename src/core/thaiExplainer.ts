import type { FunctionInfo, VariableEvent, VariableInfo } from './types';

const VERB_MAP: Record<string, string> = {
  get: 'ดึงข้อมูล',
  fetch: 'โหลดข้อมูล',
  load: 'โหลด',
  read: 'อ่าน',
  find: 'ค้นหา',
  search: 'ค้นหา',
  filter: 'คัดกรอง',
  sort: 'เรียงลำดับ',
  map: 'แปลงรูปแบบ',
  parse: 'แกะข้อมูล',
  format: 'จัดรูปแบบ',
  calc: 'คำนวณ',
  calculate: 'คำนวณ',
  compute: 'คำนวณ',
  sum: 'รวมผลลัพธ์',
  count: 'นับจำนวน',
  check: 'ตรวจสอบ',
  validate: 'ตรวจสอบความถูกต้องของ',
  verify: 'ยืนยัน',
  is: 'เช็กว่าใช่',
  has: 'เช็กว่ามี',
  can: 'เช็กสิทธิ์ว่าสามารถ',
  should: 'เช็กว่าควร',
  create: 'สร้าง',
  make: 'สร้าง',
  build: 'ประกอบสร้าง',
  generate: 'สร้าง',
  init: 'ตั้งค่าเริ่มต้น',
  setup: 'เตรียมระบบ',
  add: 'เพิ่ม',
  push: 'เพิ่มต่อท้าย',
  insert: 'แทรก',
  update: 'อัปเดต',
  set: 'กำหนดค่า',
  edit: 'แก้ไข',
  modify: 'ปรับแก้',
  apply: 'นำมาใช้กับ',
  remove: 'ลบ',
  delete: 'ลบ',
  clear: 'ล้างค่า',
  reset: 'รีเซ็ต',
  save: 'บันทึก',
  store: 'จัดเก็บ',
  send: 'ส่ง',
  submit: 'ส่งข้อมูล',
  post: 'ส่งข้อมูล',
  notify: 'แจ้งเตือน',
  render: 'แสดงผล',
  show: 'แสดง',
  display: 'แสดงผล',
  print: 'พิมพ์ผลลัพธ์',
  log: 'บันทึกข้อความ',
  handle: 'จัดการเหตุการณ์',
  on: 'ตอบสนองเมื่อ',
  process: 'ประมวลผล',
  run: 'สั่งทำงาน',
  execute: 'รัน',
  start: 'เริ่มต้น',
  stop: 'หยุด',
  retry: 'ลองใหม่เมื่อพลาด',
  analyze: 'วิเคราะห์',
  classify: 'จัดกลุ่ม',
  grade: 'ตัดเกรด',
  evaluate: 'ประเมินผล',
  summarize: 'สรุปผล',
  checkout: 'สรุปยอดและชำระเงิน',
};

const NOUN_MAP: Record<string, string> = {
  user: 'ผู้ใช้',
  users: 'รายชื่อผู้ใช้',
  customer: 'ลูกค้า',
  member: 'สมาชิก',
  order: 'คำสั่งซื้อ',
  orders: 'รายการคำสั่งซื้อ',
  cart: 'ตะกร้าสินค้า',
  item: 'สินค้า',
  items: 'รายการสินค้า',
  product: 'สินค้า',
  products: 'รายการสินค้า',
  price: 'ราคา',
  total: 'ยอดรวม',
  subtotal: 'ยอดรวมย่อย',
  discount: 'ส่วนลด',
  tax: 'ภาษี',
  vat: 'ภาษีมูลค่าเพิ่ม',
  coupon: 'คูปอง',
  score: 'คะแนน',
  scores: 'ชุดคะแนน',
  grade: 'เกรด',
  student: 'นักเรียน',
  students: 'รายชื่อนักเรียน',
  report: 'รายงาน',
  summary: 'สรุปผล',
  result: 'ผลลัพธ์',
  data: 'ข้อมูล',
  list: 'รายการ',
  config: 'การตั้งค่า',
  profile: 'โปรไฟล์',
  email: 'อีเมล',
  password: 'รหัสผ่าน',
  token: 'โทเคนยืนยันตัวตน',
  api: 'API',
  response: 'ข้อมูลตอบกลับ',
  request: 'คำขอ',
  error: 'ข้อผิดพลาด',
  status: 'สถานะ',
  average: 'ค่าเฉลี่ย',
  avg: 'ค่าเฉลี่ย',
  max: 'ค่าสูงสุด',
  min: 'ค่าต่ำสุด',
  count: 'จำนวน',
  rate: 'อัตรา',
  tier: 'ระดับสมาชิก',
  receipt: 'ใบเสร็จ',
  retry: 'การลองใหม่',
};

export function splitIdentifier(name: string): string[] {
  if (!name) return [];
  const normalized = name
    .replace(/^_+/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return normalized ? normalized.toLowerCase().split(/\s+/) : [];
}

export function humanizeFunctionNameTh(name: string, kind: FunctionInfo['kind']): string {
  if (kind === 'module' || name === '(Top-Level)') {
    return 'จุดเริ่มต้นการทำงานหลักของไฟล์';
  }
  const tokens = splitIdentifier(name);
  if (tokens.length === 0) return `ทำงานฟังก์ชัน ${name}`;

  const [first, ...rest] = tokens;
  const verb = VERB_MAP[first];
  const translatedRest = rest.map((t) => NOUN_MAP[t] ?? VERB_MAP[t] ?? t);

  if (verb) {
    if (translatedRest.length === 0) return verb;
    return `${verb}${translatedRest.join(' ')}`;
  }

  const allTranslated = tokens.map((t) => NOUN_MAP[t] ?? VERB_MAP[t] ?? t);
  return `จัดการเรื่อง ${allTranslated.join(' ')}`;
}

export function buildFunctionPlainSummaryTh(fn: {
  name: string;
  kind: FunctionInfo['kind'];
  params: string[];
  returns: string[];
  calls: string[];
  branches: number;
  loops: number;
  async: boolean;
  docstring?: string;
}): string {
  if (fn.docstring && fn.docstring.trim().length > 0) {
    return fn.docstring.trim();
  }

  const title = humanizeFunctionNameTh(fn.name, fn.kind);
  const parts: string[] = [];

  if (fn.kind === 'module') {
    parts.push('ส่วนนี้เป็นโค้ดระดับบนสุดที่จะเริ่มรันทันทีเมื่อเปิดไฟล์');
  } else {
    parts.push(`ทำหน้าที่${title}`);
  }

  if (fn.params.length > 0) {
    parts.push(`โดยรับข้อมูลเข้าคือ ${fn.params.join(', ')}`);
  }

  if (fn.async) {
    parts.push('(ทำงานแบบรอผลลัพธ์ภายนอก/Async)');
  }

  if (fn.loops > 0 && fn.branches > 0) {
    parts.push(`ข้างในมีการวนลูป ${fn.loops} จุด และเช็กเงื่อนไขแยกทาง ${fn.branches} จุด`);
  } else if (fn.loops > 0) {
    parts.push(`ข้างในมีการวนซ้ำข้อมูล ${fn.loops} จุด`);
  } else if (fn.branches > 0) {
    parts.push(`ข้างในมีการตรวจสอบเงื่อนไข ${fn.branches} จุด`);
  }

  if (fn.calls.length > 0) {
    parts.push(`และส่งต่องานไปยังฟังก์ชัน ${fn.calls.slice(0, 3).join(', ')}${fn.calls.length > 3 ? ' และอื่นๆ' : ''}`);
  }

  if (fn.returns.length > 0) {
    parts.push(`แล้วคืนค่าผลลัพธ์กลับออกไป`);
  }

  return parts.join(' ');
}

export function buildFunctionStepsTh(fn: {
  name: string;
  kind: FunctionInfo['kind'];
  params: string[];
  returns: string[];
  calls: string[];
  branches: number;
  loops: number;
  async: boolean;
}): string[] {
  const steps: string[] = [];

  if (fn.params.length > 0) {
    steps.push(`รับค่าพารามิเตอร์เข้า: ${fn.params.join(', ')}`);
  } else if (fn.kind !== 'module') {
    steps.push('เริ่มทำงานโดยไม่ต้องรับพารามิเตอร์จากภายนอก');
  }

  if (fn.loops > 0) {
    steps.push(`วนลูปไล่ตรวจสอบ/คำนวณข้อมูลทีละรายการ (${fn.loops} ลูป)`);
  }

  if (fn.branches > 0) {
    steps.push(`ตรวจสอบเงื่อนไขและแยกเส้นทางการทำงาน (${fn.branches} เงื่อนไข)`);
  }

  if (fn.calls.length > 0) {
    steps.push(`เรียกใช้ฟังก์ชันย่อย: ${fn.calls.join(', ')}`);
  }

  if (fn.returns.length > 0) {
    const uniqueReturns = Array.from(new Set(fn.returns)).slice(0, 3);
    steps.push(`ส่งผลลัพธ์กลับ: ${uniqueReturns.join(' หรือ ')}`);
  } else if (fn.kind !== 'module') {
    steps.push('จบการทำงานโดยไม่ได้คืนค่ากลับ (ทำงานเพื่อเปลี่ยนสถานะหรือแสดงผล)');
  }

  return steps;
}

export function computeComplexity(branches: number, loops: number, lineCount: number): FunctionInfo['complexity'] {
  const score = branches + loops * 2 + (lineCount > 35 ? 2 : 0);
  if (score >= 6) return 'complex';
  if (score >= 2) return 'medium';
  return 'simple';
}

export function buildVariableSummaryTh(
  name: string,
  inferredType: string,
  events: VariableEvent[],
  sampleValue?: string
): string {
  const tokens = splitIdentifier(name);
  const translated = tokens.map((t) => NOUN_MAP[t] ?? t).join(' ');
  const updateCount = events.filter((e) => e.type === 'update').length;
  const readCount = events.filter((e) => e.type === 'read').length;
  const isParam = events.some((e) => e.type === 'param');

  const label = translated && translated !== name.toLowerCase() ? `"${translated}"` : `ค่าของ ${name}`;
  const origin = isParam ? 'รับเข้ามาเป็นพารามิเตอร์' : 'ถูกสร้างขึ้นเพื่อเก็บข้อมูล';
  const typeText = inferredType && inferredType !== 'ไม่ระบุชนิด' ? ` (ชนิด ${inferredType})` : '';
  const sampleText = sampleValue ? ` เช่น ${sampleValue}` : '';
  const usageText =
    updateCount > 0
      ? `มีการอัปเดตค่า ${updateCount} ครั้ง และถูกนำไปใช้ ${readCount} จุด`
      : `ค่าคงที่ตลอดการทำงาน และถูกนำไปใช้ ${readCount} จุด`;

  return `${origin}สำหรับ${label}${typeText}${sampleText} — ${usageText}`;
}

export function buildOverviewTh(
  language: string,
  functions: FunctionInfo[],
  variables: VariableInfo[],
  branchCount: number,
  loopCount: number
): string {
  const realFuncs = functions.filter((f) => f.kind !== 'module');
  const langLabel = language === 'python' ? 'Python' : language === 'typescript' ? 'TypeScript' : 'JavaScript';

  if (realFuncs.length === 0) {
    return `ไฟล์ ${langLabel} นี้เป็นสคริปต์ทำงานตรงไปตรงมา มีตัวแปร ${variables.length} ตัว เงื่อนไข ${branchCount} จุด และลูป ${loopCount} จุด`;
  }

  const topNames = realFuncs
    .slice(0, 3)
    .map((f) => `${f.name} (${f.plainTitleTh})`)
    .join(', ');

  return `โค้ด ${langLabel} ชุดนี้แบ่งการทำงานออกเป็น ${realFuncs.length} ฟังก์ชันหลัก และมีตัวแปรให้ติดตาม ${variables.length} ตัว โดยมีส่วนสำคัญคือ ${topNames}${realFuncs.length > 3 ? ' และฟังก์ชันย่อยอื่นๆ' : ''} (รวมเงื่อนไข ${branchCount} จุด, ลูป ${loopCount} จุด)`;
}
