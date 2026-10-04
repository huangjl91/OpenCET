package com.cet.controller;

import com.cet.common.Result;
import com.cet.common.UserContext;
import com.cet.dto.StatsVo;
import com.cet.service.StatsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 总览统计
 */
@RestController
@RequestMapping("/api/stats")
@RequiredArgsConstructor
public class StatsController {

    private final StatsService statsService;

    @GetMapping("/overview")
    public Result<StatsVo> overview() {
        return Result.ok(statsService.overview(UserContext.getUserId()));
    }
}
