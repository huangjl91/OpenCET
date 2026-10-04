package com.cet;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * OpenCET 后端启动类
 *
 * <p>启动前请确认：
 * <ol>
 *   <li>MySQL 已执行 {@code src/main/resources/db/schema.sql}（建库建表）</li>
 *   <li>MySQL 已执行 {@code src/main/resources/db/data.sql}（种子数据，可选但推荐）</li>
 *   <li>Redis 已启动（未启动时应用仍可运行，仅缓存层自动降级为“不缓存”）</li>
 * </ol>
 */
@MapperScan("com.cet.mapper")
@SpringBootApplication
public class CetApplication {

    public static void main(String[] args) {
        SpringApplication.run(CetApplication.class, args);
    }
}
