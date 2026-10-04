package com.cet.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 每日打卡记录
 */
@Data
@TableName("checkin")
public class Checkin {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private LocalDate checkinDate;

    /** 当日新学词数 */
    private Integer learnCount;

    /** 当日复习词数 */
    private Integer reviewCount;

    /** 当日目标量 */
    private Integer targetCount;

    /** 是否达标 */
    private Boolean done;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
