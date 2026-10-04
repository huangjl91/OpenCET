package com.cet.dto;

import lombok.Data;

/**
 * 首页总览统计
 */
@Data
public class StatsVo {

    /** 当前备考等级 */
    private String level;

    /** 累计新学 */
    private Long learnedTotal;

    /** 累计复习 */
    private Long reviewTotal;

    /** 已掌握 */
    private Long knownTotal;

    /** 生词本数量 */
    private Long notebookTotal;

    /** 待复习数量 */
    private Long dueTotal;

    /** 词库总量（按当前等级） */
    private Long wordTotal;

    /** 连续打卡天数 */
    private Integer streak;

    /** 最长连续打卡 */
    private Integer longestStreak;

    /** 累计打卡天数 */
    private Integer checkinDays;

    /** 今日是否达标 */
    private Boolean todayDone;

    /** 今日新学 / 今日复习 */
    private Integer learnedToday;

    private Integer reviewedToday;

    private Integer dailyGoal;

    /** 翻译完成数 */
    private Long translationCount;

    /** 翻译平均分 */
    private Integer translationAvgScore;

    /** 真题套数 */
    private Long paperCount;

    /** 真题已完成题数 */
    private Long paperDoneCount;

    /** 真题总题数 */
    private Long paperTotalCount;

    /** 错题本数量 */
    private Long errorCount;
}
