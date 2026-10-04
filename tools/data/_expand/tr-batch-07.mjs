// 批次 07：写作衔接·过渡词专项
// 素材来源：《Transitional Words》讲义（段落层次连接词 + 11 类逻辑关系过渡词）
// 说明：讲义本身是英文过渡词清单，没有中英对照的句子，故按「以过渡词为考点」编写汉译英题，
//       每题题干显式要求使用指定过渡词，过渡词同时作为核心词参与评分——用不上就要扣分。
export const TRANSLATIONS_EXTRA_07 = [
  /* ==================== 段落层次连接词（序数结构） ==================== */
  {
    level: 'CET4', type: 'sentence', difficulty: 1, source: '四级翻译·写作衔接专项（段落层次连接词 first/second/third）',
    prompt: '请按 first … second … third 的顺序组织，翻译：首先，健康是最重要的；其次，没有健康我们无法工作；第三，我们应该每天锻炼。',
    reference: 'First, health is the most important thing. Second, without health we cannot work. Third, we should exercise every day.',
    coreWords: [
      { en: 'first', zh: '首先' },
      { en: 'second', zh: '其次' },
      { en: 'third', zh: '第三' },
      { en: 'health', zh: '健康' },
      { en: 'exercise', zh: '锻炼' },
    ],
    grammarPoints: [
      '同一组序数连接词必须结构对应、不能混用：first/second/third 是一组，firstly/secondly/thirdly 是另一组。',
      '连接词置于句首时后面通常加逗号，再接完整句子。',
    ],
    tips: '讲义原话：「以上结构序数词不要混用，保持结构对应和工整」。',
  },
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（段落层次连接词 firstly/secondly/thirdly/finally）',
    prompt: '请用 firstly … secondly … thirdly … finally 的递进结构，翻译：首先，阅读能增长知识；其次，它能提高写作能力；第三，它有助于培养耐心；最后，它会让生活更充实。',
    reference: 'Firstly, reading can increase our knowledge. Secondly, it can improve our writing ability. Thirdly, it helps develop patience. Finally, it makes life more fulfilling.',
    coreWords: [
      { en: 'firstly', zh: '首先' },
      { en: 'secondly', zh: '其次' },
      { en: 'thirdly', zh: '第三' },
      { en: 'finally', zh: '最后' },
      { en: 'patience', zh: '耐心' },
    ],
    grammarPoints: [
      '-ly 序数系列与 first/second 系列不可混用，四个连接词须按序排列以体现递进。',
      'help 后接动词原形或动名词均可：helps develop / helps to develop / helps developing。',
    ],
    tips: '递进结构写作文时最稳：条目数固定、词形统一，阅卷人一眼能看出逻辑层次。',
  },
  {
    level: 'CET4', type: 'paragraph', difficulty: 2, source: '四级翻译·写作衔接专项（段落层次连接词 to begin with/then/furthermore/finally）',
    prompt: '请用 to begin with … then … furthermore … finally 组织段落，翻译：要提高英语水平，首先要坚持每天背单词；然后要多听多说；此外还应大量阅读英文材料；最后，最好能找机会与英语母语者交流。',
    reference: 'To begin with, you should keep memorizing words every day if you want to improve your English. Then, you need to listen and speak more. Furthermore, you should read a large amount of English materials. Finally, it is better to find chances to communicate with native speakers.',
    coreWords: [
      { en: 'to begin with', zh: '首先' },
      { en: 'furthermore', zh: '此外' },
      { en: 'finally', zh: '最后' },
      { en: 'native speakers', zh: '母语者' },
    ],
    grammarPoints: [
      'to begin with 是固定短语，不可写成 to begin，也不可改成 to beginning with。',
      'a large amount of 修饰不可数名词（materials 此处作不可数），a large number of 才接可数名词复数。',
    ],
    tips: 'then 与 furthermore 属于不同强度的递进，then 表顺承、furthermore 表追加，顺序不要颠倒。',
  },
  {
    level: 'CET4', type: 'paragraph', difficulty: 2, source: '四级翻译·写作衔接专项（段落层次连接词 to start with/next/in addition/finally）',
    prompt: '请用 to start with … next … in addition … finally 翻译：首先，政府应加大教育投入；接下来，学校要改进课程设置；此外，家长也应参与其中；最后，学生自己必须付出努力。',
    reference: 'To start with, the government should increase investment in education. Next, schools should improve their courses. In addition, parents should also get involved. Finally, students themselves must make efforts.',
    coreWords: [
      { en: 'to start with', zh: '首先' },
      { en: 'in addition', zh: '此外' },
      { en: 'finally', zh: '最后' },
      { en: 'investment', zh: '投入、投资' },
      { en: 'get involved', zh: '参与其中' },
    ],
    grammarPoints: [
      'in addition 是副词性连接词，后面直接加逗号接句子；in addition to 才是介词短语，须接名词。',
      'themselves 是反身代词，用于强调「学生自己」，不可省略。',
    ],
    tips: '讲义把 to start with / next / in addition / finally 归为一组，与 to begin with / then / furthermore 那组属同义替换。',
  },
  {
    level: 'CET6', type: 'paragraph', difficulty: 3, source: '六级翻译·写作衔接专项（段落层次连接词 first and foremost/besides/last but not least）',
    prompt: '请用 first and foremost … besides … last but not least 翻译：最重要的是，我们必须保护环境；此外，节约能源同样重要；最后但同样重要的是，每个人都应从自己做起。',
    reference: 'First and foremost, we must protect the environment. Besides, saving energy is equally important. Last but not least, everyone should start with himself.',
    coreWords: [
      { en: 'first and foremost', zh: '最重要的是' },
      { en: 'besides', zh: '此外' },
      { en: 'last but not least', zh: '最后但同样重要的是' },
      { en: 'environment', zh: '环境' },
    ],
    grammarPoints: [
      'last but not least 是固定搭配，不能写成 last but not the least。',
      'besides 表「另外还有」（递进），beside 意为「在……旁边」，拼写相近但词义完全不同。',
    ],
    tips: 'first and foremost 比 first 语气更重，适合放在首段第一句定调。',
  },
  {
    level: 'CET6', type: 'paragraph', difficulty: 3, source: '六级翻译·写作衔接专项（段落层次连接词 most important of all/moreover/finally）',
    prompt: '请用 most important of all … moreover … finally 翻译：最重要的是，教育决定一个国家的未来；此外，它还能促进经济发展；最后，教育有助于减少贫困。',
    reference: 'Most important of all, education determines the future of a country. Moreover, it can promote economic development. Finally, education helps reduce poverty.',
    coreWords: [
      { en: 'most important of all', zh: '最重要的是' },
      { en: 'moreover', zh: '此外' },
      { en: 'finally', zh: '最后' },
      { en: 'poverty', zh: '贫困' },
    ],
    grammarPoints: [
      'most important of all 是插入性的独立成分，不加 that，其后用逗号与主句隔开。',
      'determine 意为「决定」，与 decide（决定做某事）用法不同。',
    ],
    tips: 'moreover 比 besides 更书面，议论文里用来追加同向论据。',
  },
  {
    level: 'CET4', type: 'paragraph', difficulty: 2, source: '四级翻译·写作衔接专项（段落层次连接词 on the one hand/on the other hand）',
    prompt: '请用 on the one hand … on the other hand 翻译：一方面，手机让沟通变得更加方便；另一方面，过度使用手机会影响健康。',
    reference: 'On the one hand, mobile phones make communication more convenient. On the other hand, using them too much may affect our health.',
    coreWords: [
      { en: 'on the one hand', zh: '一方面' },
      { en: 'on the other hand', zh: '另一方面' },
      { en: 'convenient', zh: '方便的' },
      { en: 'health', zh: '健康' },
    ],
    grammarPoints: [
      'on the one hand 与 on the other hand 必须成对出现，分属两句或两个分句。',
      'on the other hand 不能缩写成 on other hand；also 可加可不加（on the other hand, also…）。',
    ],
    tips: '这组用于「同一事物的两个侧面」，若前后是相反事实，应改用 in contrast 或 on the contrary。',
  },
  {
    level: 'CET4', type: 'paragraph', difficulty: 2, source: '四级翻译·写作衔接专项（段落层次连接词 for one thing/for another thing）',
    prompt: '请用 for one thing … for another thing 翻译：一方面，这项政策能创造就业机会；另一方面，它能提高人们的生活水平。',
    reference: "For one thing, this policy can create jobs. For another thing, it can raise people's living standards.",
    coreWords: [
      { en: 'for one thing', zh: '一方面' },
      { en: 'for another thing', zh: '另一方面' },
      { en: 'policy', zh: '政策' },
      { en: 'living standards', zh: '生活水平' },
    ],
    grammarPoints: [
      'for one thing 与 for another thing 成对使用，语气比 on the one hand 更口语、更口语化。',
      "people's 是所有格，缺撇号或撇号位置错误均属拼写错误。",
    ],
    tips: '议论文中这两组衔接可互换，但同一次写作里只选一组，避免混用。',
  },

  /* ==================== 总括 / 同类过渡词 ==================== */
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（总括过渡词 as far as I am concerned）',
    prompt: '请用 as far as I am concerned 翻译：就我而言，大学生应该多参加社会实践活动。',
    reference: 'As far as I am concerned, college students should take part in more social practice activities.',
    coreWords: [
      { en: 'as far as I am concerned', zh: '就我而言' },
      { en: 'take part in', zh: '参加' },
      { en: 'social practice', zh: '社会实践' },
    ],
    grammarPoints: [
      'as far as I am concerned 是固定表达，be 动词用 am（主语 I），不能写成 is。',
      'take part in 强调参加活动并起作用，attend 强调出席，join 强调加入组织。',
    ],
    tips: '这组属于「总括过渡词」，用来自然引出个人观点，比 I think 更书面。',
  },
  {
    level: 'CET4', type: 'sentence', difficulty: 1, source: '四级翻译·写作衔接专项（总括过渡词 generally speaking）',
    prompt: '请用 generally speaking 翻译：一般来说，早起的人工作效率更高。',
    reference: 'Generally speaking, people who get up early are more efficient at work.',
    coreWords: [
      { en: 'generally speaking', zh: '一般来说' },
      { en: 'efficient', zh: '高效的' },
    ],
    grammarPoints: [
      'generally speaking 是分词短语作独立成分，逻辑主语与主句一致时使用；若不一致须改为从句。',
      'who get up early 是定语从句修饰 people，谓语用 are 与先行词 people 保持一致。',
    ],
    tips: '同类总括过渡词还有 practically speaking、strictly speaking，可作同义替换。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 2, source: '六级翻译·写作衔接专项（同类过渡词 similarly）',
    prompt: '请用 similarly 翻译：这座城市的公共交通十分便利；同样，它的自行车道系统也相当完善。',
    reference: 'The public transport in this city is very convenient. Similarly, its bike lane system is quite well developed.',
    coreWords: [
      { en: 'similarly', zh: '同样地' },
      { en: 'public transport', zh: '公共交通' },
      { en: 'convenient', zh: '便利的' },
    ],
    grammarPoints: [
      'similarly 表「同理、同样」，用于引入与上文同类的情况；likewise 与之同义。',
      'public transport 是英式说法，美式为 public transportation，两者均可。',
    ],
    tips: '讲义「同类过渡词」还有 equally important、namely、that is，用于解释或并列同类信息。',
  },

  /* ==================== 对比 / 转折过渡词 ==================== */
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（对比过渡词 in contrast）',
    prompt: '请用 in contrast 翻译：城市里的生活节奏很快；相比之下，乡村生活要悠闲得多。',
    reference: 'The pace of life in cities is very fast. In contrast, life in the countryside is much more relaxed.',
    coreWords: [
      { en: 'in contrast', zh: '相比之下' },
      { en: 'pace of life', zh: '生活节奏' },
      { en: 'countryside', zh: '乡村' },
      { en: 'relaxed', zh: '悠闲的' },
    ],
    grammarPoints: [
      'in contrast 用于客观对比两者的差异，前后是两个相对立的事实；on the contrary 则用于否定前句并给出相反情况。',
      'much more relaxed 中 much 修饰比较级，不能用 very 修饰比较级。',
    ],
    tips: 'in contrast 后若要接比较对象，用 in contrast to / with。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·写作衔接专项（对比过渡词 on the contrary）',
    prompt: '请用 on the contrary 翻译：这项措施并不会增加成本；恰恰相反，它能节省大量资金。',
    reference: 'This measure will not increase the cost. On the contrary, it can save a large amount of money.',
    coreWords: [
      { en: 'on the contrary', zh: '恰恰相反' },
      { en: 'measure', zh: '措施' },
      { en: 'cost', zh: '成本' },
    ],
    grammarPoints: [
      'on the contrary 用于否定前述说法并给出相反事实；in contrast 用于并列对比差异，二者不可互换。',
      'a large amount of 接不可数名词（money），a large number of 接可数名词复数。',
    ],
    tips: '这是四六级写作最常被误用的一组衔接，判断标准：前句是不是被「否定」了。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 2, source: '六级翻译·写作衔接专项（转折过渡词 nevertheless）',
    prompt: '请用 nevertheless 翻译：这个项目面临许多风险；然而，我们不应放弃努力。',
    reference: 'This project faces many risks. Nevertheless, we should not give up our efforts.',
    coreWords: [
      { en: 'nevertheless', zh: '然而' },
      { en: 'risks', zh: '风险' },
      { en: 'give up', zh: '放弃' },
    ],
    grammarPoints: [
      'nevertheless 是副词，前后用句号或分号连接两个句子；不可像 but 那样直接连接两个分句。',
      'give up 后接动名词或名词：give up trying / give up our efforts。',
    ],
    tips: 'nevertheless 比 however 更正式，在六级作文中用来表现「让步后的转折」。',
  },
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（转折过渡词 however）',
    prompt: '请用 however 翻译：这项技术已经相当成熟；然而，它的成本仍然很高。',
    reference: 'This technology is already quite mature. However, its cost is still very high.',
    coreWords: [
      { en: 'however', zh: '然而' },
      { en: 'mature', zh: '成熟的' },
      { en: 'cost', zh: '成本' },
    ],
    grammarPoints: [
      'however 作副词表转折时前后用标点隔开；作连词时 however + 形容词/副词 = no matter how，如 however hard he tried。',
      'quite 修饰形容词表示「相当」，与 very 程度相当但语气略弱。',
    ],
    tips: '转折类过渡词还有 yet、whereas、otherwise、despite，注意 whereas 是连词、despite 是介词。',
  },

  /* ==================== 举例 / 原因过渡词 ==================== */
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（举例过渡词 for example）',
    prompt: '请用 for example 翻译：许多传统手艺正面临失传的风险；例如，会制作油纸伞的手艺人已经越来越少。',
    reference: 'Many traditional crafts are facing the risk of dying out. For example, there are fewer and fewer craftsmen who can make oil-paper umbrellas.',
    coreWords: [
      { en: 'for example', zh: '例如' },
      { en: 'traditional crafts', zh: '传统手艺' },
      { en: 'risk', zh: '风险' },
    ],
    grammarPoints: [
      'for example 后接句子，for instance 与之同义；such as 后接名词或名词短语，不能接完整句子。',
      'there are fewer and fewer 是「越来越少」的地道表达，注意比较级叠加结构。',
    ],
    tips: '讲义把「举例过渡词」还列为 a case in point is that、as an illustration，后者更书面。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·写作衔接专项（举例过渡词 a case in point is that）',
    prompt: '请用 a case in point is that 翻译：发展新能源能有效减少污染；一个典型的例子就是电动汽车的迅速普及。',
    reference: 'Developing new energy can effectively reduce pollution. A case in point is that electric cars are becoming increasingly popular.',
    coreWords: [
      { en: 'a case in point is that', zh: '一个典型的例子是' },
      { en: 'reduce pollution', zh: '减少污染' },
      { en: 'electric cars', zh: '电动汽车' },
    ],
    grammarPoints: [
      'a case in point 意为「恰如其分的例子」，后接 is that 引导表语从句，写作中比 for example 更高级。',
      '动名词短语 Developing new energy 作主语时，谓语动词用单数 can。',
    ],
    tips: '配套表达：as an illustration, …；to illustrate, …。',
  },
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（原因过渡词 owing to）',
    prompt: '请用 owing to 翻译：由于天气恶劣，昨天的所有航班都被取消了。',
    reference: 'Owing to the bad weather, all the flights yesterday were cancelled.',
    coreWords: [
      { en: 'owing to', zh: '由于' },
      { en: 'bad weather', zh: '恶劣的天气' },
      { en: 'cancelled', zh: '取消' },
    ],
    grammarPoints: [
      'owing to、due to、because of 都是介词短语，后接名词或名词短语，不能接完整句子。',
      'flights 是被取消的，故用被动语态 were cancelled。',
    ],
    tips: '讲义「原因过渡词」共 10 个：due to、considering、as a result of、given、in that、in the view of、on account of、on the grounds of、owing to、seeing that。',
  },
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（原因过渡词 due to）',
    prompt: '请用 due to 翻译：由于技术进步，这些设备的价格大幅下降了。',
    reference: 'Due to technological progress, the prices of these devices have dropped sharply.',
    coreWords: [
      { en: 'due to', zh: '由于' },
      { en: 'technological progress', zh: '技术进步' },
      { en: 'devices', zh: '设备' },
    ],
    grammarPoints: [
      'due to 在传统语法中作表语（The delay was due to…），现代英语中作状语也已广泛接受。',
      'have dropped 用现在完成时，强调「已经发生的下降对现在的影响」。',
    ],
    tips: 'due to 与 owing to 可互换；但 due to 更常用于书面，owing to 更中性。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·写作衔接专项（原因过渡词 on the grounds of）',
    prompt: '请用 on the grounds of 翻译：由于安全原因，这条道路暂时封闭。',
    reference: 'On the grounds of safety, this road is temporarily closed.',
    coreWords: [
      { en: 'on the grounds of', zh: '由于、基于……理由' },
      { en: 'safety', zh: '安全' },
      { en: 'temporarily', zh: '暂时地' },
    ],
    grammarPoints: [
      'on the grounds of 表示「以……为理由」，比 because of 更正式，多用于法律、公告等文体。',
      'temporarily 是副词修饰 closed，注意拼写：temporarily（不是 temporally）。',
    ],
    tips: 'grounds 恒用复数，on the ground of 也可接受，但 on the grounds that + 从句更常见。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·写作衔接专项（原因过渡词 seeing that）',
    prompt: '请用 seeing that 翻译：考虑到他已经尽了最大努力，我们不应再指责他。',
    reference: 'Seeing that he has already tried his best, we should not blame him any more.',
    coreWords: [
      { en: 'seeing that', zh: '考虑到' },
      { en: 'blame', zh: '指责' },
    ],
    grammarPoints: [
      'seeing that 引导原因状语从句，与 considering that、given that 同义，都属连词。',
      'not … any more 表「不再」，与之对应的 not … any longer 强调时间上的不再延续。',
    ],
    tips: '这一组是六级写作提分点：用连词引导从句比用介词短语接名词更能显示句式能力。',
  },

  /* ==================== 让步 / 强调过渡词 ==================== */
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·写作衔接专项（让步过渡词 admittedly）',
    prompt: '请用 admittedly 翻译：诚然，互联网给我们的生活带来了便利，但它也带来了一些问题。',
    reference: 'Admittedly, the Internet has brought convenience to our lives, but it has also brought some problems.',
    coreWords: [
      { en: 'admittedly', zh: '诚然、无可否认' },
      { en: 'convenience', zh: '便利' },
      { en: 'problems', zh: '问题' },
    ],
    grammarPoints: [
      'admittedly 是「先承认、再转折」的让步副词，常与 but 或 nevertheless 呼应。',
      'bring sth to sb 表「给某人带来某物」，此处用 bring convenience to our lives。',
    ],
    tips: '让步过渡词还有 although、in spite of、even though、certainly、indeed，其中 in spite of 是介词短语。',
  },
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（让步过渡词 even though）',
    prompt: '请用 even though 翻译：尽管他遇到了很多困难，他仍然坚持完成了这项研究。',
    reference: 'Even though he met many difficulties, he still insisted on finishing the research.',
    coreWords: [
      { en: 'even though', zh: '尽管' },
      { en: 'difficulties', zh: '困难' },
      { en: 'insisted on', zh: '坚持' },
    ],
    grammarPoints: [
      'even though 引导让步状语从句，语气比 although 更强；though 可与 even 分开用（Even he though…不成立，注意语序）。',
      'insist on 中 on 是介词，后接动名词 finishing，不能接动词原形。',
    ],
    tips: '让步从句中不能再用 but：Even though he met many difficulties, he still… 是正确写法。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·写作衔接专项（强调过渡词 needless to say）',
    prompt: '请用 needless to say 翻译：不言而喻，良好的教育对一个人的未来至关重要。',
    reference: "Needless to say, a good education is of great importance to a person's future.",
    coreWords: [
      { en: 'needless to say', zh: '不言而喻' },
      { en: 'education', zh: '教育' },
      { en: 'great importance', zh: '至关重要' },
    ],
    grammarPoints: [
      'be of great importance = be very important，of + 抽象名词 = 形容词，是六级高频书面表达。',
      "a person's future 中所有格撇号位置在 s 之前（单数名词）。",
    ],
    tips: '强调过渡词还有 chiefly、even worse、most important of all、no doubt、particularly。',
  },
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（强调过渡词 even worse）',
    prompt: '请用 even worse 翻译：这次事故发生得很突然；更糟糕的是，当时正下着大雨。',
    reference: 'The accident happened very suddenly. Even worse, it was raining heavily at that time.',
    coreWords: [
      { en: 'even worse', zh: '更糟糕的是' },
      { en: 'accident', zh: '事故' },
      { en: 'suddenly', zh: '突然地' },
    ],
    grammarPoints: [
      'even worse 是「递进式强调」，用于在前述不利情况上再加一层。',
      'was raining 用过去进行时，表示事故发生时正在持续的天气状态。',
    ],
    tips: '写作中可用 What is worse 替换 even worse，句式更灵活。',
  },

  /* ==================== 目的 / 条件过渡词 ==================== */
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·写作衔接专项（目的过渡词 for the sake of）',
    prompt: '请用 for the sake of 翻译：为了下一代的健康，我们必须保护环境。',
    reference: 'For the sake of the health of the next generation, we must protect the environment.',
    coreWords: [
      { en: 'for the sake of', zh: '为了' },
      { en: 'next generation', zh: '下一代' },
      { en: 'protect the environment', zh: '保护环境' },
    ],
    grammarPoints: [
      'for the sake of 后接名词或名词短语（for the sake of health），不能直接接句子。',
      'the health of the next generation 是「of 所有格」，比 the next generation\u2019s health 更正式。',
    ],
    tips: '目的过渡词还有 with the aim of、with the view to、for the purpose of，后接动名词。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·写作衔接专项（目的过渡词 with a view to）',
    prompt: '请用 with a view to 翻译：为了提高教学质量，学校引进了一批新设备。',
    reference: 'With a view to improving the quality of teaching, the school has introduced a batch of new equipment.',
    coreWords: [
      { en: 'with a view to', zh: '为了' },
      { en: 'quality of teaching', zh: '教学质量' },
      { en: 'equipment', zh: '设备' },
    ],
    grammarPoints: [
      'with a view to 中的 to 是介词，后接动名词 improving，不能接动词原形。',
      'equipment 是不可数名词，没有复数形式 equipments，计量用 a piece of equipment。',
    ],
    tips: '区分 with a view to doing（为了）与 in view of（鉴于），后者表原因。',
  },
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（条件过渡词 as long as）',
    prompt: '请用 as long as 翻译：只要坚持练习，每个人的英语水平都能得到提高。',
    reference: 'As long as you keep practising, everyone can improve their English.',
    coreWords: [
      { en: 'as long as', zh: '只要' },
      { en: 'keep practising', zh: '坚持练习' },
      { en: 'improve', zh: '提高' },
    ],
    grammarPoints: [
      'as long as 引导条件状语从句，条件从句用一般现在时表将来，主句用情态动词或将来时。',
      'keep doing 表「持续做某事」，keep on doing 语气更强。',
    ],
    tips: '条件过渡词还有 given、provided that，其中 provided that 更书面。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·写作衔接专项（条件过渡词 provided that）',
    prompt: '请用 provided that 翻译：只要条件允许，我们就会继续推进这个计划。',
    reference: 'Provided that conditions permit, we will continue to carry out this plan.',
    coreWords: [
      { en: 'provided that', zh: '只要' },
      { en: 'conditions', zh: '条件' },
      { en: 'carry out', zh: '推进、执行' },
    ],
    grammarPoints: [
      'provided that 等于 providing that，是正式的条件连词，多用于合同、公文与议论文。',
      'carry out 表「执行、实施」，宾语是计划、政策、实验等。',
    ],
    tips: 'if 与 provided that 的差别：后者强调「以……为前提条件」，语气更正式。',
  },

  /* ==================== 结论过渡词 ==================== */
  {
    level: 'CET4', type: 'sentence', difficulty: 2, source: '四级翻译·写作衔接专项（结论过渡词 in short）',
    prompt: '请用 in short 翻译：总之，只有通过不断努力，我们才能实现自己的目标。',
    reference: 'In short, only through constant efforts can we achieve our goals.',
    coreWords: [
      { en: 'in short', zh: '总之' },
      { en: 'constant efforts', zh: '不断努力' },
      { en: 'achieve', zh: '实现' },
    ],
    grammarPoints: [
      'only 置于句首修饰状语时，主句须部分倒装：only through … can we achieve…。',
      'constant 意为「持续不断的」，continuous 强调「不间断的」，二者语境有别。',
    ],
    tips: '结论过渡词还有 in brief、in a word、to sum up、in summary，写作结尾可择优使用。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 2, source: '六级翻译·写作衔接专项（结论过渡词 as a result）',
    prompt: '请用 as a result 翻译：这家工厂长期排放污水；结果，附近的河流被严重污染了。',
    reference: 'This factory had been discharging waste water for a long time. As a result, the nearby river was seriously polluted.',
    coreWords: [
      { en: 'as a result', zh: '结果' },
      { en: 'waste water', zh: '污水' },
      { en: 'polluted', zh: '污染' },
    ],
    grammarPoints: [
      'as a result 是副词性短语，后接结果；as a result of 才是介词短语，后接原因。',
      'had been discharging 是过去完成进行时，强调在结果出现前该行为一直持续。',
    ],
    tips: '结论过渡词 accordingly、consequently、hence、therefore 与 as a result 同类，写作中避免重复使用同一个。',
  },
  {
    level: 'CET6', type: 'sentence', difficulty: 3, source: '六级翻译·写作衔接专项（结论过渡词 on the whole）',
    prompt: '请用 on the whole 翻译：总的来说，这次活动取得了圆满成功。',
    reference: 'On the whole, this activity was a complete success.',
    coreWords: [
      { en: 'on the whole', zh: '总的来说' },
      { en: 'activity', zh: '活动' },
      { en: 'complete success', zh: '圆满成功' },
    ],
    grammarPoints: [
      'on the whole 意为「总体上」（= in general），on the other hand 才是「另一方面」，形近但意义完全不同。',
      'success 在此作可数名词，表示「一件成功的事」，故加 a。',
    ],
    tips: '讲义「结论过渡词」共 14 个，其中最常用的是 in conclusion、to sum up、on the whole、in brief。',
  },
]
