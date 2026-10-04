package com.cet.dto;

import com.cet.entity.Paper;
import com.cet.entity.PaperQuestion;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

/**
 * 试卷详情（含模块与单题）
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class PaperDetailVo extends Paper {

    private List<SectionVo> sectionList;

    @Data
    public static class SectionVo {
        private Long id;
        private String type;
        private String title;
        private String passage;
        private Integer orderNo;
        private List<PaperQuestion> questions;

        public Integer getQuestionCount() {
            return questions == null ? 0 : questions.size();
        }
    }
}
