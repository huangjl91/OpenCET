package com.cet.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 翻译提交
 */
@Data
public class TranslationSubmitRequest {

    @NotBlank(message = "questionId 不能为空")
    private String questionId;

    private String answer;
}
