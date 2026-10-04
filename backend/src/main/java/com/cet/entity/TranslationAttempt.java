package com.cet.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 翻译作答记录
 */
@Data
@TableName(value = "translation_attempt", autoResultMap = true)
public class TranslationAttempt {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String questionId;

    /** 用户译文 */
    private String answer;

    /** 机器分（本地启发式）0-100 */
    private Integer score;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> hitWords;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> missWords;

    /** 是否进入错题本 */
    private Boolean isWrong;

    private LocalDateTime createTime;

    /* ---------------- LLM 二次润色评分（由前端回填） ---------------- */

    /** LLM 语义/语法分 0-100 */
    private Integer llmScore;

    /** 综合分 = 机器分 40% + 语义分 60% */
    private Integer finalScore;

    /** LLM 中文点评 */
    private String llmComment;

    /** LLM 润色后的地道译文 */
    private String polish;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> llmIssues;
}
