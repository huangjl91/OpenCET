package com.cet.common;

/**
 * 当前请求用户上下文（ThreadLocal）
 *
 * <p>本站为“免注册 + 本地持久化”设计：浏览器首次访问时生成 UUID 写入 localStorage，
 * 每次请求携带 {@code X-User-Token} 头，服务端按需自动建档。
 */
public final class UserContext {

    private static final ThreadLocal<Long> USER_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> TOKEN = new ThreadLocal<>();

    private UserContext() {
    }

    public static void set(Long userId, String token) {
        USER_ID.set(userId);
        TOKEN.set(token);
    }

    public static Long getUserId() {
        return USER_ID.get();
    }

    public static String getToken() {
        return TOKEN.get();
    }

    public static void clear() {
        USER_ID.remove();
        TOKEN.remove();
    }
}
