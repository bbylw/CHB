/**
 * 页面交互逻辑
 * 导航、步骤表单切换、表单验证、结果渲染、动画触发
 *
 * 重构要点：
 * 1. 表单状态集中管理（formState 对象），避免散落的 DOM 命令式操作
 * 2. 数值范围校验增强
 * 3. 条件展示逻辑由状态驱动
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initSmoothScroll();
  initScrollAnimations();
  initScreeningForm();
  initContentToggles();
});

// ===== 导航栏 =====
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  // 滚动时导航栏样式变化
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('navbar-scrolled');
    } else {
      navbar.classList.remove('navbar-scrolled');
    }
  });

  // 移动端菜单
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });

    // 点击菜单项关闭
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
      });
    });
  }
}

// ===== 平滑滚动 =====
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
}

// ===== 滚动动画 =====
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    observer.observe(el);
  });
}

// ===== 内容展开/折叠 =====
function initContentToggles() {
  document.querySelectorAll('.toggle-content').forEach(btn => {
    btn.addEventListener('click', function() {
      const target = this.nextElementSibling;
      const icon = this.querySelector('.toggle-icon');
      if (target) {
        target.classList.toggle('expanded');
        if (icon) {
          icon.style.transform = target.classList.contains('expanded') ? 'rotate(180deg)' : '';
        }
      }
    });
  });
}

// ===== 筛查表单 =====

/**
 * 集中管理的表单状态对象
 * 所有条件展示逻辑和步骤切换都从此状态派生
 */
const formState = {
  currentStep: 1,
  totalSteps: 7,
  showCirrhosisType: false,
  showUlnInput: false,
  submitted: false,

  // 根据状态更新 DOM
  sync() {
    // 条件区域
    const cirrhosisTypeGroup = document.getElementById('cirrhosis-type-group');
    const ulnInputGroup = document.getElementById('uln-input-group');
    if (cirrhosisTypeGroup) cirrhosisTypeGroup.style.display = this.showCirrhosisType ? 'block' : 'none';
    if (ulnInputGroup) ulnInputGroup.style.display = this.showUlnInput ? 'block' : 'none';

    // 步骤面板
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    const targetStep = document.getElementById(`step-${this.currentStep}`);
    if (targetStep) targetStep.classList.add('active');

    // 进度条
    const progress = (this.currentStep / this.totalSteps) * 100;
    const bar = document.getElementById('step-progress');
    if (bar) bar.style.width = `${progress}%`;

    // 步骤指示器
    document.querySelectorAll('.step-indicator').forEach((indicator, idx) => {
      indicator.classList.remove('active', 'completed');
      if (idx + 1 < this.currentStep) indicator.classList.add('completed');
      else if (idx + 1 === this.currentStep) indicator.classList.add('active');
    });

    // 连接线
    document.querySelectorAll('.step-connector').forEach((conn, idx) => {
      conn.classList.toggle('completed', idx + 1 < this.currentStep);
    });

    // 按钮显隐
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const submitBtn = document.getElementById('submit-btn');
    if (prevBtn) prevBtn.style.display = this.currentStep === 1 ? 'none' : '';
    if (nextBtn) nextBtn.style.display = this.currentStep === this.totalSteps ? 'none' : '';
    if (submitBtn) submitBtn.style.display = this.currentStep === this.totalSteps ? '' : 'none';
  },

  reset() {
    this.currentStep = 1;
    this.showCirrhosisType = false;
    this.showUlnInput = false;
    this.submitted = false;
    this.sync();
  }
};

/**
 * 数值范围校验配置
 */
const FIELD_RULES = {
  'hbv-dna-value': { min: 0, max: 1e12, label: 'HBV DNA', unit: 'IU/mL' },
  'alt-value':     { min: 0, max: 10000, label: 'ALT' },
  'uln-value':     { min: 1, max: 500,   label: 'ULN' },
  'age':           { min: 1, max: 120,   label: '年龄', integer: true },
};

function initScreeningForm() {
  const form = document.getElementById('screening-form');
  const resultContainer = document.getElementById('screening-result');

  // ---------- 条件显示：肝硬化类型 ----------
  document.querySelectorAll('input[name="cirrhosis"]').forEach(radio => {
    radio.addEventListener('change', () => {
      formState.showCirrhosisType = (radio.value === 'yes' && radio.checked);
      formState.sync();
    });
  });

  // ---------- 条件显示：ALT 单位 ----------
  document.querySelectorAll('input[name="alt-unit"]').forEach(radio => {
    radio.addEventListener('change', () => {
      // IU/L 模式和 ULN 模式都显示 ULN 输入框（但含义不同）
      formState.showUlnInput = true; // 始终显示
      formState.sync();

      // 更新 ALT 提示文本
      const hint = document.getElementById('alt-hint');
      if (hint) {
        hint.textContent = radio.value === 'iu'
          ? '输入ALT的IU/L数值（系统将根据性别自动按指南ULN计算倍数）'
          : '输入ALT相当于ULN的倍数（如1.5 = 1.5倍正常值上限）';
      }
    });
  });
  // 默认 IU/L 模式，初始就显示 ULN 输入框
  formState.showUlnInput = true;

  // ---------- 实时数值校验（输入时即时反馈） ----------
  Object.entries(FIELD_RULES).forEach(([id, rule]) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => {
      clearFieldError(input);
      const val = input.value.trim();
      if (val === '') return; // 空值不做即时校验
      const num = rule.integer ? parseInt(val, 10) : parseFloat(val);
      if (!Number.isFinite(num)) {
        showFieldError(input, `请输入有效的${rule.label}数值`);
      } else if (num < rule.min) {
        showFieldError(input, `${rule.label}不能小于 ${rule.min}${rule.unit ? ' ' + rule.unit : ''}`);
      } else if (num > rule.max) {
        showFieldError(input, `${rule.label}不能大于 ${rule.max}${rule.unit ? ' ' + rule.unit : ''}`);
      }
    });
  });

  // ---------- 步骤导航 ----------
  function goToStep(step) {
    if (step < 1 || step > formState.totalSteps) return;

    // 向前跳转需先验证当前步
    if (step > formState.currentStep && !validateStep(formState.currentStep)) {
      showStepError(formState.currentStep);
      return;
    }

    formState.currentStep = step;
    formState.sync();
  }

  function nextStep() {
    if (!validateStep(formState.currentStep)) {
      showStepError(formState.currentStep);
      return;
    }
    goToStep(formState.currentStep + 1);
  }

  function prevStep() {
    goToStep(formState.currentStep - 1);
  }

  // ---------- 绑定按钮事件 ----------
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const submitBtn = document.getElementById('submit-btn');
  const resetBtn = document.getElementById('reset-btn');

  if (prevBtn) prevBtn.addEventListener('click', prevStep);
  if (nextBtn) nextBtn.addEventListener('click', nextStep);

  // ---------- 提交表单 ----------
  function submitScreening() {
    // 最终全步骤校验
    const stepErrors = [];
    for (let s = 1; s <= formState.totalSteps; s++) {
      if (!validateStep(s)) {
        stepErrors.push(s);
      }
    }
    if (stepErrors.length > 0) {
      showStepError(formState.currentStep);
      return;
    }

    // 收集数据（含数值校验）
    const { input, errors } = collectScreeningInput();
    if (errors.length > 0) {
      showGlobalErrors(errors);
      return;
    }

    const result = evaluateScreening(input);
    const resultHtml = renderScreeningResult(result);

    if (resultContainer) {
      resultContainer.innerHTML = resultHtml;
      resultContainer.classList.add('show');
      resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 隐藏表单
    if (form) {
      form.style.display = 'none';
    }

    // 显示重新评估按钮
    const resetContainer = document.getElementById('reset-container');
    if (resetContainer) {
      resetContainer.style.display = 'block';
    }

    formState.submitted = true;
  }

  if (submitBtn) submitBtn.addEventListener('click', submitScreening);

  // ---------- 重新评估 ----------
  function resetScreening() {
    if (form) {
      form.style.display = '';
      form.reset();
    }
    if (resultContainer) {
      resultContainer.innerHTML = '';
      resultContainer.classList.remove('show');
    }

    const resetContainer = document.getElementById('reset-container');
    if (resetContainer) {
      resetContainer.style.display = 'none';
    }

    // 清除所有字段错误
    document.querySelectorAll('.field-error').forEach(e => e.remove());

    formState.reset();
  }

  if (resetBtn) resetBtn.addEventListener('click', resetScreening);

  // ---------- 初始化 ----------
  formState.sync();
}

// ===== 增强的步骤验证 =====

/**
 * 验证指定步骤
 * 1. 必填项非空检查
 * 2. 单选组选中检查
 * 3. 数值范围校验
 */
function validateStep(step) {
  const stepEl = document.getElementById(`step-${step}`);
  if (!stepEl) return true;

  let valid = true;

  // 清除旧错误
  stepEl.querySelectorAll('.field-error').forEach(e => e.remove());

  // 必填输入框
  stepEl.querySelectorAll('input[required]').forEach(input => {
    if (input.type === 'radio') return; // radio 另行处理
    const val = input.value.trim();
    if (!val) {
      valid = false;
      showFieldError(input, '此项为必填');
    }
  });

  // 必填 radio 组
  const radioGroups = new Set();
  stepEl.querySelectorAll('input[type="radio"][required]').forEach(radio => {
    radioGroups.add(radio.name);
  });
  radioGroups.forEach(name => {
    const checked = stepEl.querySelector(`input[name="${name}"]:checked`);
    if (!checked) valid = false;
  });

  // 数值范围校验（仅校验本步骤中存在的字段）
  Object.entries(FIELD_RULES).forEach(([id, rule]) => {
    const input = stepEl.querySelector(`#${id}`);
    if (!input) return;
    const val = input.value.trim();
    if (val === '') return; // 空值由 required 处理
    const num = rule.integer ? parseInt(val, 10) : parseFloat(val);
    if (!Number.isFinite(num) || num < rule.min || num > rule.max) {
      valid = false;
      showFieldError(input, `${rule.label}应在 ${rule.min} ~ ${rule.max}${rule.unit ? ' ' + rule.unit : ''} 之间`);
    }
  });

  return valid;
}

// ===== 错误提示 UI =====

/**
 * 在输入框下方显示字段级错误
 */
function showFieldError(input, message) {
  // 避免重复
  if (input.parentElement.querySelector('.field-error')) return;
  const err = document.createElement('p');
  err.className = 'field-error';
  err.style.cssText = 'color: #FCA5A5; font-size: 0.8rem; margin-top: 0.3rem;';
  err.textContent = message;
  input.parentElement.appendChild(err);
  input.style.borderColor = '#EF4444';
}

function clearFieldError(input) {
  const err = input.parentElement.querySelector('.field-error');
  if (err) err.remove();
  input.style.borderColor = '';
}

/**
 * 步骤级错误提示
 */
function showStepError(step) {
  const stepEl = document.getElementById(`step-${step}`);
  if (!stepEl) return;

  // 移除旧错误提示
  stepEl.querySelectorAll('.step-error').forEach(e => e.remove());

  const errorEl = document.createElement('div');
  errorEl.className = 'step-error';
  errorEl.textContent = '⚠️ 请正确填写所有必填项后再继续';
  stepEl.prepend(errorEl);

  setTimeout(() => errorEl.remove(), 3000);
}

/**
 * 全局错误提示（如数值校验不通过）
 */
function showGlobalErrors(errors) {
  const form = document.getElementById('screening-form');
  if (!form) return;

  form.querySelectorAll('.global-errors').forEach(e => e.remove());

  const container = document.createElement('div');
  container.className = 'global-errors';
  container.style.cssText = 'padding: 1rem; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; margin-bottom: 1rem;';

  const title = document.createElement('p');
  title.style.cssText = 'color: #FCA5A5; font-weight: 600; margin-bottom: 0.5rem;';
  title.textContent = '⚠️ 输入数据有误，请检查以下问题：';
  container.appendChild(title);

  const list = document.createElement('ul');
  list.style.cssText = 'list-style: disc; padding-left: 1.5rem; color: #FCA5A5; font-size: 0.9rem;';
  errors.forEach(err => {
    const li = document.createElement('li');
    li.textContent = err;
    list.appendChild(li);
  });
  container.appendChild(list);
  form.prepend(container);

  // 3 秒后自动移除
  setTimeout(() => container.remove(), 5000);
}
