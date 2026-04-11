/**
 * 慢性乙肝抗病毒治疗筛查判定引擎（简化科普版）
 * 
 * 声明：本工具为循证科普参考工具，采用 WHO 2024 / EASL 2025 / AASLD 2025 三大指南的
 * 重叠共识逻辑，但因各指南在 ULN 定义、DNA 阈值、ALT 阈值等方面存在差异，
 * 本工具无法完全忠实复现任何单一指南的全部判定路径。
 * 结果页会标注"按各指南可能如何判定"供参考，不替代临床个体化决策。
 */

// ========== 输入安全工具 ==========

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

function sanitizeNumber(val, opts = {}) {
  const { min = -Infinity, max = Infinity, integer = false } = opts;
  if (val === null || val === undefined || val === '') return null;
  const num = integer ? parseInt(val, 10) : parseFloat(val);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

// ========== 输入校验规则 ==========

const VALIDATION_RULES = {
  age:       { min: 1, max: 120, integer: true,  label: '年龄' },
  hbvDna:    { min: 0, max: 1e12, integer: false, label: 'HBV DNA' },
  altValue:  { min: 0, max: 10000, integer: false, label: 'ALT' },
  ulnValue:  { min: 1, max: 500,  integer: false, label: 'ULN' },
};

function validateNumericField(fieldName, rawValue) {
  const rule = VALIDATION_RULES[fieldName];
  if (!rule) return { valid: true, value: rawValue, error: null };
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return { valid: true, value: null, error: null };
  }
  const sanitized = sanitizeNumber(rawValue, rule);
  if (sanitized === null) {
    return {
      valid: false, value: null,
      error: `${rule.label}应在 ${rule.min === -Infinity ? '' : rule.min}${rule.min !== -Infinity && rule.max !== Infinity ? ' ~ ' : ''}${rule.max === Infinity ? '' : rule.max} 之间`
    };
  }
  return { valid: true, value: sanitized, error: null };
}

// ========== 指南特异性配置 ==========

/**
 * 各指南对 ALT ULN 的定义不同，且与性别相关
 * WHO 2024: 男 30, 女 19
 * EASL 2025 (Prati): 男 30, 女 19
 * AASLD 2025: 男 35, 女 25
 */
const GUIDELINE_ULN = {
  WHO2024:  { male: 30, female: 19 },
  EASL2025: { male: 30, female: 19 },
  AASLD2025: { male: 35, female: 25 },
};

/**
 * 各指南对 HBeAg 阳性患者 DNA 治疗阈值
 * WHO 2024: >2,000 IU/mL（不按 HBeAg 分层）
 * EASL 2025: ≥20,000 IU/mL
 * AASLD 2025: ≥20,000 IU/mL
 */
const GUIDELINE_DNA_THRESHOLD_POS = {
  WHO2024:  2000,
  EASL2025: 20000,
  AASLD2025: 20000,
};

/**
 * 各指南对 HBeAg 阴性患者 DNA 治疗阈值
 * WHO 2024: >2,000 IU/mL
 * EASL 2025: ≥2,000 IU/mL
 * AASLD 2025: ≥2,000 IU/mL
 */
const GUIDELINE_DNA_THRESHOLD_NEG = {
  WHO2024:  2000,
  EASL2025: 2000,
  AASLD2025: 2000,
};

// ========== 证据来源 ==========

const EVIDENCE_SOURCES = {
  WHO2024:  { source: 'WHO 2024 指南', year: 2024, url: 'https://www.who.int/publications/i/item/9789240090903' },
  EASL2025: { source: 'EASL 2025 临床实践指南', year: 2025, url: 'https://doi.org/10.1016/j.jhep.2025.01.018' },
  AASLD2025: { source: 'AASLD 2025 Practice Guideline', year: 2025, url: 'https://doi.org/10.1097/hep.0000000000001033' },
};

const EVIDENCE_LEVELS = {
  HIGH: { label: '高质量证据', color: '#10B981' },
  MODERATE: { label: '中等质量证据', color: '#F59E0B' },
  LOW: { label: '低质量证据', color: '#EF4444' },
};

const RECOMMENDATION_LEVELS = {
  MUST:        { label: '必须治疗',     color: '#EF4444', bgColor: 'rgba(239,68,68,0.15)',  borderColor: '#EF4444', icon: '⚠️', priority: 1 },
  RECOMMENDED: { label: '建议治疗',     color: '#F59E0B', bgColor: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B', icon: '📋', priority: 2 },
  LEAN:        { label: '倾向治疗/随访', color: '#3B82F6', bgColor: 'rgba(59,130,246,0.15)', borderColor: '#3B82F6', icon: '💡', priority: 3 },
  MONITOR:     { label: '可暂缓监测',   color: '#10B981', bgColor: 'rgba(16,185,129,0.15)', borderColor: '#10B981', icon: '✅', priority: 4 },
  INSUFFICIENT:{ label: '信息不足',     color: '#6B7280', bgColor: 'rgba(107,114,128,0.15)', borderColor: '#6B7280', icon: '❓', priority: 5 },
};

// ========== 收集表单数据 ==========

function collectScreeningInput() {
  const errors = [];

  const getValue = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  const getChecked = (name) => {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
  };

  const hasCirrhosis = getChecked('cirrhosis');
  const cirrhosisType = getChecked('cirrhosis-type');
  const gender = getChecked('gender');
  const hbeAgStatus = getChecked('hbeag');
  const hbvDnaDetectable = getChecked('hbv-dna-detectable');
  const altUnit = getChecked('alt-unit') || 'uln';
  const fibrosisStage = getChecked('fibrosis');
  const familyHcc = getChecked('family-hcc');
  const familyCirrhosis = getChecked('family-cirrhosis');
  const coinfection = getChecked('coinfection');
  const immunosuppressed = getChecked('immunosuppressed');
  const extrahepatic = getChecked('extrahepatic');
  const altPersistent = getChecked('alt-persistent');

  // 数值字段校验
  const hbvDnaResult = validateNumericField('hbvDna', getValue('hbv-dna-value'));
  const altResult = validateNumericField('altValue', getValue('alt-value'));
  const ulnResult = validateNumericField('ulnValue', getValue('uln-value'));
  const ageResult = validateNumericField('age', getValue('age'));

  [hbvDnaResult, altResult, ulnResult, ageResult].forEach(r => {
    if (!r.valid && r.error) errors.push(r.error);
  });

  const input = {
    hasCirrhosis: hasCirrhosis === 'yes' ? true : hasCirrhosis === 'no' ? false : null,
    cirrhosisType: cirrhosisType || null,
    gender: gender || null,
    hbeAgStatus: hbeAgStatus || null,
    hbvDna: hbvDnaResult.value,
    hbvDnaDetectable: hbvDnaDetectable === 'yes' ? true : hbvDnaDetectable === 'no' ? false : null,
    altValue: altResult.value,
    altUnit,
    ulnValue: ulnResult.value ?? null, // 不再默认40，由性别+指南决定
    fibrosisStage: fibrosisStage || null,
    age: ageResult.value,
    familyHccHistory: familyHcc === 'yes' ? true : familyHcc === 'no' ? false : null,
    familyCirrhosisHistory: familyCirrhosis === 'yes' ? true : familyCirrhosis === 'no' ? false : null,
    coinfection: coinfection === 'yes' ? true : coinfection === 'no' ? false : null,
    immunosuppressed: immunosuppressed === 'yes' ? true : immunosuppressed === 'no' ? false : null,
    extrahepatic: extrahepatic === 'yes' ? true : extrahepatic === 'no' ? false : null,
    altPersistent: altPersistent === 'yes' ? true : altPersistent === 'no' ? false : null,
  };

  return { input, errors };
}

// ========== 辅助函数 ==========

/**
 * 根据性别和指南计算 ULN 倍数
 * 如果用户已手动输入 ULN 值，优先使用用户的值
 * 否则按性别取各指南 ULN 的中间值（保守取较小值）
 */
function getAltMultiple(input) {
  if (input.altValue === null) return null;
  if (input.altUnit === 'uln') return input.altValue;

  // 用户手动填写了 ULN → 直接使用
  if (input.ulnValue !== null && input.ulnValue > 0) {
    return input.altValue / input.ulnValue;
  }

  // 无 ULN 值：按性别推算（取三大指南中最严格/最小的值）
  if (input.gender === 'male') {
    return input.altValue / 30;  // WHO/EASL: 30
  } else if (input.gender === 'female') {
    return input.altValue / 19;  // WHO/EASL: 19
  }

  // 性别未知：取中间偏保守值 25
  return input.altValue / 25;
}

/**
 * 判断 DNA 是否达到指定阈值（定量）
 * 注意："可测"不再等同于"高病毒载量"
 * 返回 { who: bool|null, easl: bool|null, aasld: bool|null }
 */
function getDnaThresholdStatus(input) {
  const result = { who: null, easl: null, aasld: null };

  if (input.hbvDna !== null && input.hbvDna > 0) {
    const posThreshold = input.hbeAgStatus === 'positive';
    // WHO 不按 HBeAg 分层，统一 >2000
    result.who = input.hbvDna > 2000;
    // EASL: HBeAg+ ≥20000, HBeAg- ≥2000
    result.easl = posThreshold ? input.hbvDna >= 20000 : input.hbvDna >= 2000;
    // AASLD: HBeAg+ ≥20000, HBeAg- ≥2000
    result.aasld = posThreshold ? input.hbvDna >= 20000 : input.hbvDna >= 2000;
  }

  return result;
}

/**
 * 是否有任何指南认为 DNA 达到治疗阈值（定量）
 */
function dnaMeetsAnyThreshold(input) {
  const s = getDnaThresholdStatus(input);
  return s.who === true || s.easl === true || s.aasld === true;
}

/**
 * 是否所有指南都认为 DNA 达到治疗阈值（定量）
 */
function dnaMeetsAllThresholds(input) {
  const s = getDnaThresholdStatus(input);
  return s.who === true && s.easl === true && s.aasld === true;
}

/**
 * 判断是否有显著纤维化
 * F4 等同于肝硬化
 */
function hasSignificantFibrosis(input) {
  if (!input.fibrosisStage || input.fibrosisStage === 'unknown') return null;
  const stage = parseInt(input.fibrosisStage.replace('F', ''));
  return stage >= 2;
}

/**
 * 是否选择了 F4（即肝硬化）
 */
function isF4Cirrhosis(input) {
  return input.fibrosisStage === 'F4';
}

// ========== 核心判定引擎 ==========

function evaluateScreening(input) {
  const result = {
    level: 'INSUFFICIENT',
    confidence: 'low',
    reasons: [],
    evidence: [],
    followUp: { interval: '', items: [] },
    guidelineNotes: [], // 各指南差异说明
    disclaimer: '本工具为循证科普参考工具，采用三大指南重叠共识逻辑，但各指南在 ULN 定义、DNA 阈值等方面存在差异。本结果不构成医疗诊断或治疗建议，请务必前往正规医院肝病科/感染科就诊，由专业医师制定个体化治疗方案。'
  };

  // ===== 优先级0：F4 等同肝硬化，走肝硬化分支 =====
  if (input.hasCirrhosis !== true && isF4Cirrhosis(input)) {
    input = { ...input, hasCirrhosis: true, cirrhosisType: 'compensated' };
    result.reasons.push('📌 METAVIR F4 即为肝硬化，已自动纳入肝硬化判定路径');
  }

  // ===== 优先级1：肝硬化 → 必须治疗（不论 DNA/ALT） =====
  // WHO/AASLD/EASL 共识：肝硬化患者应治疗，无论 DNA 是否可测、ALT 是否正常
  if (input.hasCirrhosis === true) {
    result.level = 'MUST';
    result.confidence = 'high';
    result.reasons.push(
      input.cirrhosisType === 'decompensated'
        ? '失代偿期肝硬化，无论HBV DNA和ALT水平如何，必须立即启动抗病毒治疗'
        : '代偿期肝硬化，无论HBV DNA和ALT水平如何，均应启动抗病毒治疗'
    );

    // DNA 不可测时追加提示
    if (input.hbvDnaDetectable === false || (input.hbvDna !== null && input.hbvDna === 0)) {
      result.reasons.push('⚠️ 注意：虽然当前DNA不可测，但三大指南均认为肝硬化本身即需治疗，建议高灵敏方法复查DNA排除低水平复制');
    }

    result.evidence.push(
      { ...EVIDENCE_SOURCES.WHO2024, statement: '肝硬化患者均应接受治疗，不论DNA是否可测、ALT是否正常', level: 'HIGH' },
      { ...EVIDENCE_SOURCES.EASL2025, statement: '代偿期/失代偿期肝硬化患者均需治疗，不论DNA/ALT', level: 'HIGH' },
      { ...EVIDENCE_SOURCES.AASLD2025, statement: '肝硬化患者不论DNA/ALT，均推荐治疗', level: 'HIGH' }
    );
    result.followUp = {
      interval: input.cirrhosisType === 'decompensated' ? '每1-3个月' : '每3个月',
      items: ['HBV DNA定量（高灵敏）', '肝功能（ALT/AST/胆红素）', '凝血功能', '血常规', '腹部超声', '甲胎蛋白(AFP)', '肝脏弹性检测']
    };
    if (input.cirrhosisType === 'decompensated') {
      result.followUp.items.push('胃镜检查（评估食管胃静脉曲张）');
    }
    return result;
  }

  // ===== 优先级1.5：WHO 2024 独立高危指征（共感染/免疫抑制/肝外表现） =====
  if (input.coinfection === true || input.immunosuppressed === true || input.extrahepatic === true) {
    result.level = 'RECOMMENDED';
    result.confidence = 'moderate';
    const indications = [];
    if (input.coinfection === true) indications.push('合并HIV/HDV/HCV感染');
    if (input.immunosuppressed === true) indications.push('正在接受免疫抑制/化疗/生物制剂治疗');
    if (input.extrahepatic === true) indications.push('存在乙肝相关肝外表现（如结节性多动脉炎、肾小球肾炎等）');

    result.reasons.push(
      `${indications.join('、')}。WHO 2024将上述情况列为独立的抗病毒治疗指征，不论DNA和ALT水平`
    );
    result.evidence.push(
      { ...EVIDENCE_SOURCES.WHO2024, statement: '合并感染、免疫抑制状态、肝外表现均为独立治疗指征', level: 'MODERATE' },
      { ...EVIDENCE_SOURCES.EASL2025, statement: '免疫抑制患者应预防性抗病毒治疗', level: 'MODERATE' }
    );
    result.guidelineNotes.push('WHO 2024 明确将共感染、免疫抑制、肝外表现列为独立指征；EASL/AASLD 对免疫抑制也强烈推荐预防性抗病毒');
    result.followUp = {
      interval: '每3个月',
      items: ['HBV DNA定量', '肝功能', '甲胎蛋白(AFP)', '腹部超声', '相关共病专科随访']
    };
    return result;
  }

  // ===== 优先级2：HBeAg阳性 + DNA达阈值 + ALT升高 → 建议治疗 =====
  if (input.hbeAgStatus === 'positive') {
    const altMultiple = getAltMultiple(input);
    const dnaStatus = getDnaThresholdStatus(input);

    // 2a: DNA 达阈值 + ALT > ULN → 建议治疗
    if (dnaMeetsAnyThreshold(input) && altMultiple !== null && altMultiple > 1) {
      result.level = 'RECOMMENDED';
      result.confidence = altMultiple >= 2 ? 'high' : 'moderate';

      // 按各指南生成差异说明
      const thresholdDesc = [];
      if (dnaStatus.who === true) thresholdDesc.push('WHO(>2,000)');
      if (dnaStatus.easl === true) thresholdDesc.push('EASL(≥20,000)');
      if (dnaStatus.aasld === true) thresholdDesc.push('AASLD(≥20,000)');
      result.reasons.push(
        `HBeAg阳性慢性乙肝，HBV DNA达到治疗阈值[${thresholdDesc.join('/')}]，ALT > ULN，符合抗病毒治疗指征`
      );

      if (altMultiple >= 2) {
        result.reasons.push('ALT ≥2×ULN，免疫清除期可能性大，抗病毒治疗获益明确（AASLD将≥2×ULN列为immune active硬指标）');
      } else {
        result.guidelineNotes.push('WHO/EASL支持ALT>ULN即治疗；AASLD对ALT 1-2×ULN证据弱于≥2×ULN，需排除波动后考虑');
      }

      result.evidence.push(
        { ...EVIDENCE_SOURCES.WHO2024, statement: 'HBeAg阳性、HBV DNA >2,000 IU/mL且ALT>ULN的患者推荐治疗', level: 'HIGH' },
        { ...EVIDENCE_SOURCES.EASL2025, statement: 'HBeAg阳性、DNA≥20,000 IU/mL+ALT升高者应启动治疗', level: 'HIGH' },
        { ...EVIDENCE_SOURCES.AASLD2025, statement: 'HBeAg阳性immune active: ALT≥2×ULN+DNA≥20,000', level: 'HIGH' }
      );
      result.followUp = {
        interval: '每3-6个月',
        items: ['HBV DNA定量', 'HBeAg/HBeAb', '肝功能', '甲胎蛋白(AFP)', '腹部超声', '肝脏弹性检测']
      };
      return result;
    }

    // 2b: DNA 达阈值但 ALT 正常 → 年龄/家族史修饰
    if (dnaMeetsAnyThreshold(input) && (altMultiple === null || altMultiple <= 1)) {
      if (input.age !== null && input.age > 30) {
        result.level = 'LEAN';
        result.confidence = 'moderate';
        result.reasons.push(
          `HBeAg阳性、HBV DNA达治疗阈值，ALT${altMultiple !== null ? '正常' : '未知'}，年龄${input.age}岁`
        );
        result.evidence.push(
          { ...EVIDENCE_SOURCES.EASL2025, statement: '30岁以上HBeAg阳性高病毒载量患者即使ALT正常也倾向治疗', level: 'MODERATE' }
        );
        result.guidelineNotes.push('此为EASL倾向性推荐，AASLD对此更保守；年龄本身非独立核心指征，属风险修饰因素');
        result.followUp = {
          interval: '每3个月',
          items: ['HBV DNA定量', '肝功能', '甲胎蛋白(AFP)', '腹部超声', '肝脏弹性检测', '肝穿活检（考虑）']
        };
        return result;
      }
    }

    // 2c: HBeAg阳性 + DNA 2001-19999 + ALT升高（WHO支持但EASL/AASLD不达）
    if (input.hbvDna !== null && input.hbvDna > 2000 && input.hbvDna < 20000 && altMultiple !== null && altMultiple > 1) {
      result.level = 'LEAN';
      result.confidence = 'low';
      result.reasons.push(
        `HBeAg阳性、DNA ${input.hbvDna.toLocaleString()} IU/mL（WHO:>2,000达标；EASL/AASLD:未达20,000阈值）+ ALT升高，存在指南差异`
      );
      result.evidence.push(
        { ...EVIDENCE_SOURCES.WHO2024, statement: 'WHO不按HBeAg分层，DNA>2,000 IU/mL+ALT>ULN即推荐治疗', level: 'HIGH' },
        { ...EVIDENCE_SOURCES.EASL2025, statement: 'HBeAg阳性DNA治疗阈值为≥20,000 IU/mL', level: 'MODERATE' },
        { ...EVIDENCE_SOURCES.AASLD2025, statement: 'HBeAg阳性immune active需DNA≥20,000 IU/mL', level: 'MODERATE' }
      );
      result.guidelineNotes.push('按WHO 2024已达治疗阈值；按EASL/AASLD尚未达到。建议结合临床综合判断或肝穿评估');
      result.followUp = {
        interval: '每3个月',
        items: ['HBV DNA定量（连续监测）', '肝功能（连续监测3-6月）', 'HBeAg/HBeAb', '甲胎蛋白(AFP)', '腹部超声', '肝脏弹性检测']
      };
      return result;
    }
  }

  // ===== 优先级3：HBeAg阴性 + DNA≥2000 + ALT升高 → 建议治疗 =====
  if (input.hbeAgStatus === 'negative') {
    const altMultiple = getAltMultiple(input);
    const elevatedDna = input.hbvDna !== null && input.hbvDna >= 2000;
    const dnaDetectable = input.hbvDnaDetectable === true;

    // 3a: 定量DNA达标 + ALT升高
    if (elevatedDna && altMultiple !== null && altMultiple > 1) {
      result.level = 'RECOMMENDED';
      result.confidence = altMultiple >= 2 ? 'high' : 'moderate';
      result.reasons.push(
        `HBeAg阴性慢性乙肝，HBV DNA≥2,000 IU/mL，ALT > ULN，三大指南一致推荐治疗`
      );
      if (altMultiple >= 2) {
        result.reasons.push('ALT ≥2×ULN，符合AASLD HBeAg阴性immune active标准');
      } else {
        result.guidelineNotes.push('WHO/EASL支持ALT>ULN即治疗；AASLD对1-2×ULN需排除波动');
      }
      result.evidence.push(
        { ...EVIDENCE_SOURCES.WHO2024, statement: 'HBeAg阴性、HBV DNA>2,000 IU/mL且ALT>ULN推荐治疗', level: 'HIGH' },
        { ...EVIDENCE_SOURCES.EASL2025, statement: 'HBeAg阴性患者DNA≥2,000+ALT升高，需长期治疗', level: 'HIGH' },
        { ...EVIDENCE_SOURCES.AASLD2025, statement: 'HBeAg阴性immune active: ALT≥2×ULN+DNA≥2,000', level: 'HIGH' }
      );
      result.followUp = {
        interval: '每3-6个月',
        items: ['HBV DNA定量', 'HBeAg/HBeAb', 'HBsAg定量', '肝功能', '甲胎蛋白(AFP)', '腹部超声', '肝脏弹性检测']
      };
      return result;
    }

    // 3b: 仅勾选"DNA可测"但无定量 + ALT升高 → 信息不全，倾向随访
    if (!elevatedDna && dnaDetectable && altMultiple !== null && altMultiple > 1) {
      result.level = 'LEAN';
      result.confidence = 'low';
      result.reasons.push(
        'HBeAg阴性，ALT升高，DNA仅知"可测"但无定量数值。无法确认是否达到2,000 IU/mL治疗阈值，建议补查DNA定量'
      );
      result.evidence.push(
        { ...EVIDENCE_SOURCES.WHO2024, statement: '治疗决策需DNA定量结果；若DNA不可得，持续ALT异常也可考虑治疗', level: 'MODERATE' },
        { ...EVIDENCE_SOURCES.EASL2025, statement: '需DNA定量确认是否达到≥2,000 IU/mL阈值', level: 'MODERATE' }
      );
      result.guidelineNotes.push('"DNA可测"不等同于"达到治疗阈值"，低水平可测（如100 IU/mL）未达2,000阈值');
      result.followUp = {
        interval: '每3个月',
        items: ['HBV DNA定量——优先补查', '肝功能（连续监测）', 'HBeAg/HBeAb', '甲胎蛋白(AFP)', '腹部超声']
      };
      return result;
    }

    // 3c: DNA升高但ALT正常——需鉴别非活动携带 vs HBeAg阴性慢乙肝
    if (elevatedDna && (altMultiple === null || altMultiple <= 1)) {
      result.level = 'LEAN';
      result.confidence = 'moderate';
      result.reasons.push(
        'HBeAg阴性、DNA≥2,000 IU/mL但ALT正常，需排除"ALT波动期"，建议密切随访或肝穿评估'
      );
      result.evidence.push(
        { ...EVIDENCE_SOURCES.EASL2025, statement: 'HBeAg阴性ALT正常但DNA≥2,000，应排除ALT波动', level: 'MODERATE' },
        { ...EVIDENCE_SOURCES.AASLD2025, statement: '需鉴别非活动携带与HBeAg阴性慢乙肝', level: 'MODERATE' }
      );
      result.followUp = {
        interval: '每3个月',
        items: ['HBV DNA定量（连续监测）', '肝功能（连续监测3-6月）', 'HBsAg定量', '甲胎蛋白(AFP)', '腹部超声', '肝脏弹性检测']
      };
      return result;
    }
  }

  // ===== 优先级3.5：DNA不可得 + 持续ALT异常（WHO 2024 简化路径） =====
  if (input.altPersistent === true && (input.hbvDna === null || input.hbvDna === 0) && input.hbvDnaDetectable !== true) {
    const altMultiple = getAltMultiple(input);
    if (altMultiple !== null && altMultiple > 1) {
      result.level = 'LEAN';
      result.confidence = 'moderate';
      result.reasons.push(
        'DNA不可得（未查/不可测），但ALT持续异常（至少2次复查异常）。WHO 2024简化路径允许在DNA不可得时，持续ALT异常作为治疗指征'
      );
      result.evidence.push(
        { ...EVIDENCE_SOURCES.WHO2024, statement: '若DNA检测不可得，持续ALT异常可作为治疗指征', level: 'MODERATE' }
      );
      result.guidelineNotes.push('此为WHO 2024对资源有限场景的简化推荐，EASL/AASLD未明确纳入此路径');
      result.followUp = {
        interval: '每3个月',
        items: ['HBV DNA定量——优先补查', '肝功能（持续监测）', '甲胎蛋白(AFP)', '腹部超声', '肝脏弹性检测']
      };
      return result;
    }
  }

  // ===== 优先级4：显著纤维化 ≥F2 → 建议治疗 =====
  const fibrosis = hasSignificantFibrosis(input);
  if (fibrosis === true) {
    result.level = 'RECOMMENDED';
    result.confidence = 'moderate';
    result.reasons.push(
      '显著纤维化（METAVIR ≥F2 或瞬时弹性成像 LSM >7 kPa），即使ALT正常，国际指南也倾向治疗'
    );
    result.evidence.push(
      { ...EVIDENCE_SOURCES.WHO2024, statement: '有中重度纤维化证据者应接受治疗，无论ALT/DNA水平', level: 'MODERATE' },
      { ...EVIDENCE_SOURCES.EASL2025, statement: 'METAVIR ≥F2 或 LSM >7 kPa 者应考虑治疗', level: 'MODERATE' },
      { ...EVIDENCE_SOURCES.AASLD2025, statement: '显著纤维化患者应考虑治疗', level: 'MODERATE' }
    );
    result.followUp = {
      interval: '每3-6个月',
      items: ['HBV DNA定量', '肝功能', '甲胎蛋白(AFP)', '腹部超声', '肝脏弹性检测（定期评估纤维化变化）']
    };
    return result;
  }

  // ===== 优先级4.5：HCC或肝硬化家族史（WHO 2024 独立高危因素） =====
  const hasFamilyHistory = input.familyHccHistory === true || input.familyCirrhosisHistory === true;
  if (hasFamilyHistory) {
    const dnaAvailable = input.hbvDnaDetectable === true || (input.hbvDna !== null && input.hbvDna > 0);
    if (dnaAvailable) {
      result.level = 'RECOMMENDED';
      result.confidence = 'moderate';
      const familyDesc = [];
      if (input.familyHccHistory === true) familyDesc.push('肝癌(HCC)');
      if (input.familyCirrhosisHistory === true) familyDesc.push('肝硬化');
      result.reasons.push(
        `一级亲属${familyDesc.join('及')}家族史 + HBV DNA阳性。WHO 2024：无论年龄和ALT，均应积极考虑治疗`
      );
      if (input.age !== null && input.age <= 30) {
        result.reasons.push(`💡 年龄${input.age}岁虽轻，但家族史权重突破年龄门槛`);
      }
      result.evidence.push(
        { ...EVIDENCE_SOURCES.WHO2024, statement: '有HCC或肝硬化家族史的CHB患者应考虑治疗', level: 'MODERATE' },
        { ...EVIDENCE_SOURCES.EASL2025, statement: '家族史是扩大抗病毒治疗适应症的核心驱动因素', level: 'MODERATE' },
        { ...EVIDENCE_SOURCES.AASLD2025, statement: '有家族史的患者应降低治疗门槛', level: 'MODERATE' }
      );
      result.followUp = {
        interval: '每3-6个月',
        items: ['HBV DNA定量', '肝功能', '甲胎蛋白(AFP)——重点监测', '腹部超声', '肝脏弹性检测']
      };
      return result;
    }
  }

  // ===== 优先级5：年龄+高病毒载量 → 倾向治疗（风险修饰因素，非核心指征） =====
  if (input.age !== null && input.age > 30) {
    const dnaMeetsThreshold = dnaMeetsAnyThreshold(input);
    // 注意：仅"DNA可测"无定量不进入此分支，需定量达标
    if (dnaMeetsThreshold) {
      result.level = 'LEAN';
      result.confidence = 'low';
      result.reasons.push(
        `年龄${input.age}岁且HBV DNA达治疗阈值，虽无其他高危因素，EASL倾向考虑治疗`
      );
      result.guidelineNotes.push('年龄本身属风险修饰因素/共同决策因素，非三大指南统一核心独立指征；AASLD对immune tolerant >40岁才考虑');
      result.evidence.push(
        { ...EVIDENCE_SOURCES.EASL2025, statement: '30-40岁以上高病毒载量患者可考虑治疗（有条件推荐）', level: 'LOW' }
      );
      result.followUp = {
        interval: '每3-6个月',
        items: ['HBV DNA定量', '肝功能', '甲胎蛋白(AFP)', '腹部超声', '肝脏弹性检测']
      };
      return result;
    }
  }

  // ===== 无明确治疗指征 → 分层处理 =====
  if (input.hbeAgStatus !== null || input.hbvDna !== null || input.altValue !== null) {
    const altMultiple = getAltMultiple(input);

    // --- 层1：ALT轻度异常但DNA不够高 → 倾向随访 ---
    if (altMultiple !== null && altMultiple > 1 && altMultiple < 2) {
      const dnaMeetsThreshold = dnaMeetsAnyThreshold(input);
      if (!dnaMeetsThreshold) {
        result.level = 'LEAN';
        result.confidence = 'low';
        result.reasons.push(
          'ALT轻度升高（1-2×ULN）但DNA未达治疗阈值，属于"灰区"，建议密切随访或肝穿评估'
        );
        result.guidelineNotes.push('AASLD对ALT 1-2×ULN要求排除波动后重新评估；WHO/EASL更积极');
        result.evidence.push(
          { ...EVIDENCE_SOURCES.EASL2025, statement: 'ALT 1-2×ULN的灰区患者应连续监测或肝穿', level: 'MODERATE' },
          { ...EVIDENCE_SOURCES.AASLD2025, statement: 'ALT轻度异常需排除波动，连续监测3-6个月', level: 'MODERATE' }
        );
        result.followUp = {
          interval: '每3个月',
          items: ['HBV DNA定量（连续监测）', '肝功能（连续监测3-6月）', 'HBeAg/HBeAb', 'HBsAg定量', '甲胎蛋白(AFP)', '腹部超声', '肝脏弹性检测']
        };
        return result;
      }
    }

    // --- 层2：低风险可暂缓监测 ---
    const lowRisk =
      (input.hasCirrhosis === false) &&
      (fibrosis === false || fibrosis === null || input.fibrosisStage === 'F0' || input.fibrosisStage === 'F1' || input.fibrosisStage === 'unknown') &&
      (altMultiple === null || altMultiple <= 1) &&
      (input.familyHccHistory === false || input.familyHccHistory === null) &&
      (input.familyCirrhosisHistory === false || input.familyCirrhosisHistory === null) &&
      (input.coinfection !== true) &&
      (input.immunosuppressed !== true) &&
      (input.extrahepatic !== true);

    if (lowRisk) {
      result.level = 'MONITOR';
      result.confidence = 'moderate';
      result.reasons.push('当前评估暂未达到国际指南推荐的治疗阈值，但慢性乙肝需要长期定期监测');

      if (fibrosis === null || input.fibrosisStage === 'unknown') {
        result.reasons.push('💡 您尚未进行肝纤维化评估，建议完善FibroScan（肝硬度测定，LSM kPa值）以更精准评估');
      }
      if (input.gender === null) {
        result.reasons.push('💡 您未填写性别。不同指南对ALT正常上限(ULN)的定义因性别不同（男30/女19~35），可能影响ALT是否正常的判定');
      }

      result.evidence.push(
        { ...EVIDENCE_SOURCES.WHO2024, statement: '不符合治疗指征者应定期随访监测', level: 'HIGH' },
        { ...EVIDENCE_SOURCES.EASL2025, statement: '免疫耐受期患者可暂缓治疗但需密切随访', level: 'MODERATE' }
      );
      result.followUp = {
        interval: '每6个月',
        items: ['HBV DNA定量', 'HBeAg/HBeAb', '肝功能', '甲胎蛋白(AFP)', '腹部超声', '肝脏弹性检测']
      };
      if (fibrosis === null || input.fibrosisStage === 'unknown') {
        result.followUp.items.push('FibroScan(肝硬度LSM)——优先推荐');
      }
      return result;
    }
  }

  // ===== 信息不足 =====
  result.level = 'INSUFFICIENT';
  result.confidence = 'low';
  result.reasons.push('当前填写信息不足以做出完整的治疗建议评估，请补充更多检查数据或前往医院完善检查');
  result.evidence.push(
    { ...EVIDENCE_SOURCES.WHO2024, statement: '所有慢性HBV感染者均需定期评估', level: 'HIGH' }
  );
  result.followUp = {
    interval: '建议尽快就诊',
    items: ['HBV DNA定量', 'HBeAg/HBeAb', 'HBsAg定量', '肝功能全套', '甲胎蛋白(AFP)', '腹部超声', 'FibroScan(LSM kPa)', '凝血功能']
  };
  return result;
}

// ========== 渲染结果 ==========

function renderScreeningResult(screeningResult) {
  const levelInfo = RECOMMENDATION_LEVELS[screeningResult.level];
  const confInfo = EVIDENCE_LEVELS[screeningResult.confidence.toUpperCase()];

  let html = `
    <div class="result-card" style="border: 2px solid ${levelInfo.borderColor}; background: ${levelInfo.bgColor};">
      <div class="result-level-badge" style="background: ${levelInfo.color};">
        <span class="result-icon">${levelInfo.icon}</span>
        <span class="result-label">${escapeHtml(levelInfo.label)}</span>
      </div>
      <div class="result-confidence" style="color: ${confInfo.color};">
        证据强度：${escapeHtml(confInfo.label)}
      </div>
    </div>
  `;

  if (screeningResult.reasons.length > 0) {
    html += `
      <div class="result-section">
        <h4 class="result-section-title">📋 判定理由</h4>
        <ul class="result-reasons">
          ${screeningResult.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (screeningResult.evidence.length > 0) {
    html += `
      <div class="result-section">
        <h4 class="result-section-title">📚 循证依据</h4>
        <div class="result-evidence-list">
          ${screeningResult.evidence.map(e => {
            const evLevel = EVIDENCE_LEVELS[e.level] || EVIDENCE_LEVELS.MODERATE;
            return `
              <div class="evidence-item">
                <div class="evidence-source">
                  <span class="evidence-badge" style="background: ${evLevel.color};">${escapeHtml(evLevel.label)}</span>
                  <span class="evidence-name">${escapeHtml(e.source)}（${escapeHtml(String(e.year))}）</span>
                </div>
                <p class="evidence-statement">${escapeHtml(e.statement)}</p>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // 指南差异说明
  if (screeningResult.guidelineNotes && screeningResult.guidelineNotes.length > 0) {
    html += `
      <div class="result-section">
        <h4 class="result-section-title">🔎 指南差异说明</h4>
        <div class="evidence-item" style="border-left: 3px solid #3B82F6;">
          ${screeningResult.guidelineNotes.map(n => `<p style="font-size:0.85rem;color:#93C5FD;margin-bottom:0.5rem;">${escapeHtml(n)}</p>`).join('')}
          <p style="font-size:0.75rem;color:#64748B;margin-top:0.5rem;">本工具采用三大指南重叠共识逻辑，不同指南在ALT ULN、DNA阈值、年龄权重等方面存在差异，请以主治医师判断为准。</p>
        </div>
      </div>
    `;
  }

  if (screeningResult.followUp.interval) {
    html += `
      <div class="result-section">
        <h4 class="result-section-title">🔄 复查建议</h4>
        <div class="follow-up-card">
          <div class="follow-up-interval">
            <span class="follow-up-label">建议复查频率：</span>
            <span class="follow-up-value">${escapeHtml(screeningResult.followUp.interval)}</span>
          </div>
          <div class="follow-up-items">
            <span class="follow-up-label">建议检查项目：</span>
            <div class="follow-up-tags">
              ${screeningResult.followUp.items.map(item => `<span class="follow-up-tag">${escapeHtml(item)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  html += `
    <div class="result-disclaimer">
      <span class="disclaimer-icon">⚕️</span>
      <p>${escapeHtml(screeningResult.disclaimer)}</p>
    </div>
  `;

  return html;
}
