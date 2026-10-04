package com.cet.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

/**
 * LLM 二次润色评分结果回填
 *
 * <p>评分链路：本地启发式给出机器分 → 浏览器直连 LLM 给出语义分与润色译文
 * → 前端算好综合分后调用本接口持久化，并按综合分重新判定错题本。
 * API Key 不经过后端，故这里只接收模型返回的结论。
 */
@Data
public class TranslationReviewRequest {

    @NotBlank(message = "questionId 不能为空")
    private String questionId;

    /** 用户译文（用于定位最近一次作答记录，可选） */
    private String answer;

    /** LLM 语义/语法评分 0-100 */
    private Integer llmScore;

    /** 综合分 0-100（机器分与语义分加权） */
    private Integer finalScore;

    /** LLM 中文点评 */
    private String llmComment;

    /** LLM 润色后的地道译文 */
    private String polish;

    /** LLM 指出的问题清单 */
    private List<String> llmIssues;

    /** 使用的模型名，便于回溯 */
    private String llmModel;
}
