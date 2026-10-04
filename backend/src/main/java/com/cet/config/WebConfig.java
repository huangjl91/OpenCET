package com.cet.config;

import com.cet.common.UserContext;
import com.cet.entity.User;
import com.cet.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.UUID;

/**
 * Web 配置：CORS + 本地用户自动建档拦截器
 */
@Slf4j
@Configuration
public class WebConfig implements WebMvcConfigurer {

    public static final String USER_TOKEN_HEADER = "X-User-Token";

    private final UserService userService;

    public WebConfig(UserService userService) {
        this.userService = userService;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
                    @Override
                    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                        String uri = request.getRequestURI();
                        if (!uri.startsWith("/api/")) {
                            return true;
                        }
                        String token = request.getHeader(USER_TOKEN_HEADER);
                        if (token == null || token.isBlank()) {
                            // 未携带 token 时按临时访客处理，避免 401 打断前端本地模式
                            token = "guest";
                        }
                        User user = userService.getOrCreate(token);
                        UserContext.set(user.getId(), token);
                        return true;
                    }

                    @Override
                    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                                Object handler, Exception ex) {
                        UserContext.clear();
                    }
                })
                .addPathPatterns("/api/**");
    }
}
