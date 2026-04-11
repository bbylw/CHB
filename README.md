# 慢性乙肝循证科普 | CHB Evidence-Based Guide

基于 **WHO 2024 · EASL 2025 · AASLD 2025** 三大国际循证指南的慢性乙肝（CHB）患者科普网站，含交互式自我筛查工具。

## 功能

- **治疗目标**：三层循证目标体系（病毒抑制 → HBeAg 转换 → HBsAg 清除）
- **治疗指征**：肝硬化、DNA+ALT、纤维化、家族史等分层指征说明
- **一线药物**：TDF / TAF / ETV / Peg-IFN 对比表
- **自我筛查工具**：7 步交互表单，基于三大指南重叠共识逻辑生成个性化评估
- **复查建议**：停药争议、功能性治愈进展、常规复查项目

## 筛查引擎

筛查判定引擎（`js/screening-logic.js`）采用优先级决策树：

```
肝硬化（必须治疗）
  → 共感染/免疫抑制/肝外表现（建议治疗）
    → HBeAg+ DNA+ALT 达标（建议治疗）
      → HBeAg- DNA+ALT 达标（建议治疗）
        → 显著纤维化 ≥F2（建议治疗）
          → 家族史+DNA阳性（建议治疗）
            → 年龄+高病毒载量（倾向治疗）
              → 灰区/低风险（监测/信息不足）
```

各分支标注三大指南差异（如 HBeAg 阳性 DNA 阈值：WHO >2,000 vs EASL/AASLD ≥20,000 IU/mL）。

## 技术栈

- HTML + Tailwind CSS (CDN) + 自定义 CSS
- 原生 JavaScript，无框架依赖
- 状态驱动表单（`formState.sync()` 模式）
- XSS 防护（`escapeHtml` / `sanitizeNumber`）

## 文件结构

```
├── index.html              # 主页面
├── css/
│   └── custom.css          # 设计系统（深蓝医学主题）
├── js/
│   ├── app.js              # 页面交互、表单状态管理、动画
│   └── screening-logic.js  # 筛查判定引擎、结果渲染
└── README.md
```

## 本地运行

静态站点，直接打开 `index.html` 或使用任意 HTTP 服务器：

```bash
npx serve .
```

## 免责声明

本站所有内容仅供健康科普参考，不构成医疗诊断或治疗建议。请勿依据本站信息自行更改治疗方案或停药，如有健康问题请前往正规医疗机构就诊。

## 参考指南

- [WHO 2024 Guidelines](https://www.who.int/publications/i/item/9789240090903)
- [EASL 2025 Clinical Practice Guidelines](https://doi.org/10.1016/j.jhep.2025.01.018)
- [AASLD 2025 Practice Guideline](https://doi.org/10.1097/hep.0000000000001033)
