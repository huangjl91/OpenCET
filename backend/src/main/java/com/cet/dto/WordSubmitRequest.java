package com.cet.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 单词学习反馈
 * result: KNOWN 认识 / FUZZY 模糊 / UNKNOWN 不认识（不认识自动进生词本）
 */
@Data
public class WordSubmitRequest {

    @NotBlank(message = "wordId 不能为空")
    private String wordId;

    private String result = "KNOWN";

    /** 是否加入 / 移出生词本 */
    private Integer inNotebook;

    /** 本次是复习还是新学 */
    private String mode = "new";
}
