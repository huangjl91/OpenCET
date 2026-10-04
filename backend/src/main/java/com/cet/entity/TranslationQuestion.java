package com.cet.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.cet.dto.CoreWord;
import com.cet.handler.CoreWordListTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 翻译题目
 */
@Data
@TableName(value = "translation_question", autoResultMap = true)
public class TranslationQuestion {

    @TableId
    private String id;

    /** CET4 / CET6 */
    private String level;

    /** sentence 单句 / paragraph 段落 */
    private String type;

    /** 1 基础 / 2 进阶 / 3 挑战 */
    private Integer difficulty;

    private String source;

    /** 待翻译原文（中文） */
    private String prompt;

    /** 参考译文（英文） */
    private String reference;

    private String tips;

    @com.baomidou.mybatisplus.annotation.TableField(typeHandler = CoreWordListTypeHandler.class)
    private List<CoreWord> coreWords;

    @com.baomidou.mybatisplus.annotation.TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> grammarPoints;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
