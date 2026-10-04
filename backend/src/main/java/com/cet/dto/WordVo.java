package com.cet.dto;

import com.cet.entity.Word;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 单词视图：词条 + 当前用户学习状态
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class WordVo extends Word {

    /** NEW / LEARNING / KNOWN */
    private String status = "NEW";

    /** 熟悉度 0-5 */
    private Integer familiarity = 0;

    /** 是否加入生词本 */
    private Integer inNotebook = 0;

    /** 下次复习时间 */
    private String nextReviewAt;

    /** 已复习次数 */
    private Integer reviewCount = 0;

    /** 遗忘次数 */
    private Integer lapseCount = 0;

    /** 本次来源：new 新学 / review 复习 */
    private String mode = "new";
}
