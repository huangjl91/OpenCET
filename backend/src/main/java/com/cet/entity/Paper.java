package com.cet.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 真题试卷
 *
 * <p>注意：本表多个列名（year_month / source / raw_text / total_count / done_count）
 * 命中 MySQL 保留字，必须用反引号显式转义，否则 MyBatis-Plus 自动生成的
 * SELECT/INSERT 会因保留字报 SQLSyntaxErrorException。
 */
@Data
@TableName("paper")
public class Paper {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("`user_id`")
    private Long userId;

    @TableField("`title`")
    private String title;

    @TableField("`level`")
    private String level;

    /** 如 2023-06 */
    @TableField("`year_month`")
    private String yearMonth;

    @TableField("`source`")
    private String source;

    /** 原始粘贴文本，便于二次切分 */
    @TableField("`raw_text`")
    private String rawText;

    @TableField("`total_count`")
    private Integer totalCount;

    @TableField("`done_count`")
    private Integer doneCount;

    @TableField("`create_time`")
    private LocalDateTime createTime;

    @TableField("`update_time`")
    private LocalDateTime updateTime;
}
