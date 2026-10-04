package com.cet.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

/**
 * 保存真题（前端完成“自动切分”后提交结构化结果，服务端只负责落库与进度维护）
 */
@Data
public class PaperCreateRequest {

    @NotBlank(message = "标题不能为空")
    private String title;

    /** CET4 / CET6 */
    private String level;

    /** 如 2023-06 */
    private String yearMonth;

    private String source;

    /** 原始粘贴文本，便于后续二次切分 */
    private String rawText;

    private List<SectionInput> sections;

    @Data
    public static class SectionInput {
        /** writing / listening / cloze / reading / translation */
        private String type;
        private String title;
        private String passage;
        private List<QuestionInput> questions;
    }

    @Data
    public static class QuestionInput {
        private Integer orderNo;
        private String stem;
        private List<String> options;
        private String answer;
        private String analysis;
    }
}
