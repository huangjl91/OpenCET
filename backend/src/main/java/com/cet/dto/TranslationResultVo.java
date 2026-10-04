package com.cet.dto;

import com.cet.entity.TranslationQuestion;
import lombok.Data;

import java.util.List;

/**
 * 翻译批改结果
 */
@Data
public class TranslationResultVo {

    private String questionId;

    /** 机器分（本地启发式）0-100 */
    private Integer score;

    private String answer;

    private TranslationQuestion question;

    /** 完全命中核心词 */
    private List<String> hitWords;

    /** 词组内各词都在、但位置跨度过大（语序/搭配存疑） */
    private List<String> reorderWords;

    /** 拼写近似命中的核心词 */
    private List<NearMissVo> nearWords;

    /** 未命中核心词 */
    private List<String> missWords;

    /** 是否进入错题本 */
    private Boolean wrong;

    /** 机器点评 */
    private String comment;

    /** 评分构成明细（核心词 / 篇幅 / 语言规范） */
    private ScoreBreakdown breakdown;

    /** 最近一次作答记录 id，供前端回填 LLM 复核结果 */
    private Long attemptId;

    /* ------------------------- LLM 二次润色评分（回填后回显） ------------------------- */

    /** LLM 语义/语法分 */
    private Integer llmScore;

    /** 综合分 = 机器分与语义分加权 */
    private Integer finalScore;

    /** LLM 点评 */
    private String llmComment;

    /** LLM 润色译文 */
    private String polish;

    /** LLM 问题清单 */
    private List<String> llmIssues;
}
