package com.cet.dto;

import lombok.Data;

import java.util.List;

/**
 * 评分构成明细：让用户看到分数是怎么来的
 */
@Data
public class ScoreBreakdown {

    /** 核心词得分（满分 55） */
    private Integer coreScore;

    /** 篇幅贴合得分（满分 30） */
    private Integer lengthScore;

    /** 语言规范得分（满分 15） */
    private Integer languageScore;

    /** 核心词覆盖率 0-1（近似命中/语序存疑记半分） */
    private Double coreRate;

    /** 篇幅贴合度 0-1 */
    private Double lengthFit;

    /** 冗余度 0-1，内容词重复占比 */
    private Double redundancy;

    /** 语言规范预警（句首大写、句末标点、重复词、拼写） */
    private List<String> languageIssues;

    /** 疑似拼写错误提示 */
    private List<String> spellingIssues;

    /** 高频重复词（形如 word×3） */
    private List<String> repeatedWords;
}
