# MAIC Generation Domain Correct

OpenMAIC 生成器流水线的领域纠偏改造。

原版 OpenMAIC（v1.0.3）生成器流水线中，AI 仅在大纲阶段才能接触到用户提交的材料，后续阶段 AI 接触的都是 AI 生成产物。这种流水线会放大 AI 幻觉现象。

当 OpenMAIC 生成通识课程的课件时效果还好，因为通识课程基本基于通用常识，预训练大模型能够根据自己的训练材料进行纠偏；而当生成企业非通用领域知识的课件时，原版安排容易使大模型产生并随流水线放大 AI 幻觉，且没有办法纠偏。

## 改动说明

相对原包，本包做两类改动，调用签名保持兼容。

### 纠偏环

`generateSceneContent` 返回前先校验再返工：规则校验（大纲要点覆盖、quiz 题数题型答案、悬空图片引用）→ 模型复核（以 `grounding.excerpts` 为依据，不传则自动用用户需求原文兜底，无材料时跳过）→ 缺口回填返工（默认 1 次）。`generateSceneActions` 做讲稿检查（内部 ID 泄漏进旁白即报），只报告不返工。报告经 `onCorrection` 回调外传；修不好也返回最后内容，不转失败。如需关闭，传 `correction: { enabled: false }`。

### 讲授口吻

新增共享片段 `snippets/teaching-voice.md`，slide 与 interactive 的动作模板引用：讲授知识本身（每段至少一个具体命题）、导游句只允许开场一句、不点评材料本身（含工作量篇幅难易）、不压缩覆盖、禁总结总起句式与黑话。quiz 开场（防泄题）与 PBL 介绍保持原样。

## 使用方法

### 1. 克隆 OpenMAIC

```bash
git clone https://github.com/THU-MAIC/OpenMAIC.git
cd OpenMAIC
git checkout v1.0.3
```

### 2. 在根 `package.json` 写别名

用 `pnpm.overrides` 做别名替换：

```json
{
  "pnpm": {
    "overrides": {
      "@openmaic/generation": "npm:@composable-tu/maic-generation-domain-correct@x.y.z"
    }
  }
}
```

### 3. 指定包来源并安装

在 OpenMAIC 根目录建 `.npmrc`：

```
@composable-tu:registry=https://npm.pkg.github.com

//npm.pkg.github.com/:_authToken=你的 GitHub Personal Token（Classic）
```

然后重新安装并确认：

```bash
pnpm install
pnpm why @openmaic/generation
```

`pnpm why` 应显示实际安装的是 `@composable-tu/maic-generation-domain-correct@x.y.z`。之后正常启动 OpenMAIC 即可；别名换上后纠偏环默认开启，无需改任何调用代码。如需关闭，调用时传 `correction: { enabled: false }` 即回到单遍生成。

纠偏环的工作方式：生成后先做规则校验（大纲要点覆盖、quiz 题数题型答案、悬空图片引用），再以领域材料做模型复核（`grounding.excerpts`；不传则自动用用户需求原文兜底，无材料时跳过），有问题则把缺口清单喂回模型返工（默认 1 次）。报告经 `onCorrection` 回调外传，修不好也返回最后内容，不转失败。

