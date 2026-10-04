/**
 * 作文方法与练习。
 *
 * 两部分：
 *   1. **写作重点词** —— 按功能分组的高频词/短语，配「看中文逐词默写」练习
 *      （答案有几个词就画几条横线，一个词一格）。
 *   2. **金句句式** —— 高分句式模板 + 例句 + 用法提醒，配「逐词默写例句」与「用句式造句」两种练法。
 *
 * 内容全部面向四六级写作，分组按「作文里要干什么」而不是字母序 ——
 * 写作文时想的是「我要引出话题」，不是「我要用 A 开头的词」。
 *
 * 逐词填空的机制（拆词、画横线、逐格判定）在 utils/blankFill.ts，翻译练习的分类默写也用同一套。
 */
import { answerWords, mulberry32, shuffle, type BlankItem } from './blankFill'
import { checkLanguage, type LanguageIssue } from './languageCheck'

/* ==================================================================== */
/* 一、写作重点词                                                        */
/* ==================================================================== */

export interface WritingWord {
  id: string
  /** 功能分组 */
  group: string
  /** 中文意思 */
  zh: string
  /** 推荐英文表达 */
  en: string
  /** 用法提醒 / 易错点 */
  note: string
  /** 默写时的额外提示（如「把 help 换成更书面的说法」），没有就是空串 */
  hint: string
}

/** [中文, 英文, 用法提醒, 默写提示?] */
type Raw = [string, string, string, string?]

const RAW_GROUPS: { group: string; rows: Raw[] }[] = [
  {
    group: '引出话题',
    rows: [
      ['随着……的快速发展', 'with the rapid development of ...', 'with 短语作状语，后面接主句；development 前常加 rapid / steady'],
      ['近年来', 'in recent years', '常与现在完成时连用：In recent years, ... has become ...'],
      ['如今', 'nowadays', '放句首加逗号；不要写成 now a days'],
      ['越来越多的人', 'an increasing number of people', '后接复数名词，谓语用复数；number 不能用 amount'],
      ['普遍认为', 'it is widely acknowledged that ...', 'that 后接完整句子，是万能开头句'],
      ['引起了广泛关注', 'has aroused wide public concern', 'arouse 是及物动词，concern 前不加 the 更自然'],
      ['扮演着重要角色', 'play a vital role in ...', 'role 前用 play，不用 act；in 后接名词或动名词'],
      ['是一个热门话题', 'is a hot topic among ...', 'among 后接人群：among college students'],
      ['不可否认', 'there is no denying that ...', 'that 后接完整句；比 it is undeniable that 更口语一点'],
    ],
  },
  {
    group: '表达观点',
    rows: [
      ['我认为', 'from my perspective', '比 I think 高级；也可用 in my view'],
      ['在我看来', 'as far as I am concerned', '固定搭配，concerned 不能改成 concerning'],
      ['坚决支持', 'be strongly in favor of ...', 'in favor of 后接名词或动名词'],
      ['持反对意见', 'hold a negative attitude towards ...', 'attitude 后固定用 towards / to'],
      ['值得肯定', 'deserves praise', 'deserve 后接名词或动名词；deserve praising = deserve to be praised'],
      ['无可厚非', 'is understandable', '作文里表态时用，比 it is not wrong 地道'],
      ['我倾向于', 'I am inclined to believe that ...', '比 I think 更委婉，适合议论文'],
      ['这一点毋庸置疑', 'there is no doubt about it', '独立成句，可放段首也可放段尾'],
    ],
  },
  {
    group: '分析原因',
    rows: [
      ['造成这一现象的原因是多方面的', 'the reasons for this phenomenon are varied', 'phenomenon 复数 phenomena，注意'],
      ['主要原因是', 'the primary reason is that ...', 'that 后接完整句；primary 比 main 更书面'],
      ['归因于', 'can be attributed to ...', 'attribute A to B；被动更常见'],
      ['与……密切相关', 'is closely related to ...', 'related 后固定用 to，不用 with'],
      ['起着决定性作用', 'plays a decisive role in ...', 'decisive 不是 decided'],
      ['由于', 'owing to', '后接名词短语；比 because of 更书面'],
      ['一方面……另一方面', 'for one thing ... for another', '注意是 for another，不是 for the other'],
      ['根本原因在于', 'the root cause lies in ...', 'lie in 表示「在于」，lie 的过去式 lay'],
    ],
  },
  {
    group: '举例说明',
    rows: [
      ['以……为例', 'take ... as an example', 'as an example 不能省冠词'],
      ['一个典型的例子是', 'a case in point is that ...', 'case in point 是固定说法，很受阅卷老师喜欢'],
      ['例如', 'for instance', '与 for example 同义，放句中时前后加逗号'],
      ['据统计', 'according to statistics', '后接逗号再接数据；statistics 常作复数'],
      ['大量证据表明', 'a large body of evidence shows that ...', 'evidence 不可数，用 a large body of 修饰'],
      ['以我自己为例', 'to cite my own experience', 'cite 比 use 高级，适合个人经历类作文'],
    ],
  },
  {
    group: '影响与结果',
    rows: [
      ['对……产生深远影响', 'have a profound impact on ...', 'impact 后固定用 on；profound 比 big 高级'],
      ['带来诸多好处', 'bring about numerous benefits', 'bring about 是「带来」，about 不能省'],
      ['造成严重后果', 'lead to serious consequences', 'consequence 常指负面结果，比 result 更准'],
      ['长此以往', 'if this situation continues', '作插入语放句首，比 in the long run 更具体'],
      ['从长远来看', 'in the long run', '固定搭配，run 不能用 term 替换'],
      ['既……又……', 'not only ... but also ...', '连接主语时谓语就近一致：Not only he but also I am ...'],
      ['利大于弊', 'the advantages outweigh the disadvantages', 'outweigh 是及物动词，一个词顶一个短语'],
    ],
  },
  {
    group: '提出建议',
    rows: [
      ['应该采取有效措施', 'effective measures should be taken', 'take measures 用被动更客观；measure 用复数'],
      ['政府应当', 'the government should', 'should 后接动词原形；也可用 is supposed to'],
      ['提高意识', 'raise awareness of ...', 'raise 是及物动词；awareness 不可数'],
      ['加大投入', 'increase investment in ...', 'investment 后固定用 in'],
      ['制定相关法规', 'lay down relevant regulations', 'lay down 表示「制定」，比 make 地道'],
      ['从我做起', 'start with ourselves', 'we should start with ourselves 常作结尾'],
      ['只有……才能……', 'only by ... can we ...', 'only by 放句首，主句要部分倒装 —— 高频加分句'],
    ],
  },
  {
    group: '对比与转折',
    rows: [
      ['然而', 'however', '放句首时后面加逗号；不能与 but 连用'],
      ['相反', 'on the contrary', '用于否定前句后给出对立情况，别与 in contrast 混用'],
      ['尽管', 'despite', '后接名词短语；接句子要用 although'],
      ['与……相比', 'compared with ...', 'compared 是过去分词，作状语时不用 comparing'],
      ['一方面', 'on the one hand', '必须与 on the other hand 配套使用'],
      ['与此同时', 'in the meantime', '比 at the same time 更书面'],
      ['话虽如此', 'that being said', '独立成分，放句首加逗号'],
    ],
  },
  {
    group: '总结结论',
    rows: [
      ['总而言之', 'to sum up', '比 in a word 更书面，放段首加逗号'],
      ['基于以上分析', 'based on the analysis above', '作状语，逻辑主语要与主句一致'],
      ['可以得出结论', 'we can draw the conclusion that ...', 'draw a conclusion 是固定搭配，不用 make'],
      ['综上所述', 'in conclusion', '结尾段首句，后加逗号'],
      ['是时候……了', 'it is high time that we did ...', 'that 从句用**过去式**虚拟语气 —— 高频易错点'],
      ['前景是光明的', 'the prospect is promising', 'promising 不是 promised'],
    ],
  },
  {
    group: '高级替换词',
    // 这一组的题面不能只写中文：写「帮助」，用户不知道要写 help 还是高级替换。
    // 所以题面统一是「中文 + 要替换掉的那个基础词」，基础词单独放在 hint 里，
    // 默写时提示「把 help 换成更书面/更高级的说法」。
    rows: [
      ['非常', 'exceedingly', '修饰形容词：exceedingly important', '把 very 换成更书面的说法'],
      ['重要的', 'crucial', '比 important 更有力度，写作高频', '把 important 换成更书面的说法'],
      ['许多', 'numerous', '后接可数名词复数', '把 many 换成更书面的说法'],
      ['大量的', 'a considerable amount of', '接不可数名词；可数用 a considerable number of', '把 a lot of 换成更书面的说法'],
      ['认为', 'hold the view that ...', 'that 后接完整句，比 I think 高级', '把 think 换成更书面的说法'],
      ['得到', 'obtain', 'obtain a degree / obtain information', '把 get 换成更书面的说法'],
      ['帮助', 'be conducive to', '后接名词或动名词，to 是介词', '把 help 换成更书面的说法'],
      ['显然', 'it is evident that ...', 'that 后接完整句', '把 clearly 换成更书面的说法'],
      ['越来越多', 'an increasing number of', '接可数名词复数', '把 more and more 换成更书面的说法'],
      ['解决', 'tackle', 'tackle a problem 比 solve a problem 更书面', '把 solve 换成更书面的说法'],
      ['巨大的', 'tremendous', 'tremendous progress / pressure', '把 big 换成更书面的说法'],
      ['有益的', 'beneficial', 'be beneficial to ...，to 是介词', '把 good 换成更书面的说法'],
      ['有害的', 'detrimental', 'be detrimental to ...，比 harmful 高级', '把 bad 换成更书面的说法'],
      ['显示', 'demonstrate', 'demonstrate that ...，学术写作常用', '把 show 换成更书面的说法'],
      ['除此之外', 'in addition', '放句首加逗号；不与 beside 混', '把 besides 换成更书面的说法'],
      ['最终', 'ultimately', '比 finally 更书面，适合结论段', '把 finally 换成更书面的说法'],
    ],
  },
]

export const WRITING_WORDS: WritingWord[] = RAW_GROUPS.flatMap((g, gi) =>
  g.rows.map((r, ri) => ({
    id: `w-${gi}-${ri}`,
    group: g.group,
    zh: r[0],
    en: r[1],
    note: r[2],
    hint: r[3] ?? '',
  }))
)

export const WORD_GROUPS: string[] = RAW_GROUPS.map((g) => g.group)

/* ==================================================================== */
/* 二、金句句式                                                          */
/* ==================================================================== */

export interface GoldenPattern {
  id: string
  group: string
  /** 句式模板，___ 表示句中要填的地方 */
  pattern: string
  /** 中文意思 */
  zh: string
  /** 例句 */
  example: string
  /** 用法提醒 */
  tip: string
  /**
   * 造句判定：句子里必须出现这些片段之一（小写、去多余空格后比较）。
   * 取句式的**骨架**，不含可替换部分。
   */
  markers: string[]
  /** 最少词数，防止「It is ... that ...」这种糊弄 */
  minWords: number
  /** 造句练习的中文题目（照着翻译就能用上这个句式） */
  task: string
  /** 题目的参考答案 */
  taskRef: string
}

type RawPattern = [string, string, string, string, string[], number]
// [模板, 中文, 例句, 用法, markers, 最少词数]

const RAW_PATTERNS: { group: string; rows: RawPattern[] }[] = [
  {
    group: '开头引出',
    rows: [
      [
        'It is widely acknowledged that ___.',
        '众所周知……',
        'It is widely acknowledged that reading broadens our horizons.',
        '万能开头。that 后必须是**完整句子**（有主语有谓语）。',
        ['it is widely acknowledged that'],
        8,
      ],
      [
        'With the rapid development of ___, ___ has become a hot topic.',
        '随着……的快速发展，……已成为热门话题',
        'With the rapid development of the Internet, online education has become a hot topic.',
        'with 短语作状语，主句另有主语；两个空分别填名词与主语。',
        ['with the rapid development of'],
        12,
      ],
      [
        'There is no denying that ___.',
        '不可否认……',
        'There is no denying that environmental protection matters.',
        '语气比 it is widely acknowledged 更肯定，适合引出争议话题。',
        ['there is no denying that'],
        7,
      ],
      [
        'Nowadays, ___ has aroused wide public concern.',
        '如今，……已引起广泛关注',
        'Nowadays, food safety has aroused wide public concern.',
        'arouse 是及物动词，后面直接跟宾语，不加 about。',
        ['has aroused wide public concern'],
        7,
      ],
      [
        'When it comes to ___, opinions vary from person to person.',
        '谈到……，人们看法不一',
        'When it comes to part-time jobs, opinions vary from person to person.',
        'When it comes to 后接**名词或动名词**，不能接句子。',
        ['when it comes to', 'opinions vary'],
        10,
      ],
    ],
  },
  {
    group: '表达观点',
    rows: [
      [
        'From my perspective, it is ___ that ___.',
        '在我看来，……是……的',
        'From my perspective, it is essential that students learn to manage their time.',
        'that 从句里常用虚拟语气（should + 动词原形，should 可省）。',
        ['from my perspective', 'it is'],
        9,
      ],
      [
        'As far as I am concerned, ___ should be given priority to.',
        '就我而言，应当优先考虑……',
        'As far as I am concerned, health should be given priority to.',
        'give priority to 是固定搭配，priority 前常加 top。',
        ['as far as i am concerned', 'priority'],
        8,
      ],
      [
        'I am strongly in favor of ___, for it ___.',
        '我坚决支持……，因为它……',
        'I am strongly in favor of recycling, for it saves resources.',
        'for 在这里是**并列连词**（表示原因），比 because 更书面。',
        ['in favor of'],
        10,
      ],
      [
        'Nothing is more ___ than ___.',
        '没有什么比……更……了',
        'Nothing is more important than keeping a positive attitude.',
        '比较级表最高级，写作里很出彩；than 后接动名词或名词。',
        ['nothing is more'],
        6,
      ],
      [
        'It is high time that we ___ ___.',
        '是时候我们该……了',
        'It is high time that we took action to protect the environment.',
        '**that 从句用过去式**（虚拟语气）—— 最常被写错的高分句。',
        ['it is high time that'],
        8,
      ],
    ],
  },
  {
    group: '分析原因',
    rows: [
      [
        'The reasons for this phenomenon are varied, but ___ plays a decisive role.',
        '造成这一现象的原因很多，但……起决定作用',
        'The reasons for this phenomenon are varied, but the lack of regulation plays a decisive role.',
        'phenomenon 的复数是 phenomena，不要写成 phenomenons。',
        ['the reasons for this phenomenon are varied', 'decisive role'],
        12,
      ],
      [
        'This can be attributed to the fact that ___.',
        '这可以归因于……',
        'This can be attributed to the fact that people are busier than before.',
        'attribute A to B；这里用被动，比 because 更学术。',
        ['can be attributed to the fact that'],
        9,
      ],
      [
        'For one thing, ___. For another, ___.',
        '一方面……另一方面……',
        'For one thing, it saves money. For another, it reduces pollution.',
        '注意是 **for another**，不是 for the other。',
        ['for one thing', 'for another'],
        9,
      ],
      [
        'The root cause lies in the fact that ___.',
        '根本原因在于……',
        'The root cause lies in the fact that few people are aware of the risk.',
        'lie in 表示「在于」；lie 的过去式是 lay，过去分词 lain。',
        ['the root cause lies in'],
        9,
      ],
    ],
  },
  {
    group: '举例论证',
    rows: [
      [
        'Take ___ as an example. It ___.',
        '以……为例。它……',
        'Take online shopping as an example. It saves consumers a great deal of time.',
        'as an example 的冠词 an 不能省。',
        ['as an example'],
        9,
      ],
      [
        'A case in point is that ___.',
        '一个典型的例子是……',
        'A case in point is that many students now study online.',
        'case in point 是固定说法，阅卷老师很吃这一套。',
        ['a case in point is that'],
        7,
      ],
      [
        'According to statistics, ___ has increased by ___ percent.',
        '据统计，……增长了……%',
        'According to statistics, the number of online learners has increased by 30 percent.',
        'increase by 接**增幅**；increase to 接**最终值**。',
        ['according to statistics', 'has increased by'],
        10,
      ],
      [
        'A large body of evidence shows that ___.',
        '大量证据表明……',
        'A large body of evidence shows that exercise improves memory.',
        'evidence 是**不可数名词**，用 a large body of 修饰。',
        ['a large body of evidence shows that'],
        8,
      ],
    ],
  },
  {
    group: '影响结果',
    rows: [
      [
        '___ has a profound impact on ___.',
        '……对……有深远影响',
        'Social media has a profound impact on the way we communicate.',
        'impact 后固定用 **on**，不用 to。',
        ['has a profound impact on'],
        8,
      ],
      [
        'Not only does it ___, but it also ___.',
        '它不仅……，而且……',
        'Not only does it save time, but it also reduces cost.',
        'Not only 放句首时**前半句倒装**（does it），but also 后的句子不倒装。',
        ['not only does it', 'but it also'],
        10,
      ],
      [
        'If this situation continues, ___ will ___.',
        '如果这种情况持续下去，……将会……',
        'If this situation continues, the problem will become worse.',
        '条件句「主将从现」：if 从句用一般现在时。',
        ['if this situation continues'],
        8,
      ],
      [
        'The advantages of ___ outweigh its disadvantages.',
        '……的利大于弊',
        'The advantages of working part-time outweigh its disadvantages.',
        'outweigh 是**及物动词**，一个词就顶 the advantages are greater than。',
        ['outweigh', 'disadvantages'],
        7,
      ],
    ],
  },
  {
    group: '提出建议',
    rows: [
      [
        'Effective measures should be taken to ___.',
        '应当采取有效措施来……',
        'Effective measures should be taken to reduce air pollution.',
        'take measures 用被动更客观；measure 用**复数**。',
        ['effective measures should be taken to'],
        8,
      ],
      [
        'Only by ___ can we ___.',
        '只有通过……我们才能……',
        'Only by working together can we solve this problem.',
        'Only by 放句首，**主句部分倒装**（can we）—— 高频加分句。',
        ['only by', 'can we'],
        8,
      ],
      [
        'It is advisable for ___ to ___.',
        '……做……是可取的',
        'It is advisable for students to take regular exercise.',
        'It is advisable that 从句要用虚拟语气（should + 原形）。',
        ['it is advisable for'],
        8,
      ],
      [
        'The government should lay down relevant regulations to ___.',
        '政府应制定相关法规来……',
        'The government should lay down relevant regulations to protect consumers.',
        'lay down 表示「制定」，比 make 地道。',
        ['the government should', 'regulations'],
        9,
      ],
      [
        'What we should do first is to raise awareness of ___.',
        '我们首先该做的是提高对……的意识',
        'What we should do first is to raise awareness of environmental protection.',
        '主语从句作主语，谓语用**单数** is。',
        ['what we should do first is', 'awareness of'],
        10,
      ],
    ],
  },
  {
    group: '对比转折',
    rows: [
      [
        'On the one hand, ___. On the other hand, ___.',
        '一方面……另一方面……',
        'On the one hand, it saves money. On the other hand, it may cause addiction.',
        '必须**配套使用**，只写一半会显得逻辑残缺。',
        ['on the one hand', 'on the other hand'],
        10,
      ],
      [
        'Compared with ___, ___ is more ___.',
        '与……相比，……更……',
        'Compared with traditional classes, online courses are more flexible.',
        'compared 是过去分词作状语；不要写成 comparing。',
        ['compared with'],
        9,
      ],
      [
        'Despite ___, ___ still ___.',
        '尽管……，……仍然……',
        'Despite the heavy burden, students still find time to exercise.',
        'despite 后接**名词短语**；接句子要用 although。',
        ['despite'],
        8,
      ],
      [
        'However, this is not to say that ___.',
        '然而，这并不是说……',
        'However, this is not to say that technology is harmful.',
        '用于让步后收回观点，逻辑显得严密。',
        ['this is not to say that'],
        9,
      ],
    ],
  },
  {
    group: '总结结论',
    rows: [
      [
        'To sum up, ___ plays a vital role in ___.',
        '总而言之，……在……中起着重要作用',
        'To sum up, reading plays a vital role in personal growth.',
        'sum up 放句首加逗号；role 前用 play。',
        ['to sum up', 'plays a vital role in'],
        10,
      ],
      [
        'Based on the analysis above, we can draw the conclusion that ___.',
        '基于以上分析，我们可以得出结论……',
        'Based on the analysis above, we can draw the conclusion that action must be taken now.',
        'draw a conclusion 是固定搭配，不用 make。',
        ['based on the analysis above', 'draw the conclusion that'],
        12,
      ],
      [
        'In conclusion, it is ___ that really counts.',
        '总之，真正重要的是……',
        'In conclusion, it is persistence that really counts.',
        '这里是**强调句**（it is ... that ...），别写成定语从句。',
        ['in conclusion', 'it is', 'that really counts'],
        8,
      ],
      [
        'Only in this way can we ___.',
        '只有这样我们才能……',
        'Only in this way can we build a harmonious society.',
        '结尾万能句；Only 放句首，主句**倒装**。',
        ['only in this way can we'],
        8,
      ],
      [
        'The prospect of ___ is promising as long as ___.',
        '只要……，……的前景就是光明的',
        'The prospect of online education is promising as long as quality is guaranteed.',
        'promising 不是 promised；as long as 引导条件状语从句。',
        ['the prospect of', 'is promising as long as'],
        11,
      ],
    ],
  },
]
/* ==================================================================== */
/* 造句练习的「中文题目 + 参考答案」                                      */
/* ==================================================================== */

/**
 * 造句不能只给一个句式就让人写 —— 用户不知道要写什么内容。
 * 所以每个句式配一道**具体的中文题目**，照着翻译就能用上这个句式。
 *
 * 用**模板字符串**做键而不是 `p-0-0` 这种位置 id：位置 id 在增删句式时会整体错位，
 * 而模板字符串本身就是稳定标识；测试会校验每个句式都配到了题目、且没有多余的键。
 *
 * 题目的中文**刻意与例句不同** —— 否则例句一展示，题目就等于给了答案。
 */
const PATTERN_TASKS: Record<string, [string, string]> = {
  /* ---- 开头引出 ---- */
  'It is widely acknowledged that ___.': [
    '众所周知，良好的沟通能力对职业发展至关重要。',
    'It is widely acknowledged that good communication skills are vital to career development.',
  ],
  'With the rapid development of ___, ___ has become a hot topic.': [
    '随着人工智能的快速发展，数据安全已成为热门话题。',
    'With the rapid development of artificial intelligence, data security has become a hot topic.',
  ],
  'There is no denying that ___.': [
    '不可否认，手机已经成为我们生活中不可或缺的一部分。',
    'There is no denying that mobile phones have become an indispensable part of our life.',
  ],
  'Nowadays, ___ has aroused wide public concern.': [
    '如今，青少年的心理健康已引起广泛关注。',
    "Nowadays, teenagers' mental health has aroused wide public concern.",
  ],
  'When it comes to ___, opinions vary from person to person.': [
    '谈到大学毕业后的去向，人们看法不一。',
    'When it comes to what to do after graduation, opinions vary from person to person.',
  ],

  /* ---- 表达观点 ---- */
  'From my perspective, it is ___ that ___.': [
    '在我看来，正是自律让一个人不断进步。',
    'From my perspective, it is self-discipline that makes a person keep improving.',
  ],
  'As far as I am concerned, ___ should be given priority to.': [
    '就我而言，应当优先考虑学生的身心健康。',
    "As far as I am concerned, students' physical and mental health should be given priority to.",
  ],
  'I am strongly in favor of ___, for it ___.': [
    '我坚决支持垃圾分类，因为它能减少污染。',
    'I am strongly in favor of garbage sorting, for it reduces pollution.',
  ],
  'Nothing is more ___ than ___.': [
    '没有什么比诚实更重要的了。',
    'Nothing is more important than honesty.',
  ],
  'It is high time that we ___ ___.': [
    '是时候我们该重视传统文化了。',
    'It is high time that we paid attention to traditional culture.',
  ],

  /* ---- 分析原因 ---- */
  'The reasons for this phenomenon are varied, but ___ plays a decisive role.': [
    '造成这一现象的原因很多，但家庭教育起决定作用。',
    'The reasons for this phenomenon are varied, but family education plays a decisive role.',
  ],
  'This can be attributed to the fact that ___.': [
    '这可以归因于人们的环保意识不断提高。',
    "This can be attributed to the fact that people's environmental awareness keeps improving.",
  ],
  'For one thing, ___. For another, ___.': [
    '一方面，网上购物很方便；另一方面，它节省时间。',
    'For one thing, online shopping is convenient. For another, it saves time.',
  ],
  'The root cause lies in the fact that ___.': [
    '根本原因在于许多家长忽视了与孩子的沟通。',
    'The root cause lies in the fact that many parents ignore communication with their children.',
  ],

  /* ---- 举例论证 ---- */
  'Take ___ as an example. It ___.': [
    '以共享单车为例。它给短途出行带来了便利。',
    'Take shared bikes as an example. It brings convenience to short trips.',
  ],
  'A case in point is that ___.': [
    '一个典型的例子是越来越多的人选择在家办公。',
    'A case in point is that more and more people choose to work from home.',
  ],
  'According to statistics, ___ has increased by ___ percent.': [
    '据统计，我国网民数量增长了百分之二十。',
    'According to statistics, the number of Internet users in China has increased by 20 percent.',
  ],
  'A large body of evidence shows that ___.': [
    '大量证据表明，阅读有助于提高写作能力。',
    'A large body of evidence shows that reading helps improve writing skills.',
  ],

  /* ---- 影响结果 ---- */
  '___ has a profound impact on ___.': [
    '互联网对我们的学习方式有深远影响。',
    'The Internet has a profound impact on the way we learn.',
  ],
  'Not only does it ___, but it also ___.': [
    '它不仅提高了效率，而且降低了成本。',
    'Not only does it improve efficiency, but it also reduces cost.',
  ],
  'If this situation continues, ___ will ___.': [
    '如果这种情况持续下去，城市交通将会更加拥堵。',
    'If this situation continues, urban traffic will become more crowded.',
  ],
  'The advantages of ___ outweigh its disadvantages.': [
    '网上学习的利大于弊。',
    'The advantages of online learning outweigh its disadvantages.',
  ],

  /* ---- 提出建议 ---- */
  'Effective measures should be taken to ___.': [
    '应当采取有效措施来保护个人隐私。',
    'Effective measures should be taken to protect personal privacy.',
  ],
  'Only by ___ can we ___.': [
    '只有通过不断学习，我们才能跟上时代的步伐。',
    'Only by learning constantly can we keep up with the times.',
  ],
  'It is advisable for ___ to ___.': [
    '年轻人多参加社会实践活动是可取的。',
    'It is advisable for young people to take part in more social practice.',
  ],
  'The government should lay down relevant regulations to ___.': [
    '政府应制定相关法规来规范网络直播。',
    'The government should lay down relevant regulations to regulate live streaming.',
  ],
  'What we should do first is to raise awareness of ___.': [
    '我们首先该做的是提高公众对食品安全的意识。',
    'What we should do first is to raise awareness of food safety.',
  ],

  /* ---- 对比转折 ---- */
  'On the one hand, ___. On the other hand, ___.': [
    '一方面，手机让沟通更方便；另一方面，它容易让人分心。',
    'On the one hand, mobile phones make communication easier. On the other hand, they easily distract people.',
  ],
  'Compared with ___, ___ is more ___.': [
    '与纸质书相比，电子书更方便携带。',
    'Compared with paper books, e-books are more convenient to carry.',
  ],
  'Despite ___, ___ still ___.': [
    '尽管工作压力很大，他仍然坚持每天锻炼。',
    'Despite the great pressure of work, he still keeps exercising every day.',
  ],
  'However, this is not to say that ___.': [
    '然而，这并不是说我们应该完全放弃传统。',
    'However, this is not to say that we should completely give up tradition.',
  ],

  /* ---- 总结结论 ---- */
  'To sum up, ___ plays a vital role in ___.': [
    '总而言之，团队合作在项目成功中起着重要作用。',
    'To sum up, teamwork plays a vital role in the success of a project.',
  ],
  'Based on the analysis above, we can draw the conclusion that ___.': [
    '基于以上分析，我们可以得出结论：保护环境刻不容缓。',
    'Based on the analysis above, we can draw the conclusion that environmental protection brooks no delay.',
  ],
  'In conclusion, it is ___ that really counts.': [
    '总之，真正重要的是持之以恒的努力。',
    'In conclusion, it is persistent effort that really counts.',
  ],
  'Only in this way can we ___.': [
    '只有这样我们才能实现可持续发展。',
    'Only in this way can we achieve sustainable development.',
  ],
  'The prospect of ___ is promising as long as ___.': [
    '只要各方共同努力，共享经济的发展前景就是光明的。',
    'The prospect of the sharing economy is promising as long as all sides work together.',
  ],
}

/** 取某个句式的造句题目；配漏了返回空串（界面据此隐藏题目区，测试会拦下来） */
export function patternTask(pattern: string): { task: string; taskRef: string } {
  const hit = PATTERN_TASKS[pattern]
  return { task: hit?.[0] ?? '', taskRef: hit?.[1] ?? '' }
}

/** 供测试核对：题目表里有没有多余的键（句式改了但题目没跟着改） */
export function taskKeys(): string[] {
  return Object.keys(PATTERN_TASKS)
}


export const GOLDEN_PATTERNS: GoldenPattern[] = RAW_PATTERNS.flatMap((g, gi) =>
  g.rows.map((r, ri) => ({
    id: `p-${gi}-${ri}`,
    group: g.group,
    pattern: r[0],
    zh: r[1],
    example: r[2],
    tip: r[3],
    markers: r[4],
    minWords: r[5],
    task: PATTERN_TASKS[r[0]]?.[0] ?? '',
    taskRef: PATTERN_TASKS[r[0]]?.[1] ?? '',
  }))
)

export const PATTERN_GROUPS: string[] = RAW_PATTERNS.map((g) => g.group)

/* ==================================================================== */
/* 三、逐词填空（实现在 utils/blankFill.ts，作文与翻译共用）             */
/* ==================================================================== */

export type { BlankItem, BlankMark, BlankResult } from './blankFill'
export { answerWords, canonicalAnswer, checkBlanks, hintsOf } from './blankFill'

/* ==================================================================== */
/* 四、出题                                                              */
/* ==================================================================== */

/** 重点词：看中文，逐词写出英文 */
export function buildWordBlanks(seed = 1): BlankItem[] {
  const rnd = mulberry32(seed)
  return shuffle(
    WRITING_WORDS.map((w) => ({
      id: w.id,
      group: w.group,
      prompt: w.zh,
      hint: w.hint,
      answer: w.en,
      words: answerWords(w.en),
      note: w.note,
    })),
    rnd
  )
}

/**
 * 金句：看中文题目，逐词默写**参考译文**。
 *
 * 原来这里默写的是「例句」，题面只给「众所周知……」这种句式含义 ——
 * 用户根本猜不到例句写的是「阅读开阔视野」，等于没法做。
 * 改用专门写的题目（中文具体、答案唯一对应），默写才成立。
 * 句式骨架放进 hint，写不出来时能瞄一眼。
 */
export function buildPatternBlanks(seed = 1): BlankItem[] {
  const rnd = mulberry32(seed)
  return shuffle(
    GOLDEN_PATTERNS.map((p) => {
      const answer = p.taskRef || p.example
      return {
        id: p.id,
        group: p.group,
        prompt: p.task || p.zh,
        hint: p.pattern,
        answer,
        words: answerWords(answer),
        note: p.tip,
      }
    }),
    rnd
  )
}

/* ==================================================================== */
/* 四、造句检查                                                          */
/* ==================================================================== */

export interface SentenceCheck {
  /** 是否通过（句式 + 拼写 + 语法都干净）*/
  ok: boolean
  /** 命中的句式骨架 */
  hits: string[]
  /** 没命中、但必须出现的骨架 */
  missing: string[]
  /** 逐条提示（无论通过与否都给，方便改进） */
  issues: string[]
  /** 词数 */
  words: number
  /** 拼写 / 语法 / 标点问题（结构化，界面按条展示） */
  problems: LanguageIssue[]
}

/** 归一化：小写 + 去多余空白 + 全角标点转半角 */
function norm(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * 造句的本地检查。
 *
 * 两层：
 *   1. **句式** —— 骨架有没有用上、词数够不够、句首大写、句末标点（离线可判）
 *   2. **语言** —— 拼写错、主谓一致、冠词、搭配等（见 utils/languageCheck.ts）
 *
 * 第二层是「低误报」的硬规则，不等同于人工批改；更全面的评价仍交给 AI 点评。
 */
export function checkSentence(sentence: string, p: GoldenPattern): SentenceCheck {
  const raw = (sentence ?? '').trim()
  const n = norm(raw)
  const words = n ? n.split(' ').filter(Boolean).length : 0
  const issues: string[] = []

  if (!raw) {
    return { ok: false, hits: [], missing: [...p.markers], issues: ['还没写内容'], words: 0, problems: [] }
  }

  const hits = p.markers.filter((m) => n.includes(norm(m)))
  const missing = p.markers.filter((m) => !n.includes(norm(m)))

  if (/[\u4e00-\u9fa5]/.test(raw)) issues.push('句子里还有中文，作文要写全英文')
  if (missing.length) issues.push(`没用到句式骨架：${missing.join(' / ')}`)
  if (words < p.minWords) issues.push(`太短了（${words} 词），这个句式至少写到 ${p.minWords} 词才立得住`)
  if (raw && !/[.!?]$/.test(raw.trim())) issues.push('句末少了标点（. ? !）')
  if (raw && /^[a-z]/.test(raw)) issues.push('句首字母要大写')
  if (/\b(\w+)\s+\1\b/i.test(n)) issues.push('有连续重复的词，检查一下')

  const problems = checkLanguage(raw)

  return { ok: issues.length === 0 && problems.length === 0, hits, missing, issues, words, problems }
}

/** 判定造句子时用到的、必须出现的骨架（给界面展示用） */
export function requiredMarkers(p: GoldenPattern): string[] {
  return p.markers
}
