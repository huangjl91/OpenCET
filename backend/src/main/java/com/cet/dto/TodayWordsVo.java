package com.cet.dto;

import lombok.Data;

import java.util.List;

/**
 * 今日学习队列
 */
@Data
public class TodayWordsVo {

    private String level;

    private String date;

    /** 每日新学目标量 */
    private Integer goal;

    /** 每日复习上限 */
    private Integer reviewGoal;

    /** 今日已学新词 */
    private Integer learnedToday;

    /** 今日已复习 */
    private Integer reviewedToday;

    /** 待学新词队列 */
    private List<WordVo> newWords;

    /** 待复习队列（按遗忘曲线到期） */
    private List<WordVo> reviewWords;

    public long getTotalToday() {
        return (newWords == null ? 0 : newWords.size()) + (reviewWords == null ? 0 : reviewWords.size());
    }
}
