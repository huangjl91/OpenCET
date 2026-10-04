package com.cet.service;

import com.cet.entity.Checkin;
import com.cet.mapper.CheckinMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 打卡服务：每日记录 + 连续天数统计
 */
@Service
@RequiredArgsConstructor
public class CheckinService {

    private final CheckinMapper checkinMapper;

    /**
     * 取（或创建）当日打卡记录
     */
    @Transactional
    public Checkin today(Long userId, int target) {
        LocalDate today = LocalDate.now();
        Checkin c = checkinMapper.selectByDate(userId, today);
        if (c == null) {
            c = new Checkin();
            c.setUserId(userId);
            c.setCheckinDate(today);
            c.setLearnCount(0);
            c.setReviewCount(0);
            c.setTargetCount(target);
            c.setDone(false);
            checkinMapper.insert(c);
        }
        return c;
    }

    /**
     * 累加学习量：learnDelta 新学增量，reviewDelta 复习增量
     */
    @Transactional
    public Checkin addProgress(Long userId, int learnDelta, int reviewDelta, int target) {
        Checkin c = today(userId, target);
        c.setLearnCount(Math.max(0, c.getLearnCount() + learnDelta));
        c.setReviewCount(Math.max(0, c.getReviewCount() + reviewDelta));
        if (target > 0) {
            c.setTargetCount(target);
        }
        c.setDone(c.getLearnCount() >= c.getTargetCount());
        checkinMapper.updateById(c);
        return c;
    }

    /**
     * 连续打卡天数：从今天（或昨天）往前追溯
     */
    public int streak(Long userId) {
        List<LocalDate> days = doneDates(userId);
        if (days.isEmpty()) {
            return 0;
        }
        LocalDate cursor = LocalDate.now();
        // 今天还没打卡时，从昨天开始算，避免连续记录被误判中断
        if (!days.contains(cursor)) {
            cursor = cursor.minusDays(1);
        }
        int streak = 0;
        while (days.contains(cursor)) {
            streak++;
            cursor = cursor.minusDays(1);
        }
        return streak;
    }

    /**
     * 历史最长连续打卡天数
     */
    public int longestStreak(Long userId) {
        List<LocalDate> days = doneDates(userId);
        if (days.isEmpty()) {
            return 0;
        }
        int best = 1;
        int cur = 1;
        for (int i = 1; i < days.size(); i++) {
            if (days.get(i - 1).minusDays(1).equals(days.get(i))) {
                cur++;
            } else {
                best = Math.max(best, cur);
                cur = 1;
            }
        }
        return Math.max(best, cur);
    }

    /**
     * 达标日期列表（按日期降序）
     */
    public List<LocalDate> doneDates(Long userId) {
        List<Checkin> list = checkinMapper.selectRecent(userId, 1000);
        List<LocalDate> dates = new ArrayList<>();
        for (Checkin c : list) {
            if (Boolean.TRUE.equals(c.getDone())) {
                dates.add(c.getCheckinDate());
            }
        }
        dates.sort(Comparator.reverseOrder());
        return dates;
    }

    /**
     * 最近 N 天记录（用于日历热力图）
     */
    public List<Checkin> recent(Long userId, int days) {
        return checkinMapper.selectRecent(userId, days);
    }

    public int checkinDays(Long userId) {
        Integer n = checkinMapper.countDoneDays(userId);
        return n == null ? 0 : n;
    }
}
