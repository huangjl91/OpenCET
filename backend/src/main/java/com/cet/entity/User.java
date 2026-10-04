package com.cet.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户（本地 Token 免注册）
 */
@Data
@TableName("user")
public class User {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 浏览器本地生成的 UUID */
    private String token;

    private String nickname;

    /** CET4 / CET6 */
    private String currentLevel;

    /** 每日新学目标量 */
    private Integer dailyGoal;

    /** 每日复习上限量 */
    private Integer reviewGoal;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
