package com.cet.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cet.common.CacheService;
import com.cet.entity.User;
import com.cet.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 用户服务：本地 Token 免注册，首次访问自动建档
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserMapper userMapper;
    private final CacheService cacheService;

    private static final long USER_CACHE_TTL = 24 * 3600L;

    /**
     * 按 token 取用户，不存在则创建（昵称自动编号）
     */
    @Transactional
    public User getOrCreate(String token) {
        String cacheKey = cacheService.key("user", "token", token);
        User cached = cacheService.get(cacheKey, User.class);
        if (cached != null) {
            return cached;
        }

        User user = userMapper.selectByToken(token);
        if (user == null) {
            user = new User();
            user.setToken(token);
            long seq = userMapper.selectCount(null) + 1;
            user.setNickname("CET 考生 " + seq);
            user.setCurrentLevel("CET4");
            user.setDailyGoal(20);
            user.setReviewGoal(40);
            user.setCreateTime(LocalDateTime.now());
            user.setUpdateTime(LocalDateTime.now());
            userMapper.insert(user);
            log.info("新用户建档：token={}, id={}", token, user.getId());
        }
        cacheService.set(cacheKey, user, USER_CACHE_TTL);
        return user;
    }

    public User getById(Long id) {
        return userMapper.selectById(id);
    }

    /**
     * 更新学习设置（等级、每日目标量、昵称）
     */
    @Transactional
    public User updateProfile(Long userId, Map<String, Object> body) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new com.cet.common.BizException("用户不存在");
        }
        if (body.get("nickname") != null) {
            user.setNickname(String.valueOf(body.get("nickname")));
        }
        if (body.get("currentLevel") != null) {
            user.setCurrentLevel(String.valueOf(body.get("currentLevel")));
        }
        if (body.get("dailyGoal") != null) {
            user.setDailyGoal(toInt(body.get("dailyGoal"), user.getDailyGoal()));
        }
        if (body.get("reviewGoal") != null) {
            user.setReviewGoal(toInt(body.get("reviewGoal"), user.getReviewGoal()));
        }
        user.setUpdateTime(LocalDateTime.now());
        userMapper.updateById(user);
        cacheService.delete(cacheService.key("user", "token", user.getToken()));
        return user;
    }

    private int toInt(Object v, int def) {
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return def;
        }
    }

    public User findByToken(String token) {
        return new LambdaQueryWrapper<User>().eq(User::getToken, token) != null
                ? userMapper.selectByToken(token)
                : null;
    }
}
