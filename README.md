# MAIC Generation Domain Correct

OpenMAIC 生成器流水线的领域纠偏改造。

原版 OpenMAIC（v1.0.3）生成器流水线中，AI 仅在大纲阶段才能接触到用户提交的材料，后续阶段 AI 接触的都是 AI 生成产物。这种流水线会放大 AI 幻觉现象。

当 OpenMAIC 生成通识课程的课件时效果还好，因为通识课程基本基于通用常识，预训练大模型能够根据自己的训练材料进行纠偏；而当生成企业非通用领域知识的课件时，原版安排容易使大模型产生并随流水线放大 AI 幻觉，且没有办法纠偏。

## 改动说明

相对原包，本包有三处行为变化。

### 纠偏环

每页生成后自动检查一遍：大纲要点是否讲全、题目数量题型答案对不对、有没有重复出题、图片引用是否悬空。有领域材料时，再用模型按材料复核一遍事实。查出问题自动返工一次；实在修不好也照常返回，不会生成失败。讲稿另有一道检查：内部编号漏进旁白会被标出来。

### 讲授口吻

老师按讲课的方式说话：讲知识本身，每段都有具体内容；开场先摆问题再出概念；不点评材料本身，不压缩内容，不说总结总起套话。测验开场与项目介绍保持原样。

### 大纲颗粒度

一页只讲一两个要点；内容密的主题自动拆成连续多页，不并页省事。

### 大纲即设计图

大纲从标题清单变成详细设计：每页自带叙事钩子、必讲命题、误区预警，测验标注每题考查哪个点。旧大纲没有这些信息也能照常用。

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

