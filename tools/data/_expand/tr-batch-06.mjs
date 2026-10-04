// 批次 06：补齐单句题型（六级高级句型 + 四级基础句型）
export const TRANSLATIONS_EXTRA_06 = [
  {
    level: 'CET6', type: 'sentence', difficulty: 2, source: '六级翻译·高级句型（主语从句）',
    prompt: '他能否按时完成任务，将直接影响整个项目的进度。',
    reference: 'Whether he can complete the task on time will directly affect the progress of the whole project.',
    coreWords: [
      { en: 'whether', zh: '是否' },
      { en: 'on time', zh: '按时' },
      { en: 'affect', zh: '影响' },
      { en: 'progress', zh: '进度' },
    ],
    grammarPoints: [
      'Whether 引导主语从句，置于句首时不可用 if 替换。',
      '主语从句作主语时，谓语动词通常用单数。',
      '“影响”用 affect（动词）或 have an effect on（短语），注意区分 effect（名词）。',
    ],
    tips: 'if 引导的主语从句不能置于句首，只能用 whether；宾语从句中两者皆可。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 2, source: '六级翻译·高级句型（条件从句）',
    prompt: '除非我们立即采取行动，否则情况只会变得更糟。',
    reference: 'Unless we take immediate action, the situation will only get worse.',
    coreWords: [
      { en: 'unless', zh: '除非' },
      { en: 'take action', zh: '采取行动' },
      { en: 'situation', zh: '情况' },
    ],
    grammarPoints: [
      'Unless = if … not，本身已含否定意义，句中不可再加 not。',
      '条件状语从句用一般现在时表将来，主句用一般将来时。',
      '“变得更糟”用 get worse / become worse，worse 是 badly/ill 的比较级。',
    ],
    tips: 'unless 从句中不能再用 and；也不可说 unless … not，属双重否定错误。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·高级句型（倍数表达）',
    prompt: '这座新建的体育馆的面积是原来那座的三倍。',
    reference: 'The newly built stadium is three times as large as the original one.',
    coreWords: [
      { en: 'stadium', zh: '体育馆' },
      { en: 'three times', zh: '三倍' },
      { en: 'as large as', zh: '和……一样大' },
      { en: 'original', zh: '原来的' },
    ],
    grammarPoints: [
      '倍数表达法一：A + be + 倍数 + as + 形容词原级 + as + B。',
      '倍数表达法二：A + be + 倍数 + 比较级 + than + B（three times larger than）。',
      '“三倍”用 three times，不可用 three times of。',
    ],
    tips: '常见倍数句型：twice as much as / three times the size of / four times larger than。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·高级句型（部分否定）',
    prompt: '并非所有学生都赞成这个方案，有些人担心它会占用太多时间。',
    reference: 'Not all students are in favour of this plan; some are worried that it will take up too much time.',
    coreWords: [
      { en: 'not all', zh: '并非所有' },
      { en: 'in favour of', zh: '赞成' },
      { en: 'take up', zh: '占用' },
    ],
    grammarPoints: [
      'Not all … 表示部分否定，意为“并非全部……”，不等于全部否定。',
      '全部否定须用 None of … / No …，如 None of the students agreed。',
      '“担心”后接 that 从句，也可说 be worried about + 名词。',
    ],
    tips: '部分否定 vs 全部否定：Not all（部分）≠ None（全部）；Not both ≠ Neither。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·高级句型（形式宾语）',
    prompt: '互联网的普及使我们更容易获取最新的信息。',
    reference: 'The widespread use of the Internet has made it easier for us to obtain the latest information.',
    coreWords: [
      { en: 'widespread', zh: '广泛的' },
      { en: 'obtain', zh: '获取' },
      { en: 'the latest', zh: '最新的' },
    ],
    grammarPoints: [
      '形式宾语结构：make it + 宾补 + to do，it 代替后面的真正宾语不定式。',
      '“使我们更容易”用 make it easier for us，介词 for 引出不定式的逻辑主语。',
      '“最新的”用 the latest，不可用 the newest（newest 指新旧，latest 指时间最近）。',
    ],
    tips: '常见形式宾语动词：make, find, think, consider, feel + it + 宾补 + to do/that 从句。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·高级句型（独立主格）',
    prompt: '会议结束后，代表们陆续离开了会场。',
    reference: 'The meeting being over, the delegates left the conference hall one after another.',
    coreWords: [
      { en: 'delegate', zh: '代表' },
      { en: 'one after another', zh: '陆续；一个接一个' },
      { en: 'conference hall', zh: '会场' },
    ],
    grammarPoints: [
      '独立主格结构：名词 + 现在分词（The meeting being over），其逻辑主语独立于主句。',
      '独立主格前不加连词，常用逗号与主句隔开。',
      '“陆续”用 one after another / one by one，注意 another 与 by 的搭配。',
    ],
    tips: '独立主格常见形式：n. + doing / done / adj. / 介词短语，如 Weather permitting, …',
  },
  {
    level: 'CET4', type: 'sentence', difficulty: 1, source: '四级翻译·基础句型（there be）',
    prompt: '过去这个村庄里只有一所小学，现在已经有好几所了。',
    reference: 'There used to be only one primary school in this village, but now there are several.',
    coreWords: [
      { en: 'there used to be', zh: '过去曾经有' },
      { en: 'primary school', zh: '小学' },
      { en: 'several', zh: '几个' },
    ],
    grammarPoints: [
      '“过去曾经有”用 there used to be，used to 后接动词原形。',
      'there be 句型中 be 的数由后面的名词决定：one school 用 was/单数。',
      '表示转折用 but 连接两个并列分句。',
    ],
    tips: 'there used to be 与 there was 的区别：前者强调“曾经有过（现在没了）”。',
  },
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·基础句型（因果关系）',
    prompt: '由于准备充分，他在面试中表现得非常自信。',
    reference: 'Thanks to his thorough preparation, he performed with great confidence in the interview.',
    coreWords: [
      { en: 'thanks to', zh: '由于；多亏' },
      { en: 'thorough', zh: '充分的；彻底的' },
      { en: 'confidence', zh: '自信' },
      { en: 'interview', zh: '面试' },
    ],
    grammarPoints: [
      'Thanks to 表示正面原因，多译为“多亏”；表负面原因用 because of / due to。',
      '“表现得自信”用 perform with confidence，with 引出伴随状态。',
      '“在面试中”用 in the interview，介词用 in。',
    ],
    tips: '表原因的介词短语：because of, due to, owing to, thanks to（多含褒义）。',
  },
]
