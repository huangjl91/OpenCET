package com.cet.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * 缓存服务（Redis 封装）
 *
 * <p>设计要点：Redis 不可用时自动降级为“直接查库”，保证应用裸跑也不报错。
 */
@Slf4j
@Component
public class CacheService {

    private static final String PREFIX = "opencet:";

    private final RedisTemplate<String, Object> redisTemplate;

    public CacheService(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public String key(String... parts) {
        return PREFIX + String.join(":", parts);
    }

    @SuppressWarnings("unchecked")
    public <T> T get(String key, Class<T> type) {
        try {
            Object v = redisTemplate.opsForValue().get(key);
            return type.isInstance(v) ? (T) v : null;
        } catch (Exception e) {
            log.debug("Redis 读取失败，降级查库：{}", e.getMessage());
            return null;
        }
    }

    public void set(String key, Object value, long ttlSeconds) {
        try {
            redisTemplate.opsForValue().set(key, value, ttlSeconds, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.debug("Redis 写入失败，已降级：{}", e.getMessage());
        }
    }

    public void delete(String... keys) {
        try {
            if (keys == null || keys.length == 0) {
                return;
            }
            redisTemplate.delete(java.util.Arrays.asList(keys));
        } catch (Exception e) {
            log.debug("Redis 删除失败，已降级：{}", e.getMessage());
        }
    }

    public void deleteByPattern(String pattern) {
        try {
            var keys = redisTemplate.keys(pattern);
            if (keys != null && !keys.isEmpty()) {
                redisTemplate.delete(keys);
            }
        } catch (Exception e) {
            log.debug("Redis 批量删除失败，已降级：{}", e.getMessage());
        }
    }

    /**
     * 缓存旁路（泛型友好版）：命中直接返回，未命中走 loader 并回填
     */
    @SuppressWarnings("unchecked")
    public <T> T getOrLoad(String key, long ttlSeconds, Supplier<T> loader) {
        try {
            Object cached = redisTemplate.opsForValue().get(key);
            if (cached != null) {
                return (T) cached;
            }
        } catch (Exception e) {
            log.debug("Redis 读取失败，降级查库：{}", e.getMessage());
        }
        T loaded = loader.get();
        if (loaded != null) {
            set(key, loaded, ttlSeconds);
        }
        return loaded;
    }
}
