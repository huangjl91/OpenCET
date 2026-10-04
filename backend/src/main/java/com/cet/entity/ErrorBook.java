package com.cet.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 错题本（单词 / 翻译 / 真题统一收纳）
 */
@Data
@TableName("error_book")
public class ErrorBook {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** WORD / TRANSLATION / PAPER */
    private String sourceType;

    private String sourceId;

    private String title;

    private String content;

    private String userAnswer;

    private String rightAnswer;

    private String note;

    /** 是否已掌握 */
    private Boolean resolved;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
