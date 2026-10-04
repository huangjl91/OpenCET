-- ============================================================
-- OpenCET 建表脚本（MySQL 8.0+）
-- 执行顺序：先建库建表（本文件），再导入 data.sql
-- ============================================================
CREATE DATABASE IF NOT EXISTS opencet
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE opencet;

-- ---------------- 用户（本地 Token 免注册，首次访问自动创建）----------------
DROP TABLE IF EXISTS `user`;
CREATE TABLE `user` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `token`         VARCHAR(64)  NOT NULL COMMENT '本地用户标识（浏览器 localStorage 生成，免注册）',
  `nickname`      VARCHAR(64)  NOT NULL DEFAULT 'CET 考生' COMMENT '昵称',
  `current_level` VARCHAR(16)  NOT NULL DEFAULT 'CET4' COMMENT '当前备考等级 CET4 / CET6',
  `daily_goal`    INT          NOT NULL DEFAULT 20 COMMENT '每日新学目标量',
  `review_goal`   INT          NOT NULL DEFAULT 40 COMMENT '每日复习上限量',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_token` (`token`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户表';

-- ---------------- 词汇库 ----------------
DROP TABLE IF EXISTS `word`;
CREATE TABLE `word` (
  `id`          VARCHAR(32) NOT NULL COMMENT '词库 ID，如 cet4-001',
  `level`       VARCHAR(16) NOT NULL COMMENT 'CET4 / CET6',
  `word`        VARCHAR(64) NOT NULL COMMENT '单词',
  `phonetic`    VARCHAR(64)  DEFAULT NULL COMMENT '音标',
  `pos`         VARCHAR(64)  DEFAULT NULL COMMENT '词性',
  `meaning`     VARCHAR(512) NOT NULL COMMENT '中文释义',
  `example_en`  TEXT COMMENT '真题例句（英）',
  `example_zh`  TEXT COMMENT '例句翻译（中）',
  `source`      VARCHAR(128) DEFAULT NULL COMMENT '例句来源，如 四级阅读·教育类',
  `freq_rank`   INT          NOT NULL DEFAULT 9999 COMMENT '词频序号，越小越高频',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_word_level` (`level`, `freq_rank`),
  KEY `idx_word_text` (`word`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '词汇库';

-- ---------------- 单词学习进度（遗忘曲线核心表）----------------
DROP TABLE IF EXISTS `word_progress`;
CREATE TABLE `word_progress` (
  `id`             BIGINT   NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT   NOT NULL,
  `word_id`        VARCHAR(32) NOT NULL COMMENT '关联 word.id',
  `status`         VARCHAR(16) NOT NULL DEFAULT 'NEW' COMMENT 'NEW 未学 / LEARNING 学习中 / KNOWN 已掌握',
  `stage`          INT      NOT NULL DEFAULT 0 COMMENT '遗忘曲线阶段 0-7，越大间隔越长',
  `familiarity`    INT      NOT NULL DEFAULT 0 COMMENT '熟悉度 0-5',
  `review_count`   INT      NOT NULL DEFAULT 0 COMMENT '累计复习次数',
  `lapse_count`    INT      NOT NULL DEFAULT 0 COMMENT '累计遗忘次数（答错回退）',
  `in_notebook`    TINYINT  NOT NULL DEFAULT 0 COMMENT '是否加入生词本 0/1',
  `next_review_at` DATETIME DEFAULT NULL COMMENT '下次复习时间（遗忘曲线计算）',
  `last_review_at` DATETIME DEFAULT NULL COMMENT '上次复习时间',
  `create_time`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wp_user_word` (`user_id`, `word_id`),
  KEY `idx_wp_review` (`user_id`, `next_review_at`),
  KEY `idx_wp_status` (`user_id`, `status`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '单词学习进度与遗忘曲线';

-- ---------------- 每日打卡 ----------------
DROP TABLE IF EXISTS `checkin`;
CREATE TABLE `checkin` (
  `id`            BIGINT   NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT   NOT NULL,
  `checkin_date`  DATE     NOT NULL COMMENT '打卡日期',
  `learn_count`   INT      NOT NULL DEFAULT 0 COMMENT '当日新学词数',
  `review_count`  INT      NOT NULL DEFAULT 0 COMMENT '当日复习词数',
  `target_count`  INT      NOT NULL DEFAULT 20 COMMENT '当日目标量',
  `done`          TINYINT  NOT NULL DEFAULT 0 COMMENT '是否达标 0/1',
  `create_time`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ck_user_date` (`user_id`, `checkin_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '每日打卡记录';

-- ---------------- 翻译题库 ----------------
DROP TABLE IF EXISTS `translation_question`;
CREATE TABLE `translation_question` (
  `id`             VARCHAR(32) NOT NULL,
  `level`          VARCHAR(16) NOT NULL COMMENT 'CET4 / CET6',
  `type`           VARCHAR(16) NOT NULL DEFAULT 'sentence' COMMENT 'sentence 单句 / paragraph 段落',
  `difficulty`     INT         NOT NULL DEFAULT 1 COMMENT '1 基础 / 2 进阶 / 3 挑战',
  `source`         VARCHAR(128) DEFAULT NULL COMMENT '题源',
  `prompt`         TEXT        NOT NULL COMMENT '待翻译原文（中文）',
  `reference`      TEXT        NOT NULL COMMENT '参考译文（英文）',
  `tips`           TEXT COMMENT '翻译提示',
  `core_words`     JSON COMMENT '核心词汇 [{en, zh}]',
  `grammar_points` JSON COMMENT '语法点解析 []',
  `create_time`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tq_level` (`level`, `type`, `difficulty`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '翻译题库';

-- ---------------- 翻译作答记录 ----------------
DROP TABLE IF EXISTS `translation_attempt`;
CREATE TABLE `translation_attempt` (
  `id`           BIGINT   NOT NULL AUTO_INCREMENT,
  `user_id`      BIGINT   NOT NULL,
  `question_id`  VARCHAR(32) NOT NULL,
  `answer`       TEXT COMMENT '用户译文',
  `score`        INT      NOT NULL DEFAULT 0 COMMENT '机器分 0-100（核心词覆盖 55 + 篇幅贴合 30 + 语言规范 15）',
  `hit_words`    JSON COMMENT '命中核心词',
  `miss_words`   JSON COMMENT '未命中核心词',
  `is_wrong`     TINYINT  NOT NULL DEFAULT 0 COMMENT '是否进入错题本',
  `create_time`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `llm_score`    INT      NULL COMMENT 'LLM 语义/语法分 0-100（前端直连模型后回填）',
  `final_score`  INT      NULL COMMENT '综合分 = 机器分 40% + 语义分 60%',
  `llm_comment`  TEXT     NULL COMMENT 'LLM 中文点评',
  `polish`       TEXT     NULL COMMENT 'LLM 润色后的地道译文',
  `llm_issues`   JSON     NULL COMMENT 'LLM 指出的问题清单',
  PRIMARY KEY (`id`),
  KEY `idx_ta_user_q` (`user_id`, `question_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '翻译作答记录';

-- ---------------- 真题试卷 ----------------
DROP TABLE IF EXISTS `paper`;
CREATE TABLE `paper` (
  `id`           BIGINT   NOT NULL AUTO_INCREMENT,
  `user_id`      BIGINT   NOT NULL DEFAULT 0 COMMENT '0 = 系统内置示范卷',
  `title`        VARCHAR(255) NOT NULL COMMENT '试卷标题',
  `level`        VARCHAR(16)  NOT NULL DEFAULT 'CET4',
  `year_month`   VARCHAR(16)  DEFAULT NULL COMMENT '如 2023-06',
  `source`       VARCHAR(64)  DEFAULT NULL COMMENT '来源：上传 / 粘贴 / 内置',
  `raw_text`     LONGTEXT COMMENT '原始粘贴文本，便于二次切分',
  `total_count`  INT      NOT NULL DEFAULT 0 COMMENT '题目总数',
  `done_count`   INT      NOT NULL DEFAULT 0 COMMENT '已完成题数',
  `create_time`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_paper_user` (`user_id`, `create_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '真题试卷';

-- ---------------- 试卷模块（听力 / 阅读 / 选词填空 / 翻译 / 写作）----------------
DROP TABLE IF EXISTS `paper_section`;
CREATE TABLE `paper_section` (
  `id`            BIGINT   NOT NULL AUTO_INCREMENT,
  `paper_id`      BIGINT   NOT NULL,
  `section_type`  VARCHAR(32) NOT NULL DEFAULT 'reading' COMMENT 'writing/listening/cloze/reading/translation',
  `title`         VARCHAR(255) DEFAULT NULL COMMENT '模块标题',
  `passage`       LONGTEXT COMMENT '模块公共题干 / 听力原文 / 阅读文章',
  `order_no`      INT      NOT NULL DEFAULT 0,
  `create_time`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ps_paper` (`paper_id`, `order_no`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '真题模块';

-- ---------------- 单题 ----------------
DROP TABLE IF EXISTS `paper_question`;
CREATE TABLE `paper_question` (
  `id`          BIGINT   NOT NULL AUTO_INCREMENT,
  `paper_id`    BIGINT   NOT NULL,
  `section_id`  BIGINT   NOT NULL,
  `order_no`    INT      NOT NULL DEFAULT 0 COMMENT '题号',
  `stem`        LONGTEXT COMMENT '题干',
  `options`     JSON COMMENT '选项 A/B/C/D',
  `answer`      LONGTEXT COMMENT '参考答案 / 解析答案',
  `analysis`    LONGTEXT COMMENT '解析',
  `user_answer` VARCHAR(64) DEFAULT NULL COMMENT '用户作答',
  `done`        TINYINT  NOT NULL DEFAULT 0 COMMENT '完成状态',
  `favorite`    TINYINT  NOT NULL DEFAULT 0 COMMENT '收藏',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pq_paper` (`paper_id`, `order_no`),
  KEY `idx_pq_section` (`section_id`, `order_no`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '真题单题';

-- ---------------- 错题本（单词 / 翻译 / 真题统一收纳）----------------
DROP TABLE IF EXISTS `error_book`;
CREATE TABLE `error_book` (
  `id`           BIGINT   NOT NULL AUTO_INCREMENT,
  `user_id`      BIGINT   NOT NULL,
  `source_type`  VARCHAR(16) NOT NULL COMMENT 'WORD / TRANSLATION / PAPER',
  `source_id`    VARCHAR(64) NOT NULL COMMENT '来源记录 ID',
  `title`        VARCHAR(255) DEFAULT NULL COMMENT '错题标题',
  `content`      LONGTEXT COMMENT '错题内容快照',
  `user_answer`  LONGTEXT COMMENT '我的作答',
  `right_answer` LONGTEXT COMMENT '正确答案',
  `note`         LONGTEXT COMMENT '笔记 / 解析要点',
  `resolved`     TINYINT  NOT NULL DEFAULT 0 COMMENT '是否已掌握',
  `create_time`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eb_user` (`user_id`, `source_type`, `resolved`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '错题本';
