import type { SupportedLanguage } from './types';

export interface CodeSample {
  id: string;
  title: string;
  subtitle: string;
  language: SupportedLanguage;
  code: string;
}

export const CODE_SAMPLES: CodeSample[] = [
  {
    id: 'cart-checkout-ts',
    title: 'ระบบคำนวณส่วนลดตะกร้าสินค้า',
    subtitle: 'TypeScript — เหมาะสำหรับดู Flow การส่งต่อข้อมูลและตัวแปรราคา',
    language: 'typescript',
    code: `interface CartItem {
  name: string;
  price: number;
  qty: number;
}

function calculateSubtotal(items: CartItem[]): number {
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.qty;
  }
  return subtotal;
}

function getDiscountRate(memberTier: string, subtotal: number): number {
  if (memberTier === "VIP") {
    return 0.2;
  }
  if (subtotal >= 1000) {
    return 0.1;
  }
  return 0;
}

function applyVat(amount: number): number {
  const vatRate = 0.07;
  return amount + amount * vatRate;
}

function checkoutCart(items: CartItem[], memberTier: string) {
  const subtotal = calculateSubtotal(items);
  const discountRate = getDiscountRate(memberTier, subtotal);
  const discountAmount = subtotal * discountRate;
  const afterDiscount = subtotal - discountAmount;
  const finalTotal = applyVat(afterDiscount);

  return {
    subtotal,
    discountAmount,
    finalTotal,
  };
}

const sampleCart: CartItem[] = [
  { name: "Mechanical Keyboard", price: 1850, qty: 1 },
  { name: "USB-C Cable", price: 250, qty: 2 },
];

const receipt = checkoutCart(sampleCart, "VIP");
console.log(receipt);`,
  },
  {
    id: 'grade-analyzer-py',
    title: 'ระบบวิเคราะห์คะแนนและตัดเกรดนักเรียน',
    subtitle: 'Python — เหมาะสำหรับดู Loop, เงื่อนไข if/elif และการสร้างรายงาน',
    language: 'python',
    code: `def calculate_average(scores: list[float]) -> float:
    """คำนวณค่าเฉลี่ยของคะแนนทั้งหมด"""
    if not scores:
        return 0.0
    total = 0.0
    for score in scores:
        total += score
    average = total / len(scores)
    return round(average, 2)


def classify_grade(score: float) -> str:
    """แปลงคะแนนเป็นเกรดตัวอักษร A ถึง F"""
    if score >= 80:
        return "A"
    elif score >= 70:
        return "B"
    elif score >= 60:
        return "C"
    elif score >= 50:
        return "D"
    return "F"


def build_student_report(student_name: str, scores: list[float]) -> dict:
    """รวบรวมคะแนนเฉลี่ยและเกรดเป็นรายงานสรุป"""
    avg_score = calculate_average(scores)
    final_grade = classify_grade(avg_score)
    passed = avg_score >= 50

    report = {
        "name": student_name,
        "average": avg_score,
        "grade": final_grade,
        "passed": passed,
    }
    return report


student_scores = [78, 85, 92, 68]
summary = build_student_report("Somchai", student_scores)
print(summary)`,
  },
  {
    id: 'api-retry-js',
    title: 'ระบบดึงข้อมูล API พร้อม Retry อัตโนมัติ',
    subtitle: 'JavaScript (Async) — สไตล์โค้ดที่ AI มักเจนให้และควรตรวจจุดเสี่ยง',
    language: 'javascript',
    code: `async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

async function fetchUserProfile(userId, maxRetries = 3) {
  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt += 1;
    try {
      const response = await fetch(\`/api/users/\${userId}\`);
      if (response.ok) {
        const profile = await response.json();
        return profile;
      }
      if (!isRetryableStatus(response.status)) {
        throw new Error(\`HTTP \${response.status}\`);
      }
    } catch (error) {
      lastError = error;
    }

    const waitTime = attempt * 500;
    await delay(waitTime);
  }

  throw lastError || new Error("Failed to load user profile");
}

async function loadDashboard(userId) {
  const user = await fetchUserProfile(userId, 3);
  return {
    greeting: \`สวัสดีคุณ \${user.name}\`,
    role: user.role || "member",
  };
}`,
  },
];
