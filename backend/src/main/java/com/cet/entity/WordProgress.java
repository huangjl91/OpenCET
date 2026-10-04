package com.cet.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 单词学习进度（遗忘曲线核心）
 *
 * <p>stage 与复习间隔的对应关系见 {@link com.cet.service.impl.WordServiceImpl#INTERVAL_DAYS}：
 * 0→当天，1→1天，2→2天，3→4天，4→7天，5→15天，6→30天，7→60天。
 */
@Data
@TableName("word_progress")
public class WordProgress {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String wordId;

    /** NEW / LEARNING / KNOWN */
    private String status;

    /** 遗忘曲线阶段 0-7 */
    private Integer stage;

    /** 熟悉度 0-5 */
    private Integer familiarity;

    private Integer reviewCount;

    private Integer lapseCount;

    /** 是否在生词本 */
    private Integer inNotebook;

    private LocalDateTime nextReviewAt;

    private LocalDateTime lastReviewAt;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
