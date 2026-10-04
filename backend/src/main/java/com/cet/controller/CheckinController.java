package com.cet.controller;

import com.cet.common.Result;
import com.cet.common.UserContext;
import com.cet.entity.Checkin;
import com.cet.service.CheckinService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 打卡接口：今日记录、连续天数、历史日历
 */
@RestController
@RequestMapping("/api/checkin")
@RequiredArgsConstructor
public class CheckinController {

    private final CheckinService checkinService;

    /** 今日打卡情况 */
    @GetMapping("/today")
    public Result<Checkin> today() {
        return Result.ok(checkinService.today(UserContext.getUserId(), 20));
    }

    /** 连续打卡 & 最长连续 & 累计天数 */
    @GetMapping("/streak")
    public Result<Map<String, Object>> streak() {
        Long userId = UserContext.getUserId();
        Map<String, Object> data = new HashMap<>();
        data.put("current", checkinService.streak(userId));
        data.put("longest", checkinService.longestStreak(userId));
        data.put("totalDays", checkinService.checkinDays(userId));
        data.put("dates", checkinService.doneDates(userId).stream()
                .map(LocalDate::toString).toList());
        return Result.ok(data);
    }

    /** 最近 N 天记录（用于日历热力图） */
    @GetMapping("/list")
    public Result<List<Checkin>> list(@RequestParam(defaultValue = "30") int days) {
        return Result.ok(checkinService.recent(UserContext.getUserId(), days));
    }
}
