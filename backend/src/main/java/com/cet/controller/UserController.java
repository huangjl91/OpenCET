package com.cet.controller;

import com.cet.common.Result;
import com.cet.common.UserContext;
import com.cet.entity.User;
import com.cet.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 用户接口：个人设置与备考等级
 */
@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /** 当前用户资料（不存在则自动建档） */
    @GetMapping("/profile")
    public Result<User> profile() {
        return Result.ok(userService.getById(UserContext.getUserId()));
    }

    /** 更新资料：nickname / currentLevel / dailyGoal / reviewGoal */
    @PutMapping("/profile")
    public Result<User> update(@RequestBody Map<String, Object> body) {
        return Result.ok(userService.updateProfile(UserContext.getUserId(), body));
    }
}
