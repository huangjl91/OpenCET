package com.cet.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 真题单题
 */
@Data
@TableName(value = "paper_question", autoResultMap = true)
public class PaperQuestion {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long paperId;

    private Long sectionId;

    /** 题号 */
    private Integer orderNo;

    /** 题干 */
    private String stem;

    /** 选项 A/B/C/D */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> options;

    /** 参考答案 */
    private String answer;

    /** 解析 */
    private String analysis;

    private String userAnswer;

    /** 完成状态 */
    private Boolean done;

    /** 收藏 */
    private Boolean favorite;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
